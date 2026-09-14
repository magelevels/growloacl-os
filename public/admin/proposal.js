export const STAGES = ["new", "contacted", "qualified", "audit_ready", "proposal_sent", "won", "lost", "archived"];
export const CHECKLIST = { business_fit: "Business fits our services", need_confirmed: "Growth need confirmed", decision_maker: "Decision maker identified", budget_confirmed: "Budget discussed", timing_confirmed: "Buying timeline confirmed" };
export const money = value => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(Number(value) || 0);
export function proposalText(lead) {
  return `GROWLOCAL — PROPOSAL DRAFT
Prepared for ${lead.business_name}
Contact: ${lead.contact_name} (${lead.email})
Business: ${lead.business_type} · ${lead.location}
Website: ${lead.website || "Not supplied"}
Valid until: ${lead.proposal_valid_until || "To be agreed"}

YOUR GROWTH CHALLENGE
${lead.growth_challenge || "To be confirmed"}

AUDIT FINDINGS
${lead.audit_findings || "Audit findings to be confirmed before sending."}

RECOMMENDED APPROACH
${lead.audit_recommendations || "Recommendations to be agreed."}

SCOPE & DELIVERABLES
${lead.proposal_scope || "Define deliverables, measures of success and exclusions before sending."}

COMMERCIAL TERMS (GBP)
Setup fee: ${money(lead.setup_fee)}
Monthly recurring fee: ${money(lead.monthly_value)}
Indicative first-year fees: ${money(Number(lead.setup_fee || 0) + 12 * Number(lead.monthly_value || 0))}
${lead.proposal_terms || "Confirm payment schedule, minimum term, cancellation, start date and VAT treatment before sending."}

NEXT STEP
Please reply to discuss and agree the scope and commercial terms.
This is a draft for review; it has not been sent or accepted automatically.`;
}

export function proposalReadiness(lead) {
  return [
    ["Audit findings", Boolean(lead.audit_findings?.trim())],
    ["Recommended approach", Boolean(lead.audit_recommendations?.trim())],
    ["Scope & deliverables", Boolean(lead.proposal_scope?.trim())],
    ["Commercial terms", Boolean(lead.proposal_terms?.trim())],
    ["Fee agreed", Number(lead.setup_fee) > 0 || Number(lead.monthly_value) > 0],
    ["Validity date", Boolean(lead.proposal_valid_until)],
  ];
}
export function deadlineInDays(days, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
