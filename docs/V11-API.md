# V11 admin API

All endpoints below require the existing ADMIN_TOKEN in the Authorization Bearer header. Never include it in a URL.

`GET /api/admin/leads?status=qualified&q=cafe&limit=200&offset=0` returns `{ok, leads, hasMore}`. `limit` is 1–200; `offset` is a nonnegative integer. Lead fields use snake_case; `status` is the effective V11 stage, `legacy_status` preserves the original status, and `qualification_score`/`expected_value` are derived. `hasMore` is a page-size hint: an exact final full page may be followed by an empty page.

`PATCH /api/admin/leads/:id` accepts a JSON object of any subset below. Unknown fields, invalid types and invalid values return 422; missing lead returns 404. Text is trimmed, control characters removed, newlines preserved. Money is nonnegative, capped at £100,000,000 and rounded to pennies; probability is an integer from 0 to 100. Dates are YYYY-MM-DD (2000–9999) or null/empty to clear. Admin bodies are capped at 64 KB; the public form retains its 12 KB limit.

| JSON field | Allowed values / maximum |
| --- | --- |
| status | new, contacted, qualified, audit_ready, proposal_sent, won, lost, archived |
| priority | low, normal, high |
| notes / nextAction | 4,000 / 500 characters |
| setupFee / monthlyValue / probability | Numbers as described above |
| nextActionDate / proposalValidUntil | Date or null |
| qualification | Unique array: business_fit, need_confirmed, decision_maker, budget_confirmed, timing_confirmed |
| prospectNotes / auditFindings / auditRecommendations | 4,000 characters each |
| proposalStatus | not_started, draft, sent, accepted, declined |
| proposalScope / proposalTerms | 4,000 characters each |

`GET /api/admin/summary` returns `{ok, summary}` with `total`, `new_count`, `high_count`, `pipeline_value`, `expected_value`, `won_setup`, `won_mrr`, `overdue`. Empty SUM values may be null; the UI displays zero. Summary values are global and do not follow inbox filters.


## Focus views and sorting

The lead list also accepts `view=all|open|overdue|today|unscheduled|proposals` and `sort=priority|due|value|newest`. These combine with `q`, `status`, `limit` and `offset` on the server. Unknown values return 422; no arbitrary SQL expressions are accepted.

- `overdue`: open leads with a nonempty deadline earlier than today (UTC).
- `today`: open leads with a deadline today (UTC).
- `unscheduled`: open leads missing either action text or a deadline.
- `proposals`: open leads whose proposal status is sent.
- Open excludes won, lost and archived. Due sorting puts missing deadlines last. Value sorting uses the effective weighted first-year value, including the terminal-stage probability rules.

The summary additionally returns `due_today`, `unscheduled`, `sent_proposals` and one `stage_<name>` count for each of the eight stages. These remain global regardless of inbox filters.
