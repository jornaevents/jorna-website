# Jorna website — agent instructions

Jorna is a marketplace for planning South Asian celebrations (matching
clients with vendors, bundling services, escrow-backed booking/payment).
**This repo is frontend-only**: a hand-written marketing page plus a
client-rendered Next.js web app, both deployed as static files to Cloudflare
Pages. The backend (FastAPI, Python) lives in a separate repository
(`Desiconnect/server`) and is not checked out here — treat it as an external
API reachable only over HTTP.

## Layout

```
public/            served by Cloudflare Pages — public/app/ is a GENERATED,
                    gitignored build output; don't hand-edit it
web/                Next.js 16 / React 19 / TS / Tailwind v4 source for /app
scripts/            deploy + build tooling
docs/               architecture docs (read before cross-cutting changes)
.claude/context/    current-task.md — working memory for in-progress tasks
*.md (root)         DEPLOY.md, STRIPE_GO_LIVE.md are current ops docs, kept
                    accurate; README.md is stale in two ways (see below); the
                    rest (CLIENT_FLOW_PLAN, WEB_PARITY_PLAN,
                    MESSAGING_PROPOSAL, RESCHEDULE_PROPOSAL,
                    VENDOR_DASHBOARD_BRIEF, DESIGN_BRIEF) are proposals and
                    build plans, not always-current architecture — check the
                    code before trusting one as still accurate. In
                    particular, MESSAGING_PROPOSAL.md and
                    RESCHEDULE_PROPOSAL.md both say "not yet built" but both
                    features shipped within a day of being written — they lag
                    in the *opposite* direction from what you'd expect (more
                    is built than they claim, not less); see docs/BOOKING_FLOW.md.
```

**README.md is stale**: it describes the site as served by "one Cloudflare
Worker" (it migrated to Cloudflare Pages — see `docs/DECISIONS.md`) and
tags the web app "Status: Phase 1" (auth + bundle builder only), when in
fact booking, payment/escrow, messaging, negotiation, reschedule, and the
full vendor side are all built — see `docs/BOOKING_FLOW.md`. Don't take
README.md's status claims at face value; it was already flagged as stale on
the root-routing point in `docs/DECISIONS.md`, and these are two more.

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
  docs here can lag a code change. README.md and the root `*_PLAN.md` /
  `*_PROPOSAL.md` / `*_BRIEF.md` files are known to be stale in specific,
  documented ways (see "Layout" above) — don't assume prose docs are
  self-consistent, and verify a proposal doc's claims against the code before
  treating "it's in a proposal doc" as "it's implemented."

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
npm run build                    # next build + export into public/app
npm run deploy                   # build + verified deploy to Cloudflare Pages
npm run deploy:once              # build + single-shot deploy, unverified
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build on
every push/PR to `main`. The test suite is intentionally narrow — Vitest unit
tests for pure logic in `web/src/lib` (pricing, planning/vendorPlan rules),
not component or end-to-end tests — so still verify UI changes by running the
dev server and exercising the affected flow in a browser.

Note: `web/eslint.config.mjs` downgrades `react-hooks/set-state-in-effect`
to a warning rather than error — see the comment there and
[issue #2](https://github.com/dabkeyanik/jorna-website/issues/2) before
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
