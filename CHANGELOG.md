## V11 admin safety update (2026-09-23)

- Added age indicators to the admin inbox so older enquiries are visible at a glance.
- Improved demo navigation accessibility with active-page announcements, mobile-menu state labels and reduced-motion-aware page scrolling.
- Added optimistic edit locking so a stale admin tab cannot overwrite a newer lead update, including legacy leads whose `updated_at` was previously empty.
- Added a 30-minute inactivity lock for the browser admin session.
- Hardened CSV exports against spreadsheet formula injection from public lead fields.
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
