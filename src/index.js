import { validateAuditRequest } from "./validation.js";
import { STAGES, STAGE_SQL, SALES_COLUMNS, validateLeadUpdate, enrichLead } from "./sales.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const MAX_BODY_BYTES = 12_000;
const LEAD_STATUSES = new Set(STAGES);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  if (!request.body) throw new SyntaxError("Missing body");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RangeError("Request is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function cleanAdminText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function tokensMatch(a, b) {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const aa = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: "Admin access is not configured." }, 503);
  const auth = request.headers.get("authorization") || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!(await tokensMatch(supplied, env.ADMIN_TOKEN))) {
    return json({ error: "Unauthorized." }, 401, { "www-authenticate": "Bearer" });
  }
  return null;
}

async function createAuditRequest(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) return json({ error: "Send this form as JSON." }, 415);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Request is too large." }, 413);

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    if (error instanceof RangeError) return json({ error: "Request is too large." }, 413);
    return json({ error: "Invalid JSON." }, 400);
  }
  if (body && body.companyWebsite) return json({ ok: true }, 201);

  const result = validateAuditRequest(body);
  if (!result.ok) return json({ error: "Please check the highlighted fields.", fields: result.errors }, 422);
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);

  const id = crypto.randomUUID();
  const d = result.data;
  try {
    await env.DB.prepare(`INSERT INTO leads
      (id, contact_name, email, business_name, business_type, location, website, growth_challenge, monthly_customers, consent_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, d.contactName, d.email, d.businessName, d.businessType, d.location, d.website, d.growthChallenge, d.monthlyCustomers, "2026-09-04-v1")
      .run();
    console.log(JSON.stringify({ event: "audit_request_created", leadId: id }));
    return json({ ok: true, reference: id.slice(0, 8) }, 201);
  } catch (error) {
    console.error(JSON.stringify({ event: "audit_request_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "We could not save your request. Please try again shortly." }, 500);
  }
}

async function listLeads(request, env) {
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const view = url.searchParams.get("view") || "all";
  const sort = url.searchParams.get("sort") || "priority";
  const openStage = `${STAGE_SQL} NOT IN ('won','lost','archived')`;
  const views = {
    all: "", open: openStage,
    overdue: `${openStage} AND next_action_date <> '' AND next_action_date < date('now')`,
    today: `${openStage} AND next_action_date = date('now')`,
    unscheduled: `${openStage} AND (next_action_date IS NULL OR next_action_date = '' OR trim(next_action) = '')`,
    proposals: `${openStage} AND proposal_status = 'sent'`,
  };
  const sorts = {
    priority: "CASE COALESCE(priority, 'normal') WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, datetime(created_at) DESC, id",
    due: "CASE WHEN next_action_date IS NULL OR next_action_date = '' THEN 1 ELSE 0 END, next_action_date, id",
    value: `(setup_fee + 12 * monthly_value) * CASE WHEN ${STAGE_SQL} = 'won' THEN 100 WHEN ${STAGE_SQL} IN ('lost','archived') THEN 0 ELSE probability END DESC, id`,
    newest: "datetime(created_at) DESC, id",
  };
  if (!Object.hasOwn(views, view) || !Object.hasOwn(sorts, sort)) return json({ error: "Invalid view or sort." }, 422);
  const query = cleanAdminText(url.searchParams.get("q") || "", 100);
  const limit = Number(url.searchParams.get("limit") || 100);
  const offset = Number(url.searchParams.get("offset") || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0 || offset > 10000000) return json({ error: "Invalid pagination." }, 422);
  if (status && !LEAD_STATUSES.has(status)) return json({ error: "Invalid status filter." }, 422);

  const where = [];
  const binds = [];
  if (views[view]) where.push(`(${views[view]})`);
  if (status && LEAD_STATUSES.has(status)) {
    where.push(`${STAGE_SQL} = ?`);
    binds.push(status);
  }
  if (query) {
    where.push("(business_name LIKE ? OR contact_name LIKE ? OR email LIKE ? OR location LIKE ?)");
    const like = `%${query.replace(/[%_]/g, "")} %`.replace(" %", "%");
    binds.push(like, like, like, like);
  }

  const sql = `SELECT id, created_at, contact_name, email, business_name, business_type, location, website,
    growth_challenge, monthly_customers, consent_version, status,
    COALESCE(priority, 'normal') AS priority, COALESCE(notes, '') AS notes,
    COALESCE(next_action, '') AS next_action, updated_at, ${SALES_COLUMNS}
    FROM leads ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${sorts[sort]} LIMIT ? OFFSET ?`;
  binds.push(limit, offset);

  try {
    const result = await env.DB.prepare(sql).bind(...binds).all();
    return json({ ok: true, leads: (result.results || []).map(enrichLead), hasMore: (result.results || []).length === limit });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_leads_list_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Could not load leads." }, 500);
  }
}

async function updateLead(request, env, id) {
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);

  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return json({ error: "Send JSON." }, 415);
  let body;
  try { body = await readJson(request, 64_000); }
  catch (error) { return json({ error: error instanceof RangeError ? "Request is too large." : "Invalid JSON." }, error instanceof RangeError ? 413 : 400); }
  const validated = validateLeadUpdate(body);
  if (validated.error) return json({ error: validated.error }, 422);
  const updates = Object.keys(validated.data).map(column => `${column} = ?`);
  const binds = Object.values(validated.data);
  const expectedUpdatedAt = request.headers.get("if-match")?.trim() || "";

  // Keep the timestamp readable while adding entropy so two rapid saves still
  // receive different optimistic-lock versions.
  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') || printf('%04dZ', abs(random()) % 10000)");
  binds.push(id);
  if (expectedUpdatedAt) binds.push(expectedUpdatedAt);

  try {
    const where = expectedUpdatedAt ? "WHERE id = ? AND updated_at = ?" : "WHERE id = ?";
    const result = await env.DB.prepare(`UPDATE leads SET ${updates.join(", ")} ${where}`).bind(...binds).run();
    if (!result.meta?.changes) {
      if (!expectedUpdatedAt) return json({ error: "Lead not found." }, 404);
      const current = await env.DB.prepare("SELECT id FROM leads WHERE id = ?").bind(id).first();
      return current ? json({ error: "This lead changed in another session. Refresh before saving." }, 409) : json({ error: "Lead not found." }, 404);
    }
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_lead_update_failed", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "Could not update the lead." }, 500);
  }
}

async function salesSummary(env) {
  if (!env.DB) return json({ error: "Lead storage is not configured." }, 503);
  try {
    const result = await env.DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN stage = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) AS high_count,
      SUM(CASE WHEN stage NOT IN ('won','lost','archived') THEN setup_fee + 12 * monthly_value ELSE 0 END) AS pipeline_value,
      SUM(CASE WHEN stage NOT IN ('won','lost','archived') THEN (setup_fee + 12 * monthly_value) * probability / 100.0 ELSE 0 END) AS expected_value,
      SUM(CASE WHEN stage = 'won' THEN setup_fee ELSE 0 END) AS won_setup,
      SUM(CASE WHEN stage = 'won' THEN monthly_value ELSE 0 END) AS won_mrr,
      SUM(CASE WHEN stage NOT IN ('won','lost','archived') AND next_action_date <> '' AND next_action_date < date('now') THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN stage NOT IN ('won','lost','archived') AND next_action_date = date('now') THEN 1 ELSE 0 END) AS due_today,
      SUM(CASE WHEN stage NOT IN ('won','lost','archived') AND (next_action_date IS NULL OR next_action_date = '' OR trim(next_action) = '') THEN 1 ELSE 0 END) AS unscheduled,
      SUM(CASE WHEN stage NOT IN ('won','lost','archived') AND proposal_status = 'sent' THEN 1 ELSE 0 END) AS sent_proposals,
      ${STAGES.map(stage => `SUM(CASE WHEN stage = '${stage}' THEN 1 ELSE 0 END) AS stage_${stage}`).join(', ')}
      FROM (SELECT *, ${STAGE_SQL} AS stage FROM leads)`).first();
    return json({ ok: true, summary: result });
  } catch { return json({ error: "Could not load sales summary. Check the V11 migration has been applied." }, 500); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/")) {
      const denied = await requireAdmin(request, env);
      if (denied) return denied;
    }
    if (url.pathname === "/api/admin/summary") {
      if (request.method === "GET") return salesSummary(env);
      return json({ error: "Method not allowed." }, 405, { allow: "GET" });
    }
    if (url.pathname === "/api/audit-request") {
      if (request.method === "POST") return createAuditRequest(request, env);
      return json({ error: "Method not allowed." }, 405, { allow: "POST" });
    }
    if (url.pathname === "/api/admin/leads") {
      if (request.method === "GET") return listLeads(request, env);
      return json({ error: "Method not allowed." }, 405, { allow: "GET" });
    }
    const leadMatch = url.pathname.match(/^\/api\/admin\/leads\/([0-9a-f-]{36})$/i);
    if (leadMatch) {
      if (request.method === "PATCH") return updateLead(request, env, leadMatch[1]);
      return json({ error: "Method not allowed." }, 405, { allow: "PATCH" });
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return env.ASSETS.fetch(request);
  },
};
