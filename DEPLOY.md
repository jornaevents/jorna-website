# Deploying jornaevents.com

The site (the web app, serving both `/` and `/app`, plus a small static
`/help` page) is a static export in `public/`, hosted on **Cloudflare Pages**
(project `jorna-events`). The apex `jornaevents.com` is a custom domain on
that project. The old Workers Static Assets deployment (`misty-water-0dbb`)
is deleted. There is no separate marketing page anymore — see "Root routing"
in `docs/ARCHITECTURE.md`.

> **Why Pages, not Workers.** It was on Workers Static Assets, whose many-file
> asset serving intermittently dropped every `/app` route (marketing page stayed
> up, app 404'd) even after a deploy verified green. Pages is built for
> many-file static exports and serves them reliably.

## Deploy

**Automatic:** merging a PR into `main` deploys. `.github/workflows/ci.yml`'s
`deploy` job runs `npm run deploy` once `build` and `e2e` both pass, using a
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secret pair (Pages:Edit
scope) instead of a local `wrangler login` session. `main` is a protected
branch (GitHub branch protection, PR required), so this is the only path a
change reaches production through.

**Manual** (hotfix, or deploying from a machine when CI itself is down):
```bash
npm run deploy
```

Installs `web/`'s dependencies fresh from the lockfile (`npm ci`, not
whatever a developer's local `node_modules` happens to hold), builds the app
into `public/app`, runs `wrangler pages deploy public`, then fetches every
route on `https://jornaevents.com` and re-deploys until they all serve 200
for three consecutive sweeps (see `scripts/deploy.mjs`). `npm run deploy:once`
is the raw single-shot and skips the `npm ci` step.

## Gotcha: don't byte-compare the apex against `*.pages.dev`

The zone injects a Cloudflare bot-detection script (`__CF$cv$params`, ~938
bytes, appended before `</body>`) into HTML served through the custom domain.
`jorna-events.pages.dev` does **not** get that injection.

So the same deployment serves different bytes on the two hostnames, always. A
hash or size comparison between them will report a perfectly current apex as
"stale" — that misreading cost an afternoon once already. To compare properly,
strip the injected script first:

```bash
diff <(curl -s https://jorna-events.pages.dev/app/login/ | sed 's|<script>(function(){function c().*</script>||') \
     <(curl -s https://jornaevents.com/app/login/      | sed 's|<script>(function(){function c().*</script>||')
```

Note also that `/app/*` pages are client-rendered behind `<Suspense>`, so their
served HTML contains none of the UI text — grepping the HTML for a string you
just added will find nothing on either host. It lives in the JS bundle.

## `*.pages.dev` is not a usable staging URL

Backend CORS allows `https://jornaevents.com` and **rejects**
`https://jorna-events.pages.dev` — verified by preflight:

```
$ curl -i -X OPTIONS -H "Origin: https://jornaevents.com" \
    -H "Access-Control-Request-Method: POST" $API/auth/login
HTTP/1.1 200 OK
access-control-allow-origin: https://jornaevents.com

$ curl -i -X OPTIONS -H "Origin: https://jorna-events.pages.dev" ...
HTTP/1.1 400 Bad Request
```

The pages.dev deployment renders but cannot reach the API — every sign-in,
booking, and listing call fails CORS. To use it as a real staging environment,
add that origin to `ALLOWED_ORIGINS` on Railway (the backend reads it from the
environment; it is not in the repo).
