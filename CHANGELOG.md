## V11 security hardening (2026-09-28)

- Added native Cloudflare Worker Rate Limiting bindings for public audit submissions (5 requests per minute per edge IP) and admin API access (120 requests per minute per edge IP), returning `429` with `Retry-After` before expensive validation or database work.
- Added a strict same-origin Content Security Policy and removed remaining inline JavaScript, inline styles and event attributes from shipped pages.
- Added HSTS, cross-origin resource isolation, framing protection, permissions restrictions, browser isolation headers and no-store handling for admin assets.
- Applied matching security headers to JSON API responses and covered the hardening with regression tests.
- Rejected oversized admin bearer headers before cryptographic comparison to limit abusive requests.
- Rejected cross-site API calls using Origin and Fetch Metadata checks before public submissions or admin actions reach application logic.
- Added a managed Cloudflare Turnstile challenge to the public audit form, with fail-closed server-side token, action and hostname validation plus a five-second verification timeout.
- Updated the Wrangler toolchain to a patched release and verified the dependency tree has no known vulnerabilities.
- Tightened static-page policy with no-referrer handling, legacy download protection and explicit blocking of inline script/style attributes, manifests and media.

## Competitive landscape and next-move engine (2026-09-29)

- Added a 250-company competitive discovery set spanning local SEO, reputation, CRM, messaging, bookings, payments, commerce, content, analytics, advertising, loyalty and field-service workflows.
- Added a research brief with market evidence, a differentiated GrowLocal positioning statement and a staged product roadmap in `docs/competitive-landscape-2026.md`.
- Added derived next-move recommendations to the sales API and admin workspace. Operators can accept a stage-specific suggestion or schedule the deadline for an existing action without changing stored lead data until they save.

## V11 admin safety update (2026-09-23)

- Added age indicators to the admin inbox so older enquiries are visible at a glance.
- Improved demo navigation accessibility with active-page announcements, mobile-menu state labels and reduced-motion-aware page scrolling.
- Versioned demo browser storage for V11 while preserving existing V8 state during the transition.
- Added optimistic edit locking so a stale admin tab cannot overwrite a newer lead update, including legacy leads whose `updated_at` was previously empty.
- Added a 30-minute inactivity lock for the browser admin session.
- Hardened CSV exports against spreadsheet formula injection from public lead fields.
- Normalized empty admin summary aggregates to numeric zero values for a consistent inbox API.
- Refined the public marketing site with the Warm Studio typography, navigation, pricing, audit-form and responsive visual polish.
- Escaped locally entered demo lead names before rendering and made copy actions fail gracefully when the browser has no clipboard API.
- Made demo state loading tolerant of malformed local storage and report save failures without breaking the workspace.

## V11 mobile compatibility update (2026-09-06)

- Enlarged touch controls, prevented small form text, stacked narrow detail layouts and kept mobile save controls from covering fields.
- Added dynamic viewport handling for demo navigation/dialogs and maintained zoom and reduced-motion support.
- Passed 16 Chromium/WebKit mobile viewport combinations covering six routes, admin tabs and saving. Physical-device testing remains a deployment check.

## V11 Warm Studio edition (2026-09-06)

- Applied the selected cream, forest-green and serif visual direction to the homepage, admin, demo and supporting pages.
- Added gentle section entrances, button hover feedback and tab transitions, with reduced-motion support and no animation dependencies.
- Preserved public audit submission, pricing, protected admin APIs and all V11 sales features. No additional migration.
- Verified 22 tests, JavaScript syntax, browser workflows including real local audit submission and reduced motion, and a Wrangler dry build.

## V11 pre-deployment refinement (2026-09-06)

- Refined midnight/mint admin UI with four commercial summary cards, stage counts, improved spacing and mobile layout.
- Added full-database follow-up views and safe sorting by deadline, weighted value and recency.
- Split the editor into keyboard-accessible Opportunity, Audit & fit and Proposal tabs with a sticky save bar.
- Added UTC deadline shortcuts, explicit next-stage preparation, proposal readiness guidance and unsaved-filter cancellation handling.
- 22 automated tests and extended Chromium interaction checks pass. The original V11 migration is unchanged.

## V11 — Sales & Conversion OS (2026-09-06)

- Eight sales stages; additive migration preserves the original V10 status column and all lead data.
- Setup fees, recurring monthly value, probability, weighted first-year value, qualification checklist and UTC action deadlines.
- Prospect research, audit findings/recommendations, proposal status and editable scope/commercial terms; proposal draft preview, copy and text download.
- Full-database pipeline forecasts, won setup/MRR and overdue-action cards; server-side search, filters and pagination.
- All admin API paths require ADMIN_TOKEN before routing. Existing public audit POST, D1 capture, notes, priority and prospect brief retained.
- Input validation, real-SQL migration/API tests, browser checks and local Worker build validation. Deployment is manual; see README-V11.md.

# GrowLocal OS Changelog

## Growth loop positioning (2026-09-28)

- Added a public GrowLocal difference section: every recommendation moves from signal to owner, deadline and proof.
- Added an admin momentum check that shows what share of open leads has a scheduled next move and links directly to unscheduled follow-ups.
- Positioned GrowLocal around a simple promise: from first search to repeat visit, one measurable next move.

## V7
- Added floating Launch Toolkit for demos and launch-readiness tracking.
- Added fast demo workspace loader.
- Added workspace backup export shortcut.
- Added current-view print shortcut.
- Added one-click 30-second sales pitch copy.
- Added launch readiness progress tracker.
- Added agency/client/lead snapshot metrics inside the toolkit.
- Added standalone SALES-PLAYBOOK.md for prospecting and demos.
- Preserved V6 multi-client, Agency HQ, CRM, proposal, reporting, and backup features.

# GrowLocal OS changelog

## V6

- Added Agency HQ with estimated MRR, open pipeline value, close rate and portfolio health.
- Added client portfolio navigation with per-client growth score and 30-day plan progress.
- Added recommended agency next actions based on current client and lead data.
- Added local JSON backup and restore for client workspaces, lead pipeline, activity and plan progress.
- Added duplicate and delete controls for client workspaces.
- Added personalised proposal generation for the active client.
- Cleaned duplicated V5 workspace JavaScript and retained per-client plan state.
- Updated navigation, responsive styling and product versioning.

## External connections intentionally deferred

Authentication, hosted database, Stripe, live model APIs and third-party analytics still require owner-controlled accounts and credentials.
