# GrowLocal OS V11 — Sales & Conversion patch

Built against `magelevels/growloacl-os` main commit `2cc907c317bb540341defb075e69e37289db14ce` (working V10). This ZIP is an overlay of changed/new files, not a standalone site. Keep all other V10 files. No Cloudflare resources or GitHub files were changed remotely.

## Warm Studio edition

The selected Warm Studio design now covers the public homepage, admin, demo and supporting pages: cream backgrounds, forest-green controls and serif headlines. Gentle entrance animations, button hover lifts and short tab transitions respect reduced-motion preferences. Public audit submission, pricing, admin protection and sales features are preserved. This edition uses the same V11 SQL migration; do not rerun it if already applied.

## Mobile compatibility update

Touch controls have a 44px minimum height, editable fields use at least 16px text on touch devices, narrow detail layouts stack, and mobile save controls stay in document flow so they do not cover fields. Demo panels account for changing browser-bar height. Pinch zoom remains enabled.

Verified in Playwright Chromium and WebKit with touch/mobile emulation at 320×568, 360×800, 375×667, 390×844, 412×915, 430×932, 768×1024 and 844×390. All six routes, authenticated admin tabs and saving passed with no horizontal page overflow or browser errors. These are browser-engine/emulation checks, not physical iPhone/Samsung tests; older browsers and every device model cannot be guaranteed. After deployment, check audit submission and admin editing on an actual iPhone Safari and Samsung Internet/Chrome device, including the on-screen keyboard. No additional migration is required.

## Pre-deployment UI refinement

This ZIP replaces the earlier V11 patch and still uses the same `0003_sales_conversion.sql` migration. No additional migration is needed. It adds a clickable eight-stage overview; global overdue/today/unscheduled/proposal follow-up views; deadline/value sorting; tabbed lead editing with keyboard navigation; one-click date and stage shortcuts; proposal readiness guidance; and a sticky save bar. The admin has clearer spacing, restrained colour accents, compact cards and a bounded mobile inbox. Shortcuts remain unsaved until you press Save lead.

## Built

- Stages: new → contacted → qualified → audit_ready → proposal_sent → won / lost / archived. Any stage can be selected when saving.
- GBP setup fee, monthly recurring value and probability; expected first-year value = (setup + 12 × monthly) × probability / 100. Won uses 100%; lost/archived use 0%. Forecasts are not invoices or collected revenue.
- Next action plus UTC calendar deadline; five qualification checks worth 20 points each.
- Private prospect research, audit findings and recommendations, existing private notes and prospect brief.
- Proposal status, scope, editable commercial terms and validity date; generate, preview, copy or download a text draft. Nothing is sent automatically. Private notes/research, checklist and probability are excluded. Edit proposal status and pipeline stage separately; save to persist source fields. Generated text itself is not separately stored.
- Global revenue cards show open first-year pipeline, weighted forecast, won setup fees and won MRR. Clickable stage counts and follow-up counts cover the entire database. Search/filter run on the server; inbox pages hold up to 200 leads.
- Existing public audit funnel, D1 insert, consent checks, priority, notes, next action, email link, prospect brief retained; visual styling updated to Warm Studio.
- All `/api/admin/*` methods, including unknown admin routes, require `Authorization: Bearer <ADMIN_TOKEN>`; responses use `Cache-Control: no-store`. `/admin/` retains V10's public empty login shell, with all lead data and operations behind the token. No public GET endpoint for leads exists. The token stays in sessionStorage and is never placed in a URL or source file.

## Manual deployment — do this in order

1. Download and unzip this patch. Keep a copy of the working V10 repo/deployment. Overlay its files onto the repository root, preserving `src/`, `public/admin/`, `migrations/` and `test/` paths. Do not replace the repository with only the ZIP contents. If using GitHub upload, wait until step 4 to commit, because a commit to the production branch may trigger deployment.
2. In Cloudflare, open **Storage & databases → D1 → growlocal-leads** (database ID `6f98b689-3792-4c97-8dbd-8fad14d13799`). Retain a current database export/Time Travel recovery point. In its SQL Console run:
   ```sql
   SELECT COUNT(*) AS lead_count_before FROM leads;
   PRAGMA table_info(leads);
   ```
   Confirm V10 columns `priority`, `notes`, `next_action`, `updated_at` exist, and V11 columns such as `pipeline_stage` do not. **Do not rerun 0001 or 0002 on the working V10 database.**
3. Run the exact SQL below once in that same D1 Console (also supplied as `migrations/0003_sales_conversion.sql`). Run the statements in order. If the console runs only one statement at a time, execute each semicolon-terminated statement separately. If any statement fails, stop and inspect `PRAGMA table_info(leads)` before continuing; do not blindly rerun ALTER statements. Existing columns are not dropped or renamed.
4. Verify:
   ```sql
   SELECT COUNT(*) AS lead_count_after FROM leads;
   PRAGMA table_info(leads);
   SELECT status, pipeline_stage, COUNT(*) AS leads
   FROM leads GROUP BY status, pipeline_stage;
   ```
   Existing leads must still be present (the count can increase if the public form receives a submission). Confirm all 13 added columns and both new indexes exist. In GitHub, upload/commit the patch files with their folder paths to the same repository/production branch used for V10. Let the existing Cloudflare Worker build deploy them; if automatic builds are disabled, use the Worker’s existing deployment workflow or the CLI alternative below. Do not upload the ZIP as a single repository file.
