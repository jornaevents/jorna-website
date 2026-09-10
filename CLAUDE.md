# Jorna website — agent instructions

Jorna is a marketplace for planning South Asian celebrations (matching
clients with vendors, bundling services, escrow-backed booking/payment).
**This repo is frontend-only**: a client-rendered Next.js web app — served at
both `/` (its own Home page doubles as the marketing site) and `/app` — plus
a small hand-written help page at `/help`, all deployed as static files to
Cloudflare Pages. The backend (FastAPI, Python) lives in a separate
repository (`Desiconnect/server`) and is not checked out here — treat it as
an external API reachable only over HTTP.

## Layout

```
public/            served by Cloudflare Pages — public/app/ is a GENERATED,
                    gitignored build output; don't hand-edit it
web/                Next.js 16 / React 19 / TS / Tailwind v4 source for /app
scripts/            deploy + build tooling
docs/               architecture docs (read before cross-cutting changes)
.claude/context/    current-task.md — working memory for in-progress tasks
*.md (root)         DEPLOY.md, STRIPE_GO_LIVE.md and README.md are current
                    ops/overview docs, kept accurate; the rest
                    (CLIENT_FLOW_PLAN, WEB_PARITY_PLAN, MESSAGING_PROPOSAL,
                    RESCHEDULE_PROPOSAL, VENDOR_DASHBOARD_BRIEF,
                    DESIGN_BRIEF) are proposals and build plans, not
                    always-current architecture. Most now carry their own
                    "done"/"shipped" note at the top once verified against
                    the code — but still check the code before trusting one
                    as still accurate on any specific claim.
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
  in progress (see "Context handoff" below).

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
  `web/src/lib/api.ts` (transport). No ad-hoc `fetch()` in components.
- Price values are always the `price_min`/`price_max`/`price_unit`/
  `price_pending_quantity` shape — never format a bare number by hand.
- `public/app/` is generated (gitignored); never edit it directly, and never
  ship with a bare `wrangler deploy` — use `npm run deploy` (see
  `docs/DECISIONS.md` for why).

## Commands

```bash
npm run install:app              # first time: install web/ dependencies
npm --prefix web run dev         # dev server at localhost:3000/app
npm --prefix web run lint        # eslint (web app only)
npm --prefix web run typecheck   # tsc --noEmit
npm --prefix web run test        # vitest (pure-logic unit tests only)
npm run test:e2e                 # playwright — see web/e2e/
npm run build                    # next build + export into public/app
npm run deploy                   # build + verified deploy to Cloudflare Pages
npm run deploy:once              # build + single-shot deploy, unverified
```

A husky pre-commit hook (`.husky/pre-commit`, config in `lint-staged.config.mjs`)
runs eslint on staged `web/` files plus a full `typecheck` before every
commit — `npm install` at the repo root wires it up via the `prepare`
script. It's a fast local gate, not a substitute for CI: it doesn't run
Vitest or Playwright. `.github/dependabot.yml` opens weekly update PRs for
`web/`, the root (wrangler), and GitHub Actions.

CI (`.github/workflows/ci.yml`) has three jobs: `build` (lint, typecheck,
Vitest, `next build`) and `e2e` (Playwright, below) run on every push/PR to
`main`; `deploy` runs only after both pass on an actual push to `main` and
ships to Cloudflare Pages (see `DEPLOY.md`) — merging a PR is what puts a
change into production, there's no separate manual deploy step in the
normal flow. The Vitest suite stays narrow on purpose — pure-logic unit
tests for `web/src/lib` (pricing, planning/vendorPlan rules) — component-
level and user-flow coverage lives in Playwright instead, so a UI change
should get an E2E test or a manual pass through the dev server, not a
component test here.

`main` is a protected branch (GitHub branch protection: PR required, status
checks must pass, no force-push/delete) — a direct `git push` to `main` is
rejected. Branch per change, open a PR, merge once CI is green.

**End-to-end tests** (`web/e2e/`, `web/playwright.config.ts`) drive a real
Chromium against `next dev`, with every backend call intercepted at the
network layer — `NEXT_PUBLIC_API_BASE_URL` points `next dev` at a fake,
non-resolving host (`web/e2e/support/api-base.ts`) so a route with no
registered mock fails loudly (404) instead of silently reaching the real
production backend (see `web/src/lib/api.ts`'s default `API_BASE` — that's
what a run with the real env var would hit). `web/e2e/support/api-mock.ts`
is the per-test mock router (`api.get/post/patch/put/delete`, `:id`-style
path params, `api.error()` for non-2xx); `web/e2e/support/fixtures.ts`'s
`loginAs()` seeds a signed-in session by writing `auth.tsx`'s localStorage
keys directly, skipping the real login form for tests that don't need to
exercise it. Add a spec next to the existing ones (`home`, `auth`,
`marketplace`, `booking`, `vendor-onboarding`, `vendor-bookings`,
`vendor-earnings`) when a flow is worth covering beyond a manual dev-server
check — favor the ones with real logic (gating, redirects, status-dependent
rendering) over pure layout.

Note: `web/eslint.config.mjs` downgrades `react-hooks/set-state-in-effect`
to a warning rather than error — see the comment there and
[issue #2](https://github.com/jornaevents-commits/jorna-website/issues/2) before
"fixing" any of those warnings casually; each one needs individual review; a
blanket rewrite risks changing auth/booking/payment behavior.

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
