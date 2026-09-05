# GrowLocal OS V10 — Lead Operations patch

This patch upgrades the proven V9.2 audit-capture pipeline with a protected lead-operations inbox.

## Adds
- Protected `/admin/` lead inbox.
- `GET /api/admin/leads` for authenticated lead retrieval.
- `PATCH /api/admin/leads/:id` for status, priority, notes and next action.
- D1 migration `0002_lead_ops.sql`.
- Prospect-brief generation and copy workflow.
- Token stored only in `sessionStorage` in the admin browser session.

## Required production setup
1. Apply `migrations/0002_lead_ops.sql` to the existing `growlocal-leads` D1 database.
2. Create a strong Cloudflare Worker secret called `ADMIN_TOKEN`.
3. Deploy the updated Worker and admin assets.
4. Visit `/admin/` and enter the same token.

Do not place `ADMIN_TOKEN` in GitHub, HTML, JavaScript or Wrangler config.
