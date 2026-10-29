# Deploying jorna-vendor

The site (the web app, serving both `/` and `/app`, plus a small static
`/help` page) is a static export in `public/`, hosted on **Cloudflare Pages**
(project `jorna-vendor` — see `wrangler.jsonc`). This repo was forked from
`jorna-website` (project `jorna-events`, which stays untouched and serves
jornaevents.com) — the two must never share a Cloudflare project name, or
one repo's CI would overwrite the other's production site.

`jornaevents.com` and `www.jornaevents.com` are attached as custom domains
(Cloudflare dashboard → Workers & Pages → jorna-vendor → Custom domains) —
moved here from jorna-website's `jorna-events` project, which now serves the
consumer app at `book.jornaevents.com` instead. The site is also still
reachable at `https://jorna-vendor.pages.dev`.

## Gotcha: don't byte-compare the apex against `*.pages.dev`

The zone injects a Cloudflare bot-detection script (`__CF$cv$params`, ~938
bytes, appended before `</body>`) into HTML served through the custom
domain. `jorna-vendor.pages.dev` does **not** get that injection — see
jorna-website's `DEPLOY.md` for the full story and a byte-diff recipe that
strips it before comparing.

## The client app ships here too (2026-10-29)

`npm run build` builds `apps/client` first, and `web/scripts/export-to-public.mjs`
copies its export (`apps/client/web/out`) to `public/client`, so this project
serves both apps: the vendor app at `/app`, the client app at `/client`. One
origin means one sign-in session for both (they share auth localStorage keys).
`scripts/deploy.mjs` verifies both apps' routes. CI runs this app's job for a
client-only change too (`ci.yml`). book.jornaevents.com (`apps/client`'s own
project) only redirects here — **approve this deploy before that one**, or its
redirects briefly point at a `/client` that isn't there yet.

Google sign-in in the client app returns to `<origin>/client/auth/callback/`,
which must be in Supabase's allowed redirect URLs (Authentication → URL
Configuration) for production, staging and the `pr-*.jorna-vendor.pages.dev`
previews.

## Deploy

**Automatic:** merging a PR into `main` deploys in two steps, both in the
root `.github/workflows/app.yml`. `deploy-staging` builds against the staging
backend (`STAGING_API_BASE_URL` Actions variable) and publishes to the Pages
branch `staging` → `https://staging.jorna-vendor.pages.dev`. Then `deploy` waits
for a reviewer to approve the `production` GitHub environment and runs
`npm run deploy` with the production API URL set explicitly. Both use the
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secrets. `main` is
protected (PR, green CI and one approval), so this is the only path a change
reaches production through.

**Manual** (hotfix, or deploying from a machine when CI itself is down):
```bash
npm run deploy
```

Installs `web/`'s dependencies fresh from the lockfile (`npm ci`, not
whatever a developer's local `node_modules` happens to hold), builds the app
into `public/app`, runs `wrangler pages deploy public`, then fetches every
route and re-deploys until they all serve 200 for three consecutive sweeps
(see `scripts/deploy.mjs`). `npm run deploy:once` is the raw single-shot and
skips the `npm ci` step.

`scripts/deploy.mjs` verifies against `https://jornaevents.com` by default
(`DEPLOY_DOMAIN` env var overrides this). CI sets `DEPLOY_DOMAIN` to
`https://jorna-vendor.pages.dev` because the zone's bot/WAF protection
blocks GitHub Actions runner IPs — see jorna-website's own `DEPLOY.md` for
the full story.

## One-time setup for a fresh Cloudflare Pages project

1. In the Cloudflare dashboard: Workers & Pages → Create → Pages → **Connect
   to Git** is *not* what this repo uses (that's Cloudflare's own build
   pipeline, bypassing this repo's CI gates) — instead, create the project
   with **no** Git connection so this repo's own GitHub Actions `deploy` job
   is the only thing that pushes to it. Easiest way: run
   `npx wrangler pages project create jorna-vendor` once, locally, with
   `wrangler login` authenticated to the right Cloudflare account.
2. Create a Cloudflare API token (My Profile → API Tokens → Create Token →
   "Edit Cloudflare Workers" template, or a custom token scoped to
   `Account.Cloudflare Pages: Edit`) and note the Account ID (right sidebar
   of any zone/dashboard page).
3. Add both as GitHub repo secrets:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --repo jornaevents/jorna-vendor
   gh secret set CLOUDFLARE_ACCOUNT_ID --repo jornaevents/jorna-vendor
   ```
   (`gh secret set` prompts for the value interactively — nothing is echoed
   or logged.)
4. Push to `main` (or merge a PR into it) — the `deploy` job now has what it
   needs.

## Per-PR staging previews

Every PR gets its own live preview, deployed by the `preview` job in
`.github/workflows/ci.yml`: `wrangler pages deploy public --branch
pr-<PR number>` — a non-production `--branch` value makes Cloudflare Pages
create a **preview** deployment instead of promoting to production, at
`https://pr-<n>.jorna-vendor.pages.dev`. It does not touch the production
`jorna-vendor.pages.dev` URL, which only the `deploy` job (on merge to
`main`) owns. The job posts (and updates, on new pushes) a sticky PR comment
with the link.

**Previews use the staging backend** (its own Railway environment and
database) once `STAGING_API_BASE_URL` is set, so walking a booking or contract
flow on a preview writes test data, not production data. CI adds the staging
API to the build's CSP `connect-src` (`.github/scripts/csp-allow-api.sh`); the
committed `public/_headers` only allows production. Verify the staging
backend's CORS allows a preview URL (`$API` = the staging API) with:

```bash
curl -i -X OPTIONS -H "Origin: https://pr-999.jorna-vendor.pages.dev" \
    -H "Access-Control-Request-Method: POST" $API/auth/login
# expect: access-control-allow-origin: https://pr-999.jorna-vendor.pages.dev
```

If that doesn't come back, the backend's `ALLOWED_ORIGIN_REGEX` (Railway env
var on `Desiconnect`) needs a pattern covering `pr-<n>.jorna-vendor.pages.dev`.
As of the jornaevents.com domain cutover, it's
`^https://([a-z0-9-]+\.)?(jorna-events|jorna-vendor)\.pages\.dev$`, which
covers both this repo's and jorna-website's previews; `ALLOWED_ORIGINS` also
now includes `https://jornaevents.com`, `https://www.jornaevents.com`, and
`https://jorna-vendor.pages.dev` for this repo's production traffic.
