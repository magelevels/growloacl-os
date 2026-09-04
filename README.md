# GrowLocal OS V9.2 — real lead capture

V9 evolves the static Cloudflare Worker into a Worker + Static Assets application. The marketing site now submits genuine free-growth-audit requests to `POST /api/audit-request`, backed by Cloudflare D1. The `/app/` demo remains unchanged and continues to use local browser storage.

## Routes

- `/` — customer marketing site and conversion form
- `/app/` — existing GrowLocal OS demo
- `POST /api/audit-request` — validated D1 lead creation
- `/privacy/` and `/terms/` — public legal information

There is deliberately no public `GET` route for leads.

## One-time Cloudflare setup

The checked-in `wrangler.jsonc` is configured for the `growlocal-leads` D1 database. If recreating the infrastructure in another Cloudflare account, create a replacement from the repository root:

```bash
npm install
npx wrangler d1 create growlocal-leads
```

Copy the returned database ID into `wrangler.jsonc`. For the current production account, this step is already complete. Then run:

```bash
npx wrangler d1 migrations apply growlocal-leads --remote
npm run types
npm run check
npm run deploy:dry
npm run deploy
```

Apply the migration before deployment so the first real form submission cannot reach a missing table. The existing Worker name and `workers.dev` route are preserved.

## Local development

After replacing the D1 placeholder:

```bash
npx wrangler d1 migrations apply growlocal-leads --local
npm run dev
```

The local form writes only to local D1 state. Do not use real customer information while testing.

## Validation and privacy

The Worker requires JSON, limits request size, normalises text, validates required fields, safely parses optional website URLs, requires explicit consent, uses prepared D1 statements and returns field-level validation errors. A honeypot quietly absorbs basic bot submissions. Logs include only an internal lead ID—not contact details.

Before broad commercial promotion, replace the privacy-page placeholder with a monitored contact address and the legal identity of the data controller.

## Verification

```bash
npm run check
npm run deploy:dry
```

`npm run check` runs JavaScript syntax checks and eight validation/API regression tests. The dry run validates the Worker bundle and static-assets configuration without changing the live deployment.
