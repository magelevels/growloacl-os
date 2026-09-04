# GrowLocal OS V9.2 — Lead Capture Release

Released: 4 September 2026

## Added

- A conversion-focused “Get a free growth audit” journey and genuine form success state.
- `POST /api/audit-request`, with no public endpoint for reading leads.
- Cloudflare D1 lead storage and an initial indexed migration.
- Server-side field validation, normalisation, prepared SQL, explicit consent and a honeypot.
- Updated privacy wording covering audit requests and D1 storage.
- Worker + Static Assets routing limited to `/api/*`, preserving `/app/`.
- Streamed request-size enforcement, API security headers and endpoint-level regression tests.

## Changed

- “Explore live demo” is now the secondary public CTA.
- The oversized hero was tightened for common laptop viewports.
- Documentation now includes exact D1 setup, migration, verification and deployment steps.
- Invalid server responses now focus the first affected field for faster keyboard correction.

## Deployment note

The production D1 database ID is configured and the remote `leads` schema was verified in Cloudflare. Pass the dry run before deploying; the Git-connected production Worker will then receive the `DB` binding from `wrangler.jsonc`.
