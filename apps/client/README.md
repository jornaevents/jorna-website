# jornaevents.com/client

> Served at **jornaevents.com/client** since 2026-10-29, beside the vendor app
> at /app, in the vendor app's deploy; book.jornaevents.com only redirects
> here (see DEPLOY.md).

The client side of **Jorna** — where hosts plan a South Asian wedding or
celebration, put together a team of vendors, and book them. A Next.js app
exported to static files and served by Cloudflare Pages (project
`jorna-events`), with a small hand-written help page at `/help`.

Vendors work on [jornaevents.com](https://jornaevents.com) (`jorna-vendor`
repo), which also hosts the no-login page where contracts are signed. Both
apps talk to the same FastAPI backend (`Desiconnect` repo, on Railway),
which is the source of truth for how anything behaves.

```
web/                 the app (Next.js, output: "export", basePath "/app")
public/app/          the app's static export — GENERATED, gitignored
public/help/         static help page (hand-written, no build step)
public/_redirects    rewrites "/" to "/app/"
scripts/             build + deploy tooling
docs/                architecture, module map, booking flow, decisions
wrangler.jsonc       Cloudflare Pages config (serves ./public)
```

## What's in it

- **Home and browsing** — the site root (`/` renders the app's Home),
  vendor search and the marketplace, vendor and package pages.
- **Planning** — plans ("bundles") built by hand or with the AI bundle
  builder, event details, guest lists and RSVPs, then sending requests to
  every vendor in the plan at once.
- **Booking** — messages, price negotiation and date-change requests with
  each vendor. When a vendor accepts, the booking becomes a contract: the
  plan shows **Review & sign**, which opens the signing page on
  jornaevents.com (see `web/src/lib/contract.ts`). Once it's signed, the
  plan lists each payment on the contract with its due date and its own
  "I sent this", and **View contract** opens `/contract` — the items,
  payments, terms and signature, printable. A signed booking can be
  cancelled but not removed from the plan. Day-of check-in and reviews.
- **Vendors aren't served here.** Their side — including sign-up — is
  jornaevents.com. Old seller URLs redirect there, and a vendor account that
  signs in here is pointed to it.

Jorna doesn't handle money for now: clients pay vendors directly
(Venmo/Zelle). Stripe checkout and escrow are still in the code behind
`NEXT_PUBLIC_ESCROW_ENABLED` (see `docs/DECISIONS.md`).

`docs/MODULE_MAP.md` says which files own what; `docs/BOOKING_FLOW.md` walks
the booking lifecycle; `docs/DECISIONS.md` explains the why.

## Developing

```bash
npm run install:app         # first time: install the app's dependencies
npm --prefix web run dev    # http://localhost:3000/app
```

Settings come from `web/.env.local` (see `web/.env.example`; nothing in it is
secret). **The production API doesn't accept requests from localhost**, so
run the backend locally (see the `Desiconnect` README) and point the app at
it:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_ESCROW_ENABLED=false                 # escrow is off in production
NEXT_PUBLIC_VENDOR_APP_URL=http://localhost:3100 # if you run jorna-vendor too (signing page)
```

and add `http://localhost:3000` to the backend's `ALLOWED_ORIGINS`.

API calls all go through `web/src/lib/jorna.ts` (typed) → `web/src/lib/api.ts`
(transport, including the shared token refresh); auth is
`web/src/lib/auth.tsx`. Email/password signs in against the backend, which
issues Jorna's own tokens; Google sign-in uses Supabase as an identity
provider only.

## Tests

```bash
npm --prefix web run lint
npm --prefix web run typecheck
npm --prefix web run test       # Vitest — pure logic in web/src/lib
npm run test:e2e                # Playwright — every backend call mocked
```

The end-to-end tests run against `next dev` with the backend replaced by
per-test mocks, so they never reach production. A pre-commit hook runs lint
and typecheck on staged files.

## Deploying

**Merging to `main` is deploying.** `main` is protected: open a PR, and CI
builds it, runs the unit and end-to-end tests, and publishes a preview.
When it merges, CI deploys to Cloudflare Pages.

`npm run deploy` builds and deploys from your machine and then checks every
route serves (see `DEPLOY.md`) — for emergencies, not the normal path.
Because `public/app/` is generated, never run a bare `wrangler pages deploy`:
it ships whatever old build happens to be on disk.

## Design notes

- Brand tokens (maroon/gold/cream, light and dark) are Tailwind v4 `@theme`
  variables in `web/src/app/globals.css`.
- Fonts are system stacks (Didot/Palatino for headings, Avenir Next/Segoe UI
  for body) — nothing is fetched over the network.
- `public/help/index.html` is hand-written; edit it directly.
