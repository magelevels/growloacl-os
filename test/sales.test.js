import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { STAGES, validateLeadUpdate, enrichLead } from '../src/sales.js';
import { proposalText, csvCell, leadsCsv } from '../public/admin/proposal.js';

const id = '11111111-1111-4111-8111-111111111111';
const migration = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
function fixture({ migrate = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(migration('0001_create_leads.sql'));
  db.exec(migration('0002_lead_ops.sql'));
  db.prepare(`INSERT INTO leads (id,contact_name,email,business_name,business_type,location,growth_challenge,consent_version,status,notes,next_action) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,'Test Contact','test@example.com','Test Café','Café','London','More repeat visits','v1','closed','Keep private notes','Keep action');
  if (migrate) db.exec(migration('0003_sales_conversion.sql'));
  const env = { ADMIN_TOKEN: 'test-only-token', ASSETS: { fetch: async () => new Response('public asset') }, DB: {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const bound = values => ({
        async run() { const result = stmt.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
        async all() { return { results: stmt.all(...values) }; },
        async first() { return stmt.get(...values) || null; },
      });
      return { ...bound([]), bind: (...values) => bound(values) };
    },
  } };
  return { db, env };
}
const req = (path, method = 'GET', body, token = 'test-only-token', headers = {}) => new Request(`https://example.test${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const patch = (env, body) => worker.fetch(req(`/api/admin/leads/${id}`, 'PATCH', body), env);

test('ALTER migration preserves every original field and legacy closed status', () => {
  const { db } = fixture({ migrate: false });
  const before = db.prepare('SELECT * FROM leads').get();
  db.exec(migration('0003_sales_conversion.sql'));
  const after = db.prepare('SELECT * FROM leads').get();
  for (const [key, value] of Object.entries(before)) assert.equal(after[key], value, key);
  assert.equal(after.pipeline_stage, 'archived');
  assert.equal(after.setup_fee, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM leads').get().count, 1);
  assert.throws(() => db.exec(migration('0003_sales_conversion.sql')), /duplicate column/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM leads').get().count, 1);
  db.close();
});

test('migration backfills all V10 stages without inferring a win or loss', () => {
  const { db } = fixture({ migrate: false });
  for (const status of ['new','contacted','qualified','archived']) db.exec(`INSERT INTO leads SELECT '${status}',created_at,contact_name,email,business_name,business_type,location,website,growth_challenge,monthly_customers,consent_version,'${status}',priority,notes,next_action,updated_at FROM leads WHERE id='${id}'`);
  db.exec(migration('0003_sales_conversion.sql'));
  for (const row of db.prepare('SELECT * FROM leads').all()) assert.equal(row.pipeline_stage, row.status === 'closed' ? 'archived' : row.status);
  db.close();
});

test('all admin API routes and methods require the token before accessing D1', async () => {
  const { env, db } = fixture();
  for (const path of ['/api/admin/leads', `/api/admin/leads/${id}`, '/api/admin/summary', '/api/admin/unknown']) {
    for (const method of ['GET','PATCH','POST','DELETE']) {
      for (const token of ['', 'incorrect']) {
        const r = await worker.fetch(req(path, method, undefined, token), { ...env, DB: { prepare() { throw new Error('Must not read database'); } } });
        assert.equal(r.status, 401, `${method} ${path}`);
        assert.equal(r.headers.get('cache-control'), 'no-store');
      }
    }
  }
  assert.equal((await worker.fetch(req('/api/admin/summary'), { ...env, ADMIN_TOKEN: '' })).status, 503);
  db.close();
});

test('every V11 stage round-trips through the real SQL and V10 CHECK constraint', async () => {
  const { env, db } = fixture();
  for (const status of STAGES) {
    assert.equal((await patch(env, { status })).status, 200);
    const data = await (await worker.fetch(req('/api/admin/leads'), env)).json();
    assert.equal(data.leads[0].status, status);
    assert.equal(db.prepare('SELECT notes FROM leads').get().notes, 'Keep private notes');
  }
  db.close();
});

test('commercial and workspace fields persist, dates clear, and expected value is derived', async () => {
  const { env, db } = fixture();
  const body = { status: 'qualified', priority: 'high', setupFee: 1000, monthlyValue: 200, probability: 50, nextActionDate: '2026-10-01', qualification: ['budget_confirmed','decision_maker'], prospectNotes: 'Private research', auditFindings: 'Evidence\nSecond line', auditRecommendations: 'Improve booking', proposalStatus: 'draft', proposalScope: 'Booking page', proposalTerms: 'Monthly in advance', proposalValidUntil: '2026-10-15', notes: 'Keep\nnewlines', nextAction: 'Call' };
  assert.equal((await patch(env, body)).status, 200);
  const lead = (await (await worker.fetch(req('/api/admin/leads'), env)).json()).leads[0];
  assert.equal(lead.expected_value, 1700); assert.equal(lead.qualification_score, 40);
  assert.equal(lead.audit_findings, body.auditFindings); assert.equal(lead.proposal_terms, body.proposalTerms);
  assert.equal((await patch(env, { nextActionDate: null, proposalValidUntil: '' })).status, 200);
  assert.equal(db.prepare('SELECT next_action_date FROM leads').get().next_action_date, null);
  assert.equal(lead.notes, 'Keep\nnewlines');
  db.close();
});

test('rejects malformed admin inputs without modifying a lead', async () => {
  const { env, db } = fixture();
  const before = db.prepare('SELECT * FROM leads').get();
  for (const body of [null, [], 'text', {}, { status: 'closed' }, { probability: 101 }, { probability: 1.5 }, { setupFee: -1 }, { monthlyValue: '200' }, { nextActionDate: '2026-02-30' }, { nextActionDate: 'tomorrow' }, { nextActionDate: '2026-13-01' }, { qualification: ['unknown'] }, { qualification: ['budget_confirmed','budget_confirmed'] }, { notes: 123 }, { proposalTerms: 'x'.repeat(4001) }, { id: 'overwrite' }, { expectedValue: 999 }, { proposalStatus: 'paid' }]) {
    assert.equal((await patch(env, body)).status, 422, JSON.stringify(body).slice(0, 100));
  }
  assert.deepEqual(db.prepare('SELECT * FROM leads').get(), before);
  assert.equal(validateLeadUpdate({ setupFee: Infinity }).error, 'Invalid setupFee.');
  assert.equal((await worker.fetch(req(`/api/admin/leads/${id}`, 'PATCH', {}, undefined, { 'content-type': 'text/plain' }), env)).status, 415);
  assert.equal((await patch(env, { notes: 'x'.repeat(64001) })).status, 413);
  const malformed = new Request(`https://example.test/api/admin/leads/${id}`, { method: 'PATCH', headers: { authorization: 'Bearer test-only-token', 'content-type': 'application/json' }, body: '{' });
  assert.equal((await worker.fetch(malformed, env)).status, 400);
  db.close();
});

test('summary spans more than one page and excludes closed opportunities from open forecasts', async () => {
  const { env, db } = fixture();
  await patch(env, { status: 'qualified', setupFee: 1000, monthlyValue: 200, probability: 50, nextActionDate: '2000-01-01' });
  const insert = db.prepare(`INSERT INTO leads (id,contact_name,email,business_name,business_type,location,growth_challenge,consent_version,pipeline_stage,setup_fee,monthly_value,probability) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < 205; i++) insert.run(String(i),'Contact','x@example.com','Other Café','Café','London','Growth','v1','new',100,10,25);
  insert.run('won','Contact','x@example.com','Won','Café','London','Growth','v1','won',500,50,0);
  insert.run('lost','Contact','x@example.com','Lost','Café','London','Growth','v1','lost',99999,99999,100);
  const first = await (await worker.fetch(req('/api/admin/leads?limit=200'), env)).json();
  const second = await (await worker.fetch(req('/api/admin/leads?limit=200&offset=200'), env)).json();
  assert.equal(first.leads.length, 200); assert.equal(second.leads.length, 8);
  assert.equal(new Set([...first.leads, ...second.leads].map(l => l.id)).size, 208);
  const { summary } = await (await worker.fetch(req('/api/admin/summary'), env)).json();
  assert.equal(summary.total, 208); assert.equal(summary.pipeline_value, 3400 + 205 * 220);
  assert.equal(summary.expected_value, 1700 + 205 * 55); assert.equal(summary.won_setup, 500); assert.equal(summary.won_mrr, 50); assert.equal(summary.overdue, 1);
  const filtered = await (await worker.fetch(req('/api/admin/leads?status=won&q=Won'), env)).json();
  assert.equal(filtered.leads.length, 1); assert.equal(filtered.leads[0].expected_value, 1100);
  for (const query of ['limit=NaN','limit=1.5','limit=201','offset=-1','status=closed']) assert.equal((await worker.fetch(req(`/api/admin/leads?${query}`), env)).status, 422);
  db.close();
});

test('public submission works after migration and has a new sales stage through fallback', async () => {
  const { env, db } = fixture();
  const response = await worker.fetch(req('/api/audit-request', 'POST', { contactName:'Public Contact',email:'public@example.com',businessName:'New Café',businessType:'Café',location:'London',growthChallenge:'We need more repeat customers',consent:true }, ''), env);
  assert.equal(response.status, 201);
  const data = await (await worker.fetch(req('/api/admin/leads?status=new'), env)).json();
  assert.equal(data.leads.length, 1); assert.equal(data.leads[0].status, 'new');
  for (const path of ['/api/audit-request','/api/leads',`/api/leads/${id}`]) assert.ok([404,405].includes((await worker.fetch(req(path,'GET',undefined,''),env)).status));
  db.close();
});

test('missing lead and storage failures return safe errors', async () => {
  const { env, db } = fixture();
  assert.equal((await worker.fetch(req('/api/admin/leads/22222222-2222-4222-8222-222222222222','PATCH',{ notes: 'x' }), env)).status,404);
  for (const path of ['/api/admin/summary','/api/admin/leads']) assert.equal((await worker.fetch(req(path), { ...env, DB: null })).status,503);
  db.close();
});

test('proposal uses edited commercial data and excludes private notes, checklist and probability', () => {
  const text = proposalText({ business_name: 'Client Café', contact_name: 'Sam', email: 'sam@example.com', setup_fee: 1000, monthly_value: 200, audit_findings: 'Observed problem', audit_recommendations:'Recommendation', proposal_scope:'Agreed deliverables', proposal_terms:'VAT to be agreed', proposal_valid_until:'2026-10-01', notes:'SECRET NOTES', prospect_notes:'SECRET RESEARCH', probability: 75 });
  for (const expected of ['Client Café','£1,000.00','£200.00','£3,400.00','Agreed deliverables','VAT to be agreed','2026-10-01']) assert.ok(text.includes(expected));
  assert.ok(!text.includes('SECRET')); assert.ok(!text.includes('75'));
  assert.match(proposalText({}), /to be confirmed|to be agreed/);
});

test('CSV export escapes cells and includes the operational lead fields', () => {
  assert.equal(csvCell('Cafe, "North"'), '"Cafe, ""North"""');
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
  assert.equal(csvCell('=HYPERLINK("https://example.test")'), '"\'=HYPERLINK(""https://example.test"")"');
  assert.equal(csvCell('@mention'), "'@mention");
  const csv = leadsCsv([{ business_name: 'Test Café', contact_name: 'Taylor', email: 'taylor@example.com', location: 'Northampton', status: 'contacted', priority: 'high', setup_fee: 1000, monthly_value: 200, probability: 50, expected_value: 1700, next_action: 'Call, then email', next_action_date: '2026-10-01', qualification_score: 60, proposal_status: 'draft', created_at: '2026-09-15T10:00:00Z', updated_at: '2026-09-15T11:00:00Z' }]);
  assert.match(csv, /^Business,Contact,Email,/);
  assert.match(csv, /"Call, then email"/);
  assert.match(csv, /Test Café,Taylor,taylor@example.com,Northampton,contacted,high,1000,200,50,1700,/);
  assert.ok(csv.endsWith('\r\n'));
});

test('qualification and terminal probability are derived defensively', () => {
  for (const qualification of ['invalid', '{}', '["budget_confirmed","budget_confirmed","bad"]']) {
    const lead = enrichLead({ status:'new', qualification });
    assert.ok([0,20].includes(lead.qualification_score));
  }
  assert.equal(enrichLead({ status:'closed', pipeline_stage:'won', setup_fee:100, probability:0 }).expected_value,100);
  assert.equal(enrichLead({ status:'closed', pipeline_stage:'lost', setup_fee:100, probability:100 }).expected_value,0);
});

test('follow-up views use the full database and exclude terminal leads', async () => {
  const { env, db } = fixture();
  await patch(env, { status: 'qualified', nextAction: 'Call', nextActionDate: '2000-01-01', proposalStatus: 'sent' });
  const insert = db.prepare(`INSERT INTO leads (id,contact_name,email,business_name,business_type,location,growth_challenge,consent_version,pipeline_stage,next_action,next_action_date,proposal_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const today = new Date().toISOString().slice(0,10);
  for (let i = 0; i < 205; i++) insert.run(String(i), 'Contact','x@example.com','Unscheduled','Café','London','Growth','v1','new','','', 'not_started');
  insert.run('today', 'Contact','x@example.com','Today','Café','London','Growth','v1','contacted','Call',today,'not_started');
  insert.run('won', 'Contact','x@example.com','Won','Café','London','Growth','v1','won','Call','2000-01-01','sent');
  insert.run('no-action', 'Contact','x@example.com','No action text','Café','London','Growth','v1','contacted','',today,'not_started');
  for (const [view, count] of [['overdue',1],['today',2],['proposals',1]]) {
    const data = await (await worker.fetch(req(`/api/admin/leads?view=${view}&limit=200`), env)).json();
    assert.equal(data.leads.length,count,view); assert.ok(data.leads.every(l=>l.status !== 'won'));
  }
  const page = await (await worker.fetch(req('/api/admin/leads?view=unscheduled&limit=200&offset=200'),env)).json();
  assert.equal(page.leads.length,6);
  const {summary} = await (await worker.fetch(req('/api/admin/summary'),env)).json();
  assert.equal(summary.unscheduled,206); assert.equal(summary.due_today,2); assert.equal(summary.sent_proposals,1); assert.equal(summary.stage_won,1); assert.equal(summary.stage_new,205);
  db.close();
});

test('safe sort options order by deadline and effective expected value', async () => {
  const { env, db } = fixture();
  await patch(env,{status:'qualified', setupFee:1000, probability:50, nextActionDate:'2026-10-01'});
  db.prepare(`INSERT INTO leads (id,contact_name,email,business_name,business_type,location,growth_challenge,consent_version,pipeline_stage,setup_fee,probability,next_action_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run('other','Contact','other@example.com','Other','Café','London','Growth','v1','won',800,0,'2026-09-01');
  for (const sort of ['due','value']) {
    const {leads} = await (await worker.fetch(req(`/api/admin/leads?sort=${sort}`),env)).json();
    assert.equal(leads[0].id,'other',sort);
  }
  for (const query of ['view=unknown','sort=unknown','sort=setup_fee%3BDELETE%20FROM%20leads','view=__proto__']) assert.equal((await worker.fetch(req(`/api/admin/leads?${query}`),env)).status,422);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n,2);
  db.close();
});

test('proposal readiness and date shortcuts are based on explicit data and UTC', async () => {
  const {proposalReadiness,deadlineInDays} = await import('../public/admin/proposal.js');
  assert.equal(proposalReadiness({}).filter(([,done])=>done).length,0);
  assert.equal(proposalReadiness({audit_findings:'Evidence',audit_recommendations:'Fix',proposal_scope:'Scope',proposal_terms:'Terms',monthly_value:200,proposal_valid_until:'2026-10-01'}).filter(([,done])=>done).length,6);
  assert.equal(deadlineInDays(1,new Date('2026-12-31T23:59:00Z')),'2027-01-01');
  assert.equal(deadlineInDays(7,new Date('2026-09-06T00:01:00Z')),'2026-09-13');
});