5. In **Workers & Pages → growloacl-os**, verify the `DB` binding still targets `growlocal-leads`, the existing `ADMIN_TOKEN` secret remains present, and the successful V11 deployment is active. This patch leaves `wrangler.jsonc` and the secret unchanged. Do not put the token in GitHub or regenerate it for this upgrade.
6. Hard-refresh `/admin/`, enter the existing token, and open a test lead. Set a stage, £1,000 setup, £200 monthly and 50% probability: weighted value should be £1,700. Save and refresh. Tick qualification items, set a deadline, add audit findings and commercial terms, generate/download a proposal, then verify the public audit form still accepts a test request. A signed-out request to `/api/admin/leads` or `/api/admin/summary` must return 401; `GET /api/audit-request` remains 405.

### SQL — V10 to V11, run once

```sql
-- Apply once after 0001 and 0002. No table rebuilds or deleted leads.
ALTER TABLE leads ADD COLUMN pipeline_stage TEXT CHECK (pipeline_stage IN ('new','contacted','qualified','audit_ready','proposal_sent','won','lost','archived'));
ALTER TABLE leads ADD COLUMN setup_fee REAL NOT NULL DEFAULT 0 CHECK (setup_fee >= 0 AND setup_fee <= 100000000);
ALTER TABLE leads ADD COLUMN monthly_value REAL NOT NULL DEFAULT 0 CHECK (monthly_value >= 0 AND monthly_value <= 100000000);
ALTER TABLE leads ADD COLUMN probability INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100);
ALTER TABLE leads ADD COLUMN next_action_date TEXT;
ALTER TABLE leads ADD COLUMN qualification TEXT NOT NULL DEFAULT '[]';
ALTER TABLE leads ADD COLUMN prospect_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN audit_findings TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN audit_recommendations TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN proposal_status TEXT NOT NULL DEFAULT 'not_started' CHECK (proposal_status IN ('not_started','draft','sent','accepted','declined'));
ALTER TABLE leads ADD COLUMN proposal_scope TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN proposal_terms TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN proposal_valid_until TEXT;
UPDATE leads SET pipeline_stage = CASE WHEN status = 'closed' THEN 'archived' ELSE status END WHERE pipeline_stage IS NULL;
CREATE INDEX idx_leads_pipeline_stage ON leads(pipeline_stage);
CREATE INDEX idx_leads_next_action_date ON leads(next_action_date);

```

**Compatibility:** V10's `status` has a CHECK constraint allowing only new/contacted/qualified/closed/archived. V11 stores richer stages in `pipeline_stage`, mirrors audit_ready/proposal_sent to legacy qualified and won/lost to legacy closed, and keeps every original column. Existing closed leads map to archived because no win/loss outcome was recorded; review them manually. Newly submitted public leads use the existing new default and the API derives their new stage when pipeline_stage is null. Unscored existing leads start at £0 and 0% probability.

**Migration tracking:** The D1 Console/file-execute method does not record this script in Wrangler's `d1_migrations` table. Keep a record that 0003 was applied; do not later run `migrations apply` over this database without reconciling already-applied migrations. If you already manage all migrations through Wrangler, use its migration tracking consistently instead of running the same SQL twice.

### CLI alternative (run yourself from the complete overlaid repository)

Use Node 22.13+ (tested on Node 24) and pnpm. Inspect the D1 schema and retain a backup first, as above.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec wrangler login
# Only if step 3 above has NOT been run:
pnpm exec wrangler d1 execute growlocal-leads --remote --file=migrations/0003_sales_conversion.sql
pnpm exec wrangler deploy --dry-run
pnpm exec wrangler deploy
```

Deploying the Worker does not apply the D1 migration. Do not run the SQL both in the Console and through the CLI. If a partial Console run added some columns, apply only the remaining statements after confirming the schema, then run the verification queries.

## API reference

See [docs/V11-API.md](docs/V11-API.md) for routes, field names, limits, derived values and response semantics.

## Validation and limitations

- 22 Node tests pass: existing public form validation/API tests plus real SQLite-backed admin/API tests, every stage under V10's CHECK constraint, ALTER data preservation, migration replay rejection, field validation, dates, missing records, authorization, proposal privacy and 208-lead pagination/global totals, follow-up views, safe sorting and UTC shortcuts.
- JavaScript syntax checks cover the Worker, validation, sales helpers, admin modules, existing public scripts and the new motion script.
- Chromium browser smoke test passed: invalid/valid token, editing, calculations, qualification, proposal privacy/download, save/reload, won stage, filtering and lock. New controls also passed: stage/follow-up filters, deadline and stage shortcuts, unsaved-edit cancellation, hidden-field validation, keyboard tabs and proposal readiness. Desktop (1440px) and mobile (390px) inspected; no browser errors or horizontal mobile overflow.
- Warm Studio browser checks passed: actual public audit submission to local SQLite, desktop/mobile layouts, themed demo and supporting pages, and reduced-motion behavior (no animations, no transitions, automatic scrolling).
- Wrangler 4.128.0 dry build passed; all three migrations applied successfully to a fresh **local** D1 instance. Production Cloudflare was not accessed or modified for validation; finish the manual production smoke test above after deployment.
- Single shared-token administration and last-save-wins editing follow V10. No multi-user conflict resolution, email delivery, proposal acceptance portal or billing automation is included.

**Rollback:** Restore the V10 Worker/assets without dropping new columns. The public funnel continues using its original columns; V10 sees the mirrored legacy statuses. Leave the additive migration in place. Avoid editing statuses through V10 after rollback if you plan to return to V11, since V10 cannot update pipeline_stage. Resolve any such edits explicitly before redeploying V11; do not rerun the migration.

References: [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 SQL](https://developers.cloudflare.com/d1/sql-api/sql-statements/), [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).
