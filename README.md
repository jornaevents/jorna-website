# jornaevents.com

The Jorna site: the **marketing page** at `/` plus the **Jorna web app** at
`/app`, served as a static export from one Cloudflare Pages project
(`jorna-events`) out of one repo. (Previously a Cloudflare Worker; migrated
off Workers Static Assets — see `docs/DECISIONS.md` for why.)

```
public/index.html    the marketing page (hand-written, no build step)
public/app/          the web app's static export — GENERATED, gitignored
web/                 the web app source (Next.js)
wrangler.jsonc       Cloudflare Pages config (serves ./public)
```

Note: `/` currently serves the web app's own Home page, not
`public/index.html` — see "Root routing" in `docs/ARCHITECTURE.md`.

## The marketing page

Still one self-contained file. Open `public/index.html` and edit — CSS and JS
are inline. Preview by double-clicking it; it renders straight from disk.

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

- The app reuses the marketing palette: the same maroon/gold/cream tokens are
  defined as Tailwind v4 theme variables in `web/src/app/globals.css`.
- Marketing palette lives in `:root` in `public/index.html`, with a
  `prefers-color-scheme: dark` block overriding it. Change a color there, not inline.
- Fonts are system stacks (Didot/Palatino serif for headings, Avenir Next/Segoe UI
  for body) — nothing is fetched over the network.
- The client/vendor tabs and the scroll-reveal animation are the only JS on the
  marketing page, at the bottom of the file.
