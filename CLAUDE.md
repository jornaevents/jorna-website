# Jorna web — agent instructions

Two apps in one repo (`jornaevents/jorna-website`), served together on
jornaevents.com since 2026-10-29 — one site, one sign-in:

- `apps/vendor` — the root and `/app`: the marketing pages, the vendor
  dashboard and the contract signing page.
- `apps/client` — `/client`: hosts planning their events. The vendor app's
  build also builds this app and ships it at `/client` in the same deploy.
  The client app's own Pages project (`jorna-events`, book.jornaevents.com)
  now only 301-redirects old links there.

Each app has its own `CLAUDE.md`, docs and README — read the one for the app
you're changing, and run its commands from that app's folder (paths in its
docs, like `web/src/...`, are relative to it). The backend is a separate
repo, `jornaevents/jorna-backend` (often checked out as `Desiconnect`).

Code both apps use lives once in `packages/shared` (`@jorna/shared`:
`lib/` — api, auth, flags, pricing, negotiation, contract drafts, taxonomy,
… — `components/`, `styles/globals.css`, `fonts/`). A change there ships to
both apps.

What lives at the root instead of in each app:

- **CI** — `.github/workflows/ci.yml` picks the apps a change touches and
  runs `.github/workflows/app.yml` for each (checks, PR preview, staging,
  production). A client change also runs the vendor job, since the vendor
  deploy carries the client app. `staging-e2e.yml` is the real-stack check
  against staging; `warm-caches.yml` keeps CI caches warm. Where an app's
  own docs describe "the CI workflow", this is it.
- **Dependencies** — one npm workspace (`apps/*/web`, `packages/*`) with one
  lockfile. `npm install` at the root; never inside an app, which would make
  a second lockfile.
- **The pre-commit hook** — `.husky/pre-commit` + `lint-staged.config.mjs`,
  lint and typecheck for whichever app (or the shared package) is staged.
- **Dependabot and issue templates** — `.github/`.

The apps still duplicate what had drifted apart before the merge (each
app's `web/src/lib/jorna.ts`, most of `types.ts`, `planning.ts`, and
components built on them). Until those are reconciled into
`packages/shared`, a fix to one usually belongs in both apps — check the
other copy. Auth already is shared (`@jorna/shared/lib/auth`); each app's
`lib/auth.tsx` only wraps it with its own caches and sign-out destination.

`main` is protected: branch per change, open a PR, merge once CI is green
(ask for a review on anything touching auth or money; put `Closes #N` in
the PR so the board closes its issue). Merging deploys each changed app to
staging (`staging.<project>.pages.dev`, against the staging backend). For
the vendor app, `Staging checks` (staging-e2e.yml) then run against it, and
production waits for them to pass and for someone to approve the
`production` environment in the Actions tab — approve only the newest
waiting run; an older one would roll production back. PR previews and
local dev use the staging or a local backend, never production — see
jorna-backend's `docs/STAGING.md`.

The iOS app (`jornaevents/jorna-ios`) is paused; don't plan for it unless
asked.
