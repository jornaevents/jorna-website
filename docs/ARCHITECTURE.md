# Architecture

Jorna is a marketplace for planning South Asian celebrations (matching clients
with vendors, bundling services, booking + escrow payment). This repo is the
**frontend only** — a marketing site plus a client-rendered web app, both
served as static files. There is no server, database, or API implementation
here.

## Components

```
                         Cloudflare Pages ("jorna-events")
                         serves everything in public/
┌───────────────────────────────────────────────────────────────┐
│  public/                                                       │
│    help/index.html    static help page (no build step)          │
│    app/                GENERATED — Next.js static export,       │
│                         gitignored, rebuilt by `npm run build`  │
│    _redirects          Pages rewrite rules (order matters)      │
└───────────────────────────────────────────────────────────────┘
                              ▲
                              │ next build && export-to-public.mjs
                              │
┌───────────────────────────────────────────────────────────────┐
│  web/   Next.js 16 (App Router), React 19, Tailwind v4, TS      │
│    output: "export", basePath: "/app"  →  fully client-rendered │
│    no SSR at runtime; every page ships as static HTML + JS      │
└───────────────────────────────────────────────────────────────┘
                              │
                              │ fetch() from the browser, JWT bearer auth
                              ▼
        External FastAPI backend ("Desiconnect/server", separate repo)
        NEXT_PUBLIC_API_BASE_URL, defaults to a Railway deployment
                              │
              ┌───────────────┴───────────────┐
              ▼                                ▼
   Supabase (Google OAuth only)      Stripe Connect (vendor payouts,
   web/src/lib/supabase.ts           checkout) — server-side, called
                                     indirectly via the backend API

   Firebase (web push messaging)
   web/src/lib/firebaseConfig.ts, push.ts
```

**The backend is not in this repository.** `web/src/lib/types.ts` mirrors its
Pydantic schemas by convention (kept close on purpose, see file header) but is
hand-maintained — there is no code generation. Treat backend behavior
described in `types.ts`/`jorna.ts` comments as accurate-at-last-edit, not
guaranteed current; verify against the running API if a change depends on it.

## Root routing

`public/index.html` was originally a hand-written marketing page served at
`/`, separate from the Next app under `/app`. As of commit `58ce333`
(2026-07-31), `public/_redirects` rewrites `/` (HTTP 200, not a redirect) to
`/app/`, which renders `web/src/app/page.tsx` → `web/src/app/home/page.tsx`
— the Next app's own Home screen. `public/index.html` was deleted in that
same commit and is not coming back — the app's Home page is the permanent
site root, a settled decision as of 2026-08-22, not an interim state. See
`docs/DECISIONS.md` for the full history. **Trust `public/_redirects` and
`web/src/app/page.tsx` as the actual behavior** if this doc and the code
ever disagree after a future change.

## Request/data flow

1. Every `/app/*` page is a client component tree rendered behind
   `<Suspense>`; the exported HTML carries no UI text, only shell + JS bundle
   (see `DEPLOY.md`, "Gotcha" section — relevant if you're ever tempted to
   grep served HTML for UI copy).
2. All data access goes through `web/src/lib/api.ts` (`apiFetch`/`apiUpload`):
   attaches a bearer token, retries once on 401 via refresh, normalizes error
   bodies (including FastAPI/Pydantic validation errors and slowapi 429s).
3. `web/src/lib/jorna.ts` wraps `api.ts` with one typed function per backend
   endpoint the UI calls. Add new backend calls here, not ad-hoc `fetch`s in
   components.
4. `web/src/lib/auth.tsx` owns the session: token persistence (`localStorage`),
   the `AuthProvider` context, and `adoptSession` for the Google OAuth path
   (Supabase issues a token, the backend exchanges it for a Jorna session).
5. Full API surface and type contracts: `docs/API.md`.

## Important cross-cutting convention: single source of truth for "what's outstanding"

`web/src/lib/planning.ts` (client-side) and `web/src/lib/vendorPlan.ts`
(vendor-side) are the **only** places that decide what a user still needs to
do (finish event details, pay, confirm, respond to a negotiation, etc). Both
the relevant dashboard/plan page and `web/src/lib/attention.ts` (the tab-bar
notification badge) read from these — never re-derive "is this booking
actionable" logic elsewhere. Every rule in these two files is written to
mirror a backend guard, so a task shown in the UI never points at an action
the server will reject. If you're changing what counts as "needs attention,"
this is the one place to change it.

