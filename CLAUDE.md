# Jorna web — agent instructions

Two apps in one repo: `apps/client` (book.jornaevents.com, hosts) and
`apps/vendor` (jornaevents.com, vendors and the contract signing page). Each
has its own `CLAUDE.md`, docs and README — read the one for the app you're
changing, and run its commands from that app's folder (paths in its docs,
like `web/src/...`, are relative to it).

Code both apps use lives once in `packages/shared` (`@jorna/shared`,
imported as `@jorna/shared/lib/api`, `@jorna/shared/components/ui`,
`@jorna/shared/styles/globals.css`). A change there ships to both apps.

What lives at the root instead of in each app:

- **CI** — `.github/workflows/ci.yml` picks the apps a change touches and
  runs `.github/workflows/app.yml` for each (checks, PR preview, deploy on
  `main`). Where an app's own docs describe "the CI workflow", this is it.
- **Dependencies** — one npm workspace (`apps/*/web`, `packages/*`) with one
  lockfile. `npm install` at the root; never inside an app, which would make
  a second lockfile.
- **The pre-commit hook** — `.husky/pre-commit` + `lint-staged.config.mjs`,
  lint and typecheck for whichever app (or the shared package) is staged.
- **Dependabot and issue templates** — `.github/`.
- **Work tracking** — every feature or fix has an issue on the Jorna Dev Board
  whose status matches the work; the steps are under "Issue & work tracking"
  in each app's `CLAUDE.md`.

The apps still duplicate what had drifted apart before the merge
(`web/src/lib/jorna.ts`, most of `types.ts`, and components built on them).
Until those are reconciled into `packages/shared`, a fix to one usually
belongs in both apps — check the other copy. Auth already is shared
(`@jorna/shared/lib/auth`); each app's `lib/auth.tsx` only wraps it with its
own caches and sign-out destination.

`main` is protected: branch per change, open a PR, merge once CI is green
(no approval is required for now — ask for a review on anything touching
auth or money). Merging deploys each changed app to staging
(`staging.<project>.pages.dev`, against the staging backend), then to
production once someone approves the `production` environment in the Actions
tab. PR previews and local dev use the staging or a local backend, never
production — see jorna-backend's `docs/STAGING.md`.
