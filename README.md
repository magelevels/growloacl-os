# GrowLocal OS V8 — Production-ready static release

This release restructures GrowLocal for Cloudflare Workers Static Assets.

## Routes
- `/` — public customer-facing marketing site
- `/app/` — GrowLocal OS demo workspace
- `/privacy/` — prototype privacy notice
- `/terms/` — prototype terms
- `/404.html` — custom not-found page

## Deployment
Cloudflare Workers can deploy this repository with:

```bash
npx wrangler deploy
```

`wrangler.jsonc` serves `./public` as static assets and keeps the free workers.dev route enabled.

## Important product status
V8 remains a service-led validation product. The demo stores workspace state in localStorage. No real authentication, shared cloud database, payment processing, analytics or external AI APIs are connected in this release.

Do not store sensitive or confidential client data in the demo.