## Pricing contract

A price is always three fields, never a bare number: `price_min`, `price_max`,
`price_unit`, plus `price_pending_quantity` (true when the total can't be
resolved yet, e.g. per-guest pricing before headcount is known). This shape is
shared by bundle items and real bookings so a slot and the booking it becomes
render identically. Always go through the `priceLine`-style helpers in
`web/src/lib/types.ts` / `pricing.ts` rather than formatting these fields by
hand.

## Booking lifecycle

The full client (host) and vendor journeys — bundle → send → negotiate → pay
→ escrow → check-in → confirm/release, plus the vendor's onboarding/
availability/earnings side — are documented in `docs/BOOKING_FLOW.md`,
including the booking status model (`status` and `payment_status` are two
independent fields, not one enum — the single most non-obvious fact about
this data model).

## Design tokens

Color/typography tokens live in one place: `web/src/app/globals.css`, as
Tailwind v4 `@theme` variables (`--color-*`, consumed as
`bg-maroon`/`text-gold`/etc.), plus `--font-serif`/`--font-sans` and
`--container-wide`/`--container-page`. Until 2026-07-31 these were also
duplicated inline in `public/index.html` (the marketing page had no build
step by design, so it couldn't consume the Tailwind theme); that file no
longer exists (see "Root routing" above), so `globals.css` is now the sole
source — nothing to hand-sync anymore. `public/help/index.html` is the one
remaining no-build-step static file, and does not currently share these
tokens.

**Light/dark mechanism:** a `data-theme="light"|"dark"` attribute on the root
element is the primary switch (set by a small inline theme script so there's
no flash-of-wrong-theme); `@media (prefers-color-scheme: dark)` is only a
fallback for when no explicit `data-theme` is set. Native form controls
(date pickers, scrollbars) get their own `color-scheme` per `data-theme` too
— see the comment block in `globals.css` above the `input[type="date"]`
rules for why (iOS/macOS Safari otherwise ignores the app's chosen theme for
those controls specifically).

**Fonts** are a single system sans stack (Avenir Next/Segoe UI/system-ui) for
everything — headings and body alike, on both `globals.css` and
`public/help/index.html` — nothing is fetched over the network. Headings
previously used a separate high-contrast serif stack (Didot/Bodoni/Hoefler/
Palatino); on a system with none of those fonts installed the fallback chain
read as a generic, less-readable serif (Times New Roman on Windows), so it
was dropped in favor of one consistent typeface everywhere. `--font-serif`
still exists in `globals.css` as an alias of `--font-sans` (not deleted)
purely so the 40+ components already using the `.serif` class don't each
need an edit — it's not a second typeface.

Both palettes (light values, dark values, and the rationale/tone brief) are
listed in full in `DESIGN_BRIEF.md`, which is kept in sync with
`globals.css` by convention (verify against `globals.css` if a color looks
off — it's the source of truth, `DESIGN_BRIEF.md` is the readable reference).

## External services

| Service | Purpose | Entry point |
|---|---|---|
| FastAPI backend (Railway, separate repo) | All data, auth, bookings, escrow, chat | `NEXT_PUBLIC_API_BASE_URL`, `web/src/lib/api.ts` |
| Supabase | Google OAuth identity only (not general auth) | `web/src/lib/supabase.ts` |
| Firebase Cloud Messaging | Web push notifications | `web/src/lib/firebaseConfig.ts`, `push.ts` |
| Stripe Connect | Vendor payouts / checkout, driven server-side | reached only through backend endpoints in `jorna.ts` |
| Cloudflare Pages | Hosting for everything in `public/` | `wrangler.jsonc`, `scripts/deploy.mjs` |

## Before making a cross-cutting change

- Read `docs/MODULE_MAP.md` to find the right subsystem first.
- If it touches pricing, booking status, or "what needs a user's attention,"
  read `planning.ts`/`vendorPlan.ts`/`attention.ts` — don't duplicate their
  rules.
- If it touches deploy behavior, read `DEPLOY.md` — the deploy script exists
  specifically to work around a Cloudflare upload reliability issue; don't
  bypass it with a bare `wrangler deploy`.
- There is currently no automated test suite (no test runner is installed in
  either `package.json`). Verification is manual (`npm --prefix web run dev`)
  plus `npm --prefix web run lint` and TypeScript's own build-time checking.
