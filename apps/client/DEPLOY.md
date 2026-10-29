# Deploying book.jornaevents.com

> **Since 2026-10-29 the app itself is served at jornaevents.com/client**,
> built and deployed with the vendor app (`apps/vendor`: its build runs this
> app's `next build` and copies `web/out` to its `public/client`). See
> `apps/vendor/DEPLOY.md`. This project, `jorna-events`, now publishes only
> `public/_redirects`, so every old book.jornaevents.com address 301s to the
> same page at its new one; `scripts/deploy.mjs` verifies those redirects.
> **Release order:** approve the vendor deploy (which adds `/client`) before
> this one (which starts redirecting to it). The rest of this file describes
> the setup as it was before the move.

The site (the web app, serving both `/` and `/app`, plus a small static
`/help` page) is a static export in `public/`, hosted on **Cloudflare Pages**
(project `jorna-events`). `book.jornaevents.com` is a custom domain on that
project — relocated here from the `jornaevents.com` apex, which now belongs
to the `jorna-vendor` project/repo (see that repo's own `DEPLOY.md`). The old
Workers Static Assets deployment (`misty-water-0dbb`) is deleted. There is no
separate marketing page anymore — see "Root routing" in `docs/ARCHITECTURE.md`.

> **Why Pages, not Workers.** It was on Workers Static Assets, whose many-file
> asset serving intermittently dropped every `/app` route (marketing page stayed
> up, app 404'd) even after a deploy verified green. Pages is built for
> many-file static exports and serves them reliably.

## Deploy

**Automatic:** merging a PR into `main` deploys in two steps, both in the
root `.github/workflows/app.yml`. `deploy-staging` builds against the staging
backend (`STAGING_API_BASE_URL` Actions variable) and publishes to the Pages
branch `staging` → `https://staging.jorna-events.pages.dev`. Then `deploy` waits
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

**Verification target differs between CI and a human running it locally.**
`scripts/deploy.mjs` defaults to verifying against
`https://book.jornaevents.com`, overridable via `DEPLOY_DOMAIN`. The `deploy`
job in CI sets `DEPLOY_DOMAIN=https://jorna-events.pages.dev` because the
`jornaevents.com` zone's (which `book.jornaevents.com` is a subdomain of)
bot/WAF protection 403s every request from GitHub Actions' runner IPs —
confirmed by hand: the `wrangler` upload itself always succeeds, only the
runner's own follow-up verification fetches got blocked, and the exact same
routes were a clean 200 from every other network tested. `pages.dev` is the
same Cloudflare Pages deployment without that zone's WAF rules, so it still
proves the deploy went live; running `npm run deploy` locally verifies the
real production domain as before (unaffected, since your own network isn't
blocked). Re-confirm this assumption still holds after the domain move —
zone-level WAF rules normally apply to every hostname in the zone including
subdomains, but this hasn't been re-verified against `book.jornaevents.com`
specifically since the cutover.

## Gotcha: don't byte-compare the apex against `*.pages.dev`

The zone injects a Cloudflare bot-detection script (`__CF$cv$params`, ~938
bytes, appended before `</body>`) into HTML served through the custom domain.
`jorna-events.pages.dev` does **not** get that injection.

So the same deployment serves different bytes on the two hostnames, always. A
hash or size comparison between them will report a perfectly current apex as
"stale" — that misreading cost an afternoon once already. To compare properly,
strip the injected script first:

```bash
diff <(curl -s https://jorna-events.pages.dev/app/login/  | sed 's|<script>(function(){function c().*</script>||') \
     <(curl -s https://book.jornaevents.com/app/login/    | sed 's|<script>(function(){function c().*</script>||')
```

Note also that `/app/*` pages are client-rendered behind `<Suspense>`, so their
served HTML contains none of the UI text — grepping the HTML for a string you
just added will find nothing on either host. It lives in the JS bundle.

## Per-PR staging previews

Every PR gets its own live preview, deployed by the `preview` job in
`.github/workflows/ci.yml`: `wrangler pages deploy public --branch
pr-<PR number>` — a non-production `--branch` value makes Cloudflare Pages
create a **preview** deployment instead of promoting to production, at
`https://pr-<n>.jorna-events.pages.dev`. It does not touch `book.jornaevents.com`
or the bare `jorna-events.pages.dev` domain, both still owned solely by the
`deploy` job on merge to `main`. The job posts (and updates, on new pushes)
a sticky PR comment with the link.

This used to be a dead end — backend CORS rejected any `*.pages.dev` origin,
so a preview rendered but every API call failed. The backend now sets
`ALLOWED_ORIGIN_REGEX=^https://([a-z0-9-]+\.)?jorna-events\.pages\.dev$` on
Railway (ORed with `ALLOWED_ORIGINS` by `CORSMiddleware`), which covers any
`pr-<n>.jorna-events.pages.dev` preview without editing Railway per PR.

**Previews use the staging backend** (its own Railway environment and
database) once `STAGING_API_BASE_URL` is set, so walking a booking or contract
flow on a preview writes test data, not production data. CI adds the staging
API to the build's CSP `connect-src` (`.github/scripts/csp-allow-api.sh`); the
committed `public/_headers` only allows production. Verify the staging
backend's CORS allows a preview URL (`$API` = the staging API) with:

```bash
curl -i -X OPTIONS -H "Origin: https://pr-999.jorna-events.pages.dev" \
    -H "Access-Control-Request-Method: POST" $API/auth/login
# expect: access-control-allow-origin: https://pr-999.jorna-events.pages.dev
```
