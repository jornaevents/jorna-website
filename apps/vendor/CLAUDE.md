# Jorna vendor app — agent instructions

Jorna is a marketplace for planning South Asian celebrations (matching
clients with vendors, bundling services, contracts and booking). Escrow is
built but **disabled for the MVP** — vendors are paid off-platform via
Venmo/Zelle (`@jorna/shared/lib/flags`'s `ESCROW_ENABLED`, see
`docs/DECISIONS.md`).

**This app is frontend-only**: a client-rendered Next.js static export
(`basePath: "/app"`) deployed to Cloudflare Pages (project `jorna-vendor`)
as jornaevents.com. It serves the vendor dashboard and the contract signing
page under `/app`, the marketing pages (`/` is rewritten to the app's own
root route, plus `for-clients`, `for-vendors`, `how-it-works`), and a small
hand-written `/help` page. Since 2026-10-29 the same deploy also carries the
client app (`apps/client`) at `/client`: this app's `npm run build` builds
it first, and `web/scripts/export-to-public.mjs` copies it to
`public/client`. The backend (FastAPI, Python) is a separate repo,
`jornaevents/jorna-backend` (`server/`) — treat it as an external API
reachable only over HTTP.

This app lives in the `jorna-website` monorepo — read the root `CLAUDE.md`
too; code both apps use is in `packages/shared` (`@jorna/shared`).

## Layout

```
public/            served by Cloudflare Pages — public/app/ and public/client/
                    are GENERATED, gitignored build output; don't hand-edit
                    them (public/help/ is hand-written)
web/                Next.js 16 / React 19 / TS / Tailwind v4 source for /app
scripts/            deploy + build tooling (deploy.mjs is the verified deploy)
docs/               architecture docs (read before cross-cutting changes)
drafts/             legal/privacy/support/terms drafts — deliberately unpublished
.claude/context/    current-task.md — working memory for in-progress tasks
*.md (root)         DEPLOY.md, STRIPE_GO_LIVE.md and README.md are current
                    ops/overview docs, kept accurate; the rest
                    (BOOKING_AUDIT_ROADMAP, CLIENT_FLOW_PLAN, DESIGN_BRIEF,
                    HONEYBOOK_PARITY_PLAN, MESSAGING_PROPOSAL,
                    RESCHEDULE_PROPOSAL, VENDOR_DASHBOARD_BRIEF,
                    WEB_PARITY_PLAN) are proposals and build plans, not
                    always-current architecture — check the code before
                    trusting one on any specific claim.
```

## Documentation map

- `docs/ARCHITECTURE.md` — components, data flow, external services,
  design-token/theming mechanism, conventions to know before a cross-cutting
  change.
- `docs/MODULE_MAP.md` — which subsystem owns which files; start here to
  find where to make a change.
- `docs/API.md` — how the frontend talks to the external backend (auth,
  error handling, the typed client layers).
- `docs/BOOKING_FLOW.md` — the full booking lifecycle from both the client
  and vendor sides: bundle → send → negotiate → pay → escrow → check-in →
  confirm/release, the two-field booking status model, and Stripe Connect.
- `docs/DATABASE.md` — why there's no schema/persistence code here (there
  isn't any; it's in the external backend repo).
- `docs/DECISIONS.md` — why things are built the way they are.
- `.claude/context/current-task.md` — handoff notes for whatever's currently
  in progress (see "Maintaining this context layer" below).

## How to explore this repo

- Don't read the whole repository. Start with `docs/MODULE_MAP.md` to find
  the relevant subsystem, then read only the files it points to.
- Search for existing implementations before writing new code — in
  particular, check `web/src/lib/jorna.ts` before adding a new API call, and
  `web/src/lib/planning.ts` / `vendorPlan.ts` before adding any "does the
  user still need to do X" logic (see `docs/ARCHITECTURE.md`).
- Read the relevant doc in `docs/` before a change that spans multiple
  subsystems (auth, pricing, task/attention rules, deploy).
- Treat source code as ground truth over any `.md` file, including these —
  docs here can lag a code change. The root `*_PLAN.md` / `*_PROPOSAL.md` /
  `*_BRIEF.md` files are proposals and build plans, not architecture (see
  "Layout" above) — don't assume prose docs are self-consistent, and verify a
  proposal doc's claims against the code before treating "it's in a proposal
  doc" as "it's implemented."

## Coding rules for this repo

- Comments explain *why*, not *what* — match the existing style (see almost
  any file in `web/src/lib`). Don't add comments that restate the code.
- Don't duplicate the task/attention rules in `planning.ts`/`vendorPlan.ts`;
  extend them instead.
- All backend calls go through `web/src/lib/jorna.ts` (typed) →
  `@jorna/shared/lib/api` (transport). No ad-hoc `fetch()` in components.
  Pricing, negotiation, contract-draft and taxonomy logic is in
  `@jorna/shared/lib` — look there before writing it in the app.
- Price values are always the `price_min`/`price_max`/`price_unit`/
  `price_pending_quantity` shape — never format a bare number by hand.
- `public/app/` and `public/client/` are generated (gitignored); never edit
  them directly, and never ship with a bare `wrangler deploy` — CI deploys;
  by hand, use `npm run deploy` (see
  `docs/DECISIONS.md` for why).

## Copy rules (vendor pages)

Agreed 2026-10-03. Vendor pages should read like a person talking: what's
happening, and what the vendor needs to do.

