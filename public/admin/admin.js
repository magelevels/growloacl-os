import { STAGES, CHECKLIST, money, proposalText, proposalReadiness, deadlineInDays, leadsCsv } from "./proposal.js";
const $ = s => document.querySelector(s);
const IDLE_LOCK_MS = 30 * 60 * 1000;
const state = { token: sessionStorage.getItem("growlocal_admin_token") || "", leads: [], selected: null, summary: {}, offset: 0, hasMore: false, dirty: false, busy: false, view: "all", tab: "opportunity", filters: { q: "", status: "", sort: "priority", view: "all", offset: 0 } };
let idleTimer;
const loginPanel = $("#loginPanel"), appPanel = $("#appPanel"), leadList = $("#leadList"), detailPanel = $("#detailPanel"), errorBox = $("#errorBox");
function esc(value = "") { return String(value ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])); }
function dateLabel(v) { if (!v) return "—"; try { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v)); } catch { return esc(v); } }
function ageLabel(v) { const time = new Date(v || "").getTime(); if (!Number.isFinite(time)) return ""; const days = Math.max(0, Math.floor((Date.now() - time) / 86400000)); return days === 0 ? "Today" : days === 1 ? "1 day old" : days < 30 ? `${days} days old` : `${Math.floor(days / 30)} mo old`; }
function armIdleLock() { clearTimeout(idleTimer); if (!state.token || appPanel.hidden) return; idleTimer = setTimeout(() => lock("Locked after 30 minutes of inactivity. Sign in again to continue."), IDLE_LOCK_MS); }
function lock(message = "") { clearTimeout(idleTimer); sessionStorage.removeItem("growlocal_admin_token"); state.token = ""; state.leads = []; state.selected = null; state.dirty = false; detailPanel.replaceChildren(); leadList.replaceChildren(); $("#stats").replaceChildren(); $("#pipeline").replaceChildren(); $("#focusViews").replaceChildren(); $("#tokenInput").value = ""; appPanel.hidden = true; loginPanel.hidden = false; $("#lockBtn").hidden = true; if (message) $("#loginMessage").textContent = message; }
async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { "content-type": "application/json", authorization: `Bearer ${state.token}`, ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { lock(); throw new Error("That admin token was not accepted. Please sign in again."); }
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function showError(msg) { errorBox.hidden = false; errorBox.textContent = msg; $("#loginMessage").textContent = msg; }
function stats() {
  const s = state.summary;
  $("#stats").innerHTML = [[money(s.pipeline_value), "Open pipeline", "First-year fees", "pipeline"], [money(s.expected_value), "Weighted forecast", "Probability adjusted", "forecast"], [money(s.won_mrr), "Won monthly revenue", "Recurring fees · not cash collected", "won"], [money(s.won_setup), "Won setup fees", "One-off contracted value", "setup"]].map(([v, label, note, kind]) => `<div class="stat stat-${kind}"><span class="stat-label">${label}</span><strong>${esc(v)}</strong><span>${note}</span></div>`).join("");
  $("#pipeline").innerHTML = STAGES.map(stage => `<button class="stage-card stage-${stage}" type="button" data-stage="${stage}" aria-pressed="${$("#statusFilter").value === stage}"><span class="stage-dot"></span><span>${stage.replaceAll("_", " ")}</span><strong>${s[`stage_${stage}`] || 0}</strong></button>`).join("");
  $("#pipeline").querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => {
    if (state.busy || !canLeave()) return;
    $("#statusFilter").value = $("#statusFilter").value === button.dataset.stage ? "" : button.dataset.stage;
    state.view = "all"; navigate(0, true);
  }));
  const views = [["all", "All leads", s.total], ["overdue", "Overdue", s.overdue], ["today", "Due today", s.due_today], ["unscheduled", "Needs next action", s.unscheduled], ["proposals", "Proposals to follow up", s.sent_proposals]];
  $("#focusViews").innerHTML = views.map(([key, label, count]) => `<button type="button" data-view="${key}" aria-pressed="${state.view === key}" class="focus-chip ${key === 'overdue' && count ? 'needs-attention' : ''}">${label}<span>${count || 0}</span></button>`).join("");
  $("#focusViews").querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    if (state.busy || !canLeave()) return;
    state.view = button.dataset.view; $("#statusFilter").value = ""; navigate(0, true);
  }));
}
function overdue(l) { return !["won", "lost", "archived"].includes(l.status) && l.next_action_date && l.next_action_date < new Date().toISOString().slice(0, 10); }
function renderList() {
  leadList.innerHTML = state.leads.length ? state.leads.map(l => `<button type="button" class="lead-row ${state.selected === l.id ? "active" : ""}" data-id="${esc(l.id)}"><span class="lead-head"><span><strong>${esc(l.business_name)}</strong><span class="lead-meta">${esc(l.contact_name)} · ${esc(l.location)} · ${dateLabel(l.created_at)}</span></span><span class="pill stage-${esc(l.status)}">${esc(l.status.replaceAll("_", " "))}</span></span><span class="tags"><span class="tag ${esc(l.priority)}">${esc(l.priority)} priority</span><span class="tag">${money(l.setup_fee)} + ${money(l.monthly_value)}/mo</span><span class="tag">Qualified ${l.qualification_score}%</span>${ageLabel(l.created_at) ? `<span class="tag age-tag">${ageLabel(l.created_at)}</span>` : ""}${l.next_action ? `<span class="tag">Next: ${esc(l.next_action)}</span>` : ""}${l.next_action_date ? `<span class="tag ${overdue(l) ? "overdue" : ""}">${overdue(l) ? "Overdue · " : "Due · "}${esc(l.next_action_date)}</span>` : ""}</span></button>`).join("") : '<div class="empty-list"><span class="empty-symbol">✓</span><h3>No leads in this view</h3><p class="lead-meta">Try another stage or reset the filters to see your full inbox.</p></div>';
  leadList.querySelectorAll("[data-id]").forEach(el => el.addEventListener("click", () => { if (!state.busy && canLeave()) { selectLead(el.dataset.id); if (window.matchMedia("(max-width: 950px)").matches) detailPanel.scrollIntoView({ behavior: "smooth", block: "start" }); } }));
  $("#previousBtn").disabled = state.offset === 0;
  $("#nextBtn").disabled = !state.hasMore;
  $("#pageLabel").textContent = state.leads.length ? `${state.offset + 1}–${state.offset + state.leads.length} · use search to find any lead` : "No results";
}
function canLeave() { return !state.dirty || confirm("Discard unsaved lead changes?"); }
const options = (values, selected) => values.map(v => `<option value="${v}" ${v === selected ? "selected" : ""}>${v.replaceAll("_", " ")}</option>`).join("");
function textArea(id, label, value, max = 4000) { return `<label>${label}<textarea id="${id}" maxlength="${max}">${esc(value)}</textarea></label>`; }
function auditBrief(l){const challenge=l.growth_challenge||"No challenge supplied.";return `PROSPECT BRIEF — ${l.business_name}\n\nBusiness: ${l.business_type} in ${l.location}\nContact: ${l.contact_name} (${l.email})\nMonthly customers: ${l.monthly_customers||"Not supplied"}\nPrimary challenge: ${challenge}\n\nAudit priorities\n1. Visibility — verify local search, social discovery and proof.\n2. Conversion — identify one clear offer and remove friction from enquiry/purchase.\n3. Retention — create a reason for a first-time customer to return within 14–30 days.\n4. Reputation — build a consistent review request and response loop.\n\nRecommended next action: ${l.next_action||"Review the business presence and prepare three evidence-backed opportunities before outreach."}`;}
function selectLead(id) {
  state.selected = id; state.dirty = false; renderList();
  const l = state.leads.find(x => x.id === id);
  if (!l) { detailPanel.className = "detail empty"; detailPanel.textContent = "Select a lead to review the enquiry and plan the next move."; return; }
  detailPanel.className = "detail";
  const safeWebsite = /^https?:\/\//i.test(l.website || "") ? l.website : "";
  detailPanel.innerHTML = `<div class="detail-head"><div><p class="eyebrow">SALES WORKSPACE</p><h2>${esc(l.business_name)}</h2></div><span class="pill stage-${esc(l.status)}">${esc(l.status.replaceAll("_", " "))}</span></div>
  <div class="workspace-tabs" role="tablist" aria-label="Lead workspace">
    <button type="button" role="tab" id="tab-opportunity" data-tab="opportunity" aria-controls="panel-opportunity" aria-selected="false" tabindex="-1">Opportunity</button>
    <button type="button" role="tab" id="tab-audit" data-tab="audit" aria-controls="panel-audit" aria-selected="false" tabindex="-1">Audit & fit</button>
    <button type="button" role="tab" id="tab-proposal" data-tab="proposal" aria-controls="panel-proposal" aria-selected="false" tabindex="-1">Proposal</button>
  </div>
  <form id="leadForm"><fieldset id="editFields"><section id="panel-opportunity" role="tabpanel" aria-labelledby="tab-opportunity" data-panel="opportunity" tabindex="0">
  <div class="detail-grid"><div class="field"><span>Contact</span>${esc(l.contact_name)}<br><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></div><div class="field"><span>Business</span>${esc(l.business_type)} · ${esc(l.location)}</div><div class="field"><span>Monthly customers</span>${esc(l.monthly_customers || "Not supplied")}</div><div class="field"><span>Submitted</span>${dateLabel(l.created_at)}</div></div>
  <div class="challenge"><strong>Growth challenge</strong><p>${esc(l.growth_challenge)}</p>${safeWebsite ? `<a href="${esc(safeWebsite)}" target="_blank" rel="noopener noreferrer">Open website ↗</a>` : ""}</div>
  <div class="section-heading"><h3>Pipeline & next action</h3><button class="ghost stage-advance" id="advanceBtn" type="button"></button></div><div class="detail-grid"><label>Stage<select id="editStatus">${options(STAGES, l.status)}</select></label><label>Priority<select id="editPriority">${options(["low", "normal", "high"], l.priority)}</select></label></div>
  <label>Next action<input id="editNext" maxlength="500" value="${esc(l.next_action)}" placeholder="e.g. Call to agree audit review" /></label><label>Action deadline (UTC date)<input type="date" id="editDate" min="2000-01-01" max="9999-12-31" value="${esc(l.next_action_date)}" /></label><div class="date-shortcuts" aria-label="Set action deadline"><span>Quick schedule</span><button type="button" class="ghost" data-days="0">Today</button><button type="button" class="ghost" data-days="1">Tomorrow</button><button type="button" class="ghost" data-days="7">In a week</button></div>
  <h3>Opportunity · GBP</h3><div class="detail-grid"><label>Setup fee (£)<input id="editSetup" type="number" min="0" max="100000000" step="0.01" required value="${l.setup_fee || 0}" /></label><label>Monthly recurring (£)<input id="editMonthly" type="number" min="0" max="100000000" step="0.01" required value="${l.monthly_value || 0}" /></label><label>Win probability (%)<input id="editProbability" type="number" min="0" max="100" step="1" required value="${l.probability || 0}" /></label><div class="field"><span>Weighted first-year value</span><output id="expectedValue"></output></div></div><p class="lead-meta">(Setup + 12 × monthly) × probability. Won uses 100%; lost and archived use 0%. These are forecasts, not collected revenue.</p>
  ${textArea("editNotes", "Private notes", l.notes)}</section><section id="panel-audit" role="tabpanel" aria-labelledby="tab-audit" data-panel="audit" tabindex="0"><p class="workspace-intro">Build the evidence for a useful conversation. Confirm the fit, then turn your research into a clear recommendation.</p><h3>Qualification · <output id="qualificationScore">${l.qualification_score}%</output></h3><div class="checklist">${Object.entries(CHECKLIST).map(([key, label]) => `<label><input type="checkbox" name="qualification" value="${key}" ${l.qualification.includes(key) ? "checked" : ""}>${label}</label>`).join("")}</div>
  <div class="audit-fields"><h3>Prospect & audit workspace</h3>${textArea("editProspect", "Prospect research (private)", l.prospect_notes)}${textArea("editFindings", "Audit findings / evidence (included in proposal)", l.audit_findings)}${textArea("editRecommendations", "Audit recommendations (included in proposal)", l.audit_recommendations)}</div></section>
  <section id="panel-proposal" role="tabpanel" aria-labelledby="tab-proposal" data-panel="proposal" tabindex="0"><div class="proposal-readiness" id="proposalReadiness"></div><h3>Proposal & commercial terms</h3><label>Proposal status<select id="editProposalStatus">${options(["not_started", "draft", "sent", "accepted", "declined"], l.proposal_status)}</select></label><label>Proposal valid until<input type="date" min="2000-01-01" max="9999-12-31" id="editValid" value="${esc(l.proposal_valid_until)}" /></label>${textArea("editScope", "Scope, deliverables & exclusions", l.proposal_scope)}${textArea("editTerms", "Payment, term, cancellation & VAT", l.proposal_terms)}<p class="lead-meta">Proposal status and sales stage are edited separately. Generating a draft does not send it or mark the lead won.</p><button type="button" class="ghost" id="proposalBtn">Generate proposal draft</button><div id="proposalPanel" hidden><label>Draft preview<textarea id="proposalPreview" readonly></textarea></label><button class="ghost" type="button" id="copyProposalBtn">Copy draft</button><button class="ghost" type="button" id="downloadProposalBtn">Download .txt</button><p class="lead-meta">Review the wording before sharing. Save lead to retain the underlying terms and audit fields.</p></div></section>
  <div class="save-bar"><div class="detail-actions"><button class="primary" id="saveBtn" type="submit">Save lead</button><button type="button" class="ghost" id="briefBtn">Copy prospect brief</button><a class="ghost" href="mailto:${esc(l.email)}">Email lead</a></div><p id="saveMessage" role="status">All changes saved</p></div></fieldset></form><div class="brief" id="briefBox" hidden></div>`;
  $("#leadForm").addEventListener("submit", e => { e.preventDefault(); saveSelected(); });
  $("#leadForm").addEventListener("input", markDirty);
  $("#leadForm").addEventListener("invalid", event => { const panel = event.target.closest('[data-panel]'); if (panel) showTab(panel.dataset.panel); }, true);
  detailPanel.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
    button.addEventListener('keydown', event => {
      const tabs = ['opportunity','audit','proposal'];
      if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        event.preventDefault();
        const index = tabs.indexOf(button.dataset.tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        showTab(tabs[next]); $(`#tab-${tabs[next]}`).focus();
      }
    });
  });
  detailPanel.querySelectorAll('[data-days]').forEach(button => button.addEventListener('click', () => { $("#editDate").value = deadlineInDays(Number(button.dataset.days)); markDirty(); }));
  $("#advanceBtn").addEventListener('click', () => { if (state.busy) return; const next = nextStage($("#editStatus").value); if (next) { $("#editStatus").value = next; markDirty(); } });
  showTab(state.tab);
  $("#briefBtn").addEventListener("click", copyBrief);
  $("#proposalBtn").addEventListener("click", () => { if (!$("#leadForm").reportValidity()) return; $("#proposalPreview").value = proposalText(formLead(l)); $("#proposalPanel").hidden = false; });
  $("#copyProposalBtn").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#proposalPreview").value); $("#saveMessage").textContent = "Proposal draft copied."; } catch { $("#proposalPreview").select(); $("#saveMessage").textContent = "Select and copy the draft manually."; } });
  $("#downloadProposalBtn").addEventListener("click", () => { const url = URL.createObjectURL(new Blob([$("#proposalPreview").value], { type: "text/plain;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "GrowLocal-proposal-draft.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  updateCalculations();
}
function showTab(tab) {
  state.tab = tab;
  detailPanel.querySelectorAll('[data-tab]').forEach(button => { const active = button.dataset.tab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
  detailPanel.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
}
function markDirty() { state.dirty = true; $("#saveMessage").textContent = "Unsaved changes"; $("#proposalPanel").hidden = true; updateCalculations(); }
function nextStage(stage) { const flow = ['new','contacted','qualified','audit_ready','proposal_sent','won']; const i = flow.indexOf(stage); return i >= 0 ? flow[i + 1] : null; }
function updateCalculations() {
  const stage = $("#editStatus").value;
  const next = nextStage(stage);
  $("#advanceBtn").hidden = !next;
  $("#advanceBtn").textContent = next ? `Move to ${next.replaceAll('_', ' ')} →` : '';
  const checks = proposalReadiness(formLead(state.leads.find(l => l.id === state.selected)));
  const ready = checks.filter(([, done]) => done).length;
  $("#proposalReadiness").innerHTML = `<div class="section-heading"><strong>Ready to propose?</strong><span>${ready}/${checks.length} prepared</span></div><div class="readiness-track"><span style="width:${ready / checks.length * 100}%"></span></div><div class="readiness-items">${checks.map(([label, done]) => `<span class="${done ? 'complete' : ''}">${done ? '✓' : '○'} ${label}</span>`).join('')}</div><p class="lead-meta">A preparation guide. Review the final draft before sharing.</p>`;
  const fixed = ["won", "lost", "archived"].includes(stage);
  $("#editProbability").disabled = fixed;
  const probability = fixed ? (stage === "won" ? 100 : 0) : Number($("#editProbability").value);
  $("#expectedValue").textContent = money((Number($("#editSetup").value) + 12 * Number($("#editMonthly").value)) * probability / 100);
  $("#qualificationScore").textContent = `${document.querySelectorAll('[name="qualification"]:checked').length * 20}%`;
}
function payload() {
  const status = $("#editStatus").value;
  return { status, priority: $("#editPriority").value, nextAction: $("#editNext").value, nextActionDate: $("#editDate").value || null,
    setupFee: Number($("#editSetup").value), monthlyValue: Number($("#editMonthly").value), probability: status === "won" ? 100 : ["lost", "archived"].includes(status) ? 0 : Number($("#editProbability").value),
    qualification: [...document.querySelectorAll('[name="qualification"]:checked')].map(el => el.value),
    prospectNotes: $("#editProspect").value, auditFindings: $("#editFindings").value, auditRecommendations: $("#editRecommendations").value,
    proposalStatus: $("#editProposalStatus").value, proposalScope: $("#editScope").value, proposalTerms: $("#editTerms").value, proposalValidUntil: $("#editValid").value || null, notes: $("#editNotes").value };
}
function formLead(l) { const v = payload(); return { ...l, next_action: v.nextAction, setup_fee: v.setupFee, monthly_value: v.monthlyValue, audit_findings: v.auditFindings, audit_recommendations: v.auditRecommendations, proposal_scope: v.proposalScope, proposal_terms: v.proposalTerms, proposal_valid_until: v.proposalValidUntil }; }
async function saveSelected() {
  if (state.busy) return;
  const id = state.selected; const body = payload(); state.busy = true; $("#editFields").disabled = true; errorBox.hidden = true;
  try {
    const lead = state.leads.find(item => item.id === id);
    await api(`/api/admin/leads/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: lead?.updated_at ? { "if-match": lead.updated_at } : {} });
    state.dirty = false;
    const refreshed = await load(id);
    if ($("#saveMessage")) $("#saveMessage").textContent = refreshed ? "Lead saved." : "Lead saved, but refresh failed. Use Refresh to reload the latest values.";
  } catch (e) { showError(e.message); }
  finally { state.busy = false; if ($("#editFields")) { $("#editFields").disabled = false; updateCalculations(); } }
}
async function copyBrief() {
  const l = state.leads.find(x => x.id === state.selected); if (!l) return;
  const text = auditBrief(formLead(l)); $("#briefBox").hidden = false; $("#briefBox").textContent = text;
  try { await navigator.clipboard.writeText(text); $("#saveMessage").textContent = "Prospect brief copied."; } catch { $("#saveMessage").textContent = "Copy the prospect brief below manually."; }
}
async function exportInbox() {
  if (state.busy) return;
  const button = $("#exportBtn");
  const label = button.textContent;
  state.busy = true;
  setFilterBusy(true);
  button.disabled = true;
  button.textContent = "Preparing…";
  errorBox.hidden = true;
  try {
    const rows = [];
    let offset = 0;
    while (true) {
      const query = new URLSearchParams({ limit: "200", offset: String(offset), q: $("#searchInput").value.trim(), status: $("#statusFilter").value, view: state.view, sort: $("#sortFilter").value });
      const data = await api(`/api/admin/leads?${query}`);
      const page = data.leads || [];
      rows.push(...page);
      if (!data.hasMore || page.length === 0) break;
      offset += page.length;
    }
    const url = URL.createObjectURL(new Blob([leadsCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `growlocal-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("#loadStatus").textContent = `${rows.length} lead${rows.length === 1 ? "" : "s"} exported.`;
  } catch (error) {
    showError(error.message);
  } finally {
    state.busy = false;
    setFilterBusy(false);
    button.disabled = false;
    button.textContent = label;
  }
}
async function load(preferred = state.selected) {
  setFilterBusy(true);
  errorBox.hidden = true; $("#loadStatus").textContent = "Updating inbox…"; $("#workspace").setAttribute("aria-busy", "true");
  const query = new URLSearchParams({ limit: "200", offset: String(state.offset), q: $("#searchInput").value.trim(), status: $("#statusFilter").value, view: state.view, sort: $("#sortFilter").value });
  try {
    const [data, summary] = await Promise.all([api(`/api/admin/leads?${query}`), api("/api/admin/summary")]);
    state.leads = data.leads || []; state.hasMore = data.hasMore; state.summary = summary.summary || {};
    loginPanel.hidden = true; appPanel.hidden = false; $("#lockBtn").hidden = false; $("#tokenInput").value = ""; armIdleLock();
    state.filters = { q: $("#searchInput").value, status: $("#statusFilter").value, sort: $("#sortFilter").value, view: state.view, offset: state.offset };
    stats(); selectLead(state.leads.some(l => l.id === preferred) ? preferred : state.leads[0]?.id);
    return true;
  } catch (e) { showError(e.message); return false; }
  finally { setFilterBusy(false); $("#loadStatus").textContent = ""; $("#workspace").setAttribute("aria-busy", "false"); }
}
function setFilterBusy(busy) { document.querySelectorAll('#filterForm input, #filterForm select, #filterForm button, #focusViews button, #pipeline button').forEach(el => { el.disabled = busy; }); }
function restoreFilters() { const f = state.filters; $("#searchInput").value = f.q; $("#statusFilter").value = f.status; $("#sortFilter").value = f.sort; state.view = f.view; state.offset = f.offset; if (!appPanel.hidden) stats(); }
async function navigate(offset, confirmed = false) {
  if (state.busy) return;
  if (!confirmed && !canLeave()) { restoreFilters(); return; }
  state.busy = true; state.offset = Math.max(0, offset);
  try { if (!(await load())) restoreFilters(); } finally { state.busy = false; }
}

$("#statusFilter").innerHTML = '<option value="">All stages</option>' + options(STAGES, "");
$("#loginForm").addEventListener("submit", async e => { e.preventDefault(); if (state.busy) return; state.busy = true; state.token = $("#tokenInput").value.trim(); try { if (await load()) sessionStorage.setItem("growlocal_admin_token", state.token); } finally { state.busy = false; } });
$("#refreshBtn").addEventListener("click", () => navigate(state.offset));
$("#filterForm").addEventListener("submit", e => { e.preventDefault(); navigate(0); });
$("#exportBtn").addEventListener("click", exportInbox);
$("#statusFilter").addEventListener("change", () => navigate(0));
$("#sortFilter").addEventListener("change", () => navigate(0));
$("#clearFiltersBtn").addEventListener("click", () => { if (state.busy || !canLeave()) return; $("#searchInput").value = ""; $("#statusFilter").value = ""; $("#sortFilter").value = "priority"; state.view = "all"; navigate(0, true); });
$("#previousBtn").addEventListener("click", () => navigate(state.offset - 200));
$("#nextBtn").addEventListener("click", () => navigate(state.offset + 200));
$("#lockBtn").addEventListener("click", () => { if (!state.busy && canLeave()) lock(); });
window.addEventListener("beforeunload", e => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
for (const event of ["pointerdown", "keydown", "touchstart", "scroll"]) window.addEventListener(event, armIdleLock, { passive: true });
if (state.token) load();
