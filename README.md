# jornaevents.com

The Jorna site: the **Jorna web app**, served at both `/` and `/app`, plus a
small hand-written **help page** at `/help`. Everything is a static export
from one Cloudflare Pages project (`jorna-events`) out of one repo.
(Previously a Cloudflare Worker; migrated off Workers Static Assets — see
`docs/DECISIONS.md` for why.)

```
public/app/          the web app's static export — GENERATED, gitignored
public/help/         static help page (hand-written, no build step)
public/_redirects    rewrites "/" to "/app/" — see "Root routing" below
web/                 the web app source (Next.js)
wrangler.jsonc       Cloudflare Pages config (serves ./public)
```

## Root routing

`/` rewrites (HTTP 200, not a redirect) to `/app/`, which renders
`web/src/app/page.tsx` → the app's own Home screen (`web/src/app/home/`).
There is no separate marketing page anymore — the standalone
`public/index.html` that used to serve `/` was deleted (commit `58ce333`,
2026-07-31) once the app's own Home page took over the site root
permanently. See "Root routing" in `docs/ARCHITECTURE.md` for the mechanics
of the rewrite.

## The web app (`/app`)

A Next.js client for the same FastAPI backend the iOS app uses. It's fully
client-rendered, so it's exported to static files (`output: "export"`,
`basePath: "/app"`) and Cloudflare Pages serves them — no SSR runtime.

```bash
npm run install:app        # first time: install the app's dependencies
npm --prefix web run dev   # http://localhost:3000/app — live reload while developing
```

The backend already allows `http://localhost:3000` via CORS, so dev talks to
production out of the box. Create an account at `/app/login`, then `/app/plan`.

Auth, the AI Bundle Builder, browse/search, booking + Stripe checkout/escrow,
messaging + negotiation, reschedule requests, and the full vendor side
(onboarding, availability, bookings, check-in, earnings via Stripe Connect)
are all built. See `docs/BOOKING_FLOW.md` for the full booking lifecycle on
both the client and vendor sides.

See `web/src/lib/` for the API client (`api.ts`), auth (`auth.tsx`), and calls
(`jorna.ts`). Email/password authenticates directly against the backend, which
issues Jorna's own JWT; Google OAuth goes through Supabase as an identity
provider only.

## Deploying (both, together)

```bash
npm run deploy       # builds, deploys to Cloudflare Pages, verifies every
                      # route serves 200 (see DEPLOY.md)
npm run deploy:once  # build + single-shot deploy, unverified
```

First run needs `npx wrangler login`.

Because `public/app/` is generated and gitignored, **always deploy via
`npm run deploy`** (or `deploy:once`) — a bare `wrangler pages deploy` would
ship whatever stale build happens to be on disk.

## Design notes

- Brand tokens (maroon/gold/cream, light + dark) are Tailwind v4 `@theme`
  variables in `web/src/app/globals.css` — the single source now that there's
  no separate marketing page to keep in sync by hand.
- Fonts are system stacks (Didot/Palatino serif for headings, Avenir Next/Segoe UI
  for body) — nothing is fetched over the network.
- `public/help/index.html` is still a hand-written, no-build-step static file —
  open and edit it directly, same as the old marketing page used to be.