- Name the client and the action, not the system state ("Priya sent
  changes", not "Changes proposed").
- One word per idea. The customer is a **client** everywhere, never
  "couple" (events aren't all weddings). Booking stages are **Deposit due**,
  **Upcoming** and **Done** on every page; `vendorPlan`'s `BookingTab` keys
  (`deposit_due`, `confirmed`, `over`) are internal and don't change. The
  Leads page keeps its name and its Inquiries / Negotiations tabs.
- No kicker + title pairs that say the same thing twice ("Inbox" over
  "Messages").
- Numbers come with their noun ("$1,700 waiting to be paid"), not a bare
  figure under a label.

## Commands

```bash
npm run install:app              # first time: npm ci at the workspace root
npm --prefix web run dev         # dev server at localhost:3000/app
npm --prefix web run lint        # eslint (this app only)
npm --prefix web run typecheck   # tsc --noEmit
npm --prefix web run test        # vitest (pure-logic unit tests only)
npm run test:e2e                 # playwright, mocked backend — see web/e2e/
npm run test:e2e:staging         # playwright against the real staging stack
npm run build                    # client + vendor next build, exported into public/
npm run deploy                   # build + verified deploy (CI normally does this)
npm run deploy:once              # build + single-shot deploy, unverified
```

A husky pre-commit hook (the monorepo root's `.husky/pre-commit`, config in
`lint-staged.config.mjs`) runs eslint on staged `web/` files plus a full
`typecheck` before every commit — `npm install` at the repo root wires it up
via the `prepare` script. It's a fast local gate, not a substitute for CI: it doesn't run
Vitest or Playwright. The root `.github/dependabot.yml` opens weekly update PRs.

CI is the monorepo root's `.github/workflows/ci.yml`, which runs
`app.yml` for each app a change touches (a client change runs the vendor
job too). Per app: `build` (lint, typecheck, Vitest, `next build`) and `e2e`
(Playwright, below) on every PR, plus a PR preview at
`pr-<n>.<project>.pages.dev` against the staging backend. On a push to
`main`: deploy to staging (`staging.<project>.pages.dev`), then
`Staging checks` (`staging-e2e.yml`: a real contract sent, negotiated and
signed against the staging backend), then production once they pass and
someone approves the `production` environment in the
Actions tab (approve only the newest waiting run). Merging is what starts a
release — there's no separate manual deploy step in the normal flow. The
Vitest suite stays narrow on purpose — pure-logic unit tests for
`web/src/lib` (pricing, planning/vendorPlan rules, …) — component-level and user-flow coverage lives in
Playwright instead, so a UI change should get an E2E test or a manual pass
through the dev server, not a component test here.

`main` is a protected branch (GitHub branch protection: PR required, status
checks must pass, no force-push/delete) — a direct `git push` to `main` is
rejected. Branch per change, open a PR, merge once CI is green.

**End-to-end tests** (`web/e2e/`, `web/playwright.config.ts`) drive a real
Chromium against `next dev`, with every backend call intercepted at the
network layer — `NEXT_PUBLIC_API_BASE_URL` points `next dev` at a fake,
non-resolving host (`web/e2e/support/api-base.ts`) so a route with no
registered mock fails loudly (404) instead of silently reaching the real
production backend (see `@jorna/shared/lib/api`'s default `API_BASE` —
that's what a run with the real env var would hit). `web/e2e/support/api-mock.ts`
is the per-test mock router (`api.get/post/patch/put/delete`, `:id`-style
path params, `api.error()` for non-2xx); `web/e2e/support/fixtures.ts`'s
`loginAs()` seeds a signed-in session by writing `auth.tsx`'s localStorage
keys directly, skipping the real login form for tests that don't need to
exercise it. Add a spec next to the existing ones in `web/e2e/` when a
flow is worth covering beyond a manual dev-server check — favor the ones with real logic (gating, redirects, status-dependent
rendering) over pure layout. The suite runs with escrow on (the
Stripe specs need it); a spec named `*.noescrow.spec.ts` runs instead against
a second dev server with escrow off, as production is (`playwright.config.ts`).

Note: `react-hooks/set-state-in-effect` is an error (it was a warning until
[issue #2](https://github.com/jornaevents/jorna-website/issues/2) was
worked through). Don't set state synchronously in an effect: derive it during
render, keep a loaded value with the key it was loaded for (see `nav.tsx`'s
badges or `app/vendor/page.tsx`), or set it only when a promise settles (write
the load as a `.then` chain — the rule doesn't follow `await`).

## Issue & work tracking

Work is tracked in one place: the org's GitHub Project,
["Jorna Dev Board"](https://github.com/orgs/jornaevents/projects/1)
(Status: Backlog → Todo → In Progress → In Review → Done). Open issues with `.github/ISSUE_TEMPLATE/bug_report.md` or
`feature_request.md` — both have a "cross-repo impact" section, since a
web-app change sometimes needs a matching backend issue/PR in
`jorna-backend`. (The iOS app, `jorna-ios`, is paused — don't plan for it
unless asked.)

This repo has the board's native "Auto-add to project" workflow enabled
(GitHub Free caps that at one source repo per project, and this is the one),
so a new issue or PR here lands on the board automatically. Still move its
Status yourself as work progresses (In Progress → In Review once a PR is
open → Done once merged) — a PR closes its issue only if its description
says `Closes #N`.

## Maintaining this context layer

- When a change is architecturally meaningful (new subsystem, changed data
  flow, new external service, a convention worth enforcing), update the
  relevant file in `docs/` in the same change — don't let it drift.
- Keep `docs/*` navigational: link to source files rather than copying
  implementation details or large code blocks into prose.
- **When a task gets complex, or context is running low**, write a handoff
  summary to `.claude/context/current-task.md` (goal, status, discoveries,
  files changed, decisions, blockers, remaining work, verification status —
  see the template in that file). Keep it under ~2,000 tokens. A fresh
  session should be able to read that one file and continue without
  re-exploring the repo.
- When starting a new unrelated task, reset `current-task.md` rather than
  appending to stale content from a previous task.
