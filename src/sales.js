export const STAGES = ["new", "contacted", "qualified", "audit_ready", "proposal_sent", "won", "lost", "archived"];
export const QUALIFICATION = ["business_fit", "need_confirmed", "decision_maker", "budget_confirmed", "timing_confirmed"];
export const STAGE_SQL = "COALESCE(pipeline_stage, CASE WHEN status = 'closed' THEN 'archived' ELSE status END)";
export const SALES_COLUMNS = "pipeline_stage, setup_fee, monthly_value, probability, next_action_date, qualification, prospect_notes, audit_findings, audit_recommendations, proposal_status, proposal_scope, proposal_terms, proposal_valid_until";
const fields = {
  status: ["pipeline_stage", STAGES], priority: ["priority", ["low", "normal", "high"]],
  notes: ["notes", 4000], nextAction: ["next_action", 500],
  setupFee: ["setup_fee", "money"], monthlyValue: ["monthly_value", "money"], probability: ["probability", "percent"],
  nextActionDate: ["next_action_date", "date"], qualification: ["qualification", "checklist"],
  prospectNotes: ["prospect_notes", 4000], auditFindings: ["audit_findings", 4000], auditRecommendations: ["audit_recommendations", 4000],
  proposalStatus: ["proposal_status", ["not_started", "draft", "sent", "accepted", "declined"]],
  proposalScope: ["proposal_scope", 4000], proposalTerms: ["proposal_terms", 4000], proposalValidUntil: ["proposal_valid_until", "date"],
};
function validDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 9999 && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
}
export function validateLeadUpdate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send an object of lead fields." };
  const data = {};
  for (const [key, value] of Object.entries(body)) {
    if (!Object.hasOwn(fields, key)) return { error: `Unknown field: ${key}.` };
    const [column, rule] = fields[key];
    let v = value;
    if (Array.isArray(rule)) {
      if (!rule.includes(v)) return { error: `Invalid ${key}.` };
    } else if (typeof rule === "number") {
      if (typeof v !== "string" || v.length > rule) return { error: `${key} must be text of at most ${rule} characters.` };
      v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
    } else if (rule === "money" || rule === "percent") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > (rule === "money" ? 100000000 : 100) || (rule === "percent" && !Number.isInteger(v))) return { error: `Invalid ${key}.` };
      v = Math.round(v * 100) / 100;
    } else if (rule === "date") {
      if (v === "" || v === null) v = null;
      else { try { if (!validDate(v)) return { error: `Invalid ${key}; use YYYY-MM-DD.` }; } catch { return { error: `Invalid ${key}.` }; } }
    } else if (rule === "checklist") {
      if (!Array.isArray(v) || v.length > QUALIFICATION.length || v.some(x => !QUALIFICATION.includes(x)) || new Set(v).size !== v.length) return { error: "Invalid qualification checklist." };
      v = JSON.stringify(v);
    }
    data[column] = v;
  }
  if (!Object.keys(data).length) return { error: "Nothing to update." };
  if (data.pipeline_stage) {
    // Keep the original CHECK-constrained column compatible with V10.
    data.status = ["won", "lost"].includes(data.pipeline_stage) ? "closed" : ["audit_ready", "proposal_sent"].includes(data.pipeline_stage) ? "qualified" : data.pipeline_stage;
  }
  return { data };
}
export function enrichLead(row) {
  let checklist;
  try { checklist = JSON.parse(row.qualification || "[]"); } catch { checklist = []; }
  checklist = Array.isArray(checklist) ? [...new Set(checklist.filter(x => QUALIFICATION.includes(x)))] : [];
  const status = row.pipeline_stage || (row.status === "closed" ? "archived" : row.status);
  const probability = status === "won" ? 100 : ["lost", "archived"].includes(status) ? 0 : row.probability || 0;
  return { ...row, legacy_status: row.status, status, probability, qualification: checklist, qualification_score: checklist.length * 20,
    expected_value: Math.round(((row.setup_fee || 0) + 12 * (row.monthly_value || 0)) * probability) / 100 };
}
