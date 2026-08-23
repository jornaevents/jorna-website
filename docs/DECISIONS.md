# Architectural Decisions

Lightweight log of decisions discovered in the code and existing docs (commit
history, code comments, `DEPLOY.md`, `README.md`). Not all of these are
formal ADRs — some are conventions inferred from consistent code comments.
Where the rationale isn't evidenced anywhere, that's stated explicitly rather
than guessed.

## Decision: Cloudflare Pages instead of Workers Static Assets

### Context
The site was originally deployed as a Cloudflare Worker using Static Assets.

### Decision
Migrated to a Cloudflare Pages project (`jorna-events`) serving `public/`.
The old Worker (`misty-water-0dbb`) has been deleted.

### Consequences
Deploy tooling (`scripts/deploy.mjs`, `npm run deploy`) targets `wrangler
pages deploy`, not `wrangler deploy`. `wrangler.jsonc` config is now minimal
(`pages_build_output_dir`).

**Why:** Workers Static Assets' many-file asset serving intermittently
dropped every `/app` route (the marketing page kept working, the app 404'd)
even after a deploy reported success. Documented in `DEPLOY.md` and
`wrangler.jsonc` comments.

---

## Decision: self-verifying deploy script

### Context
`wrangler`'s incremental asset upload has, in practice, silently dropped
files while still printing a "Deployed" success line — leaving production
partially broken with no error signal.

### Decision
`npm run deploy` (→ `scripts/deploy.mjs`) builds once, deploys, then actually
fetches every route on the live domain and re-deploys until all routes serve
200 across three consecutive sweeps. `npm run deploy:once` remains available
as the unverified single-shot for when that's specifically wanted.

### Consequences
A bare `wrangler deploy`/`wrangler pages deploy` should not be used for
routine deploys — it skips this verification. See `docs/MODULE_MAP.md`
"Build & deploy tooling."

---

## Decision: web app is a fully client-rendered static export, not SSR

### Context
The web app (`web/`) needs to call an external FastAPI backend for all data;
there is no backend logic that needs to run in this repo.

### Decision
Next.js is configured with `output: "export"` and `basePath: "/app"`
(`web/next.config.ts`). Every page is a client component; the export is
static HTML/JS served by Cloudflare Pages alongside the marketing page — no
Next.js server runs anywhere.

### Consequences
- No server components with real server-side data fetching are possible;
  data fetching happens in the browser via `web/src/lib/jorna.ts`.
- Served HTML for `/app/*` routes carries no UI copy (it's behind
  `<Suspense>`) — don't try to verify content by grepping fetched HTML; see
  `DEPLOY.md`.
- Deploying requires copying the export into `public/app/` first
  (`web/scripts/export-to-public.mjs`), which is why `public/app/` is
  generated + gitignored rather than committed.

---

## Decision: the site root permanently serves the app's Home route; the legacy static page is retired

### Context
Originally, `public/index.html` was a hand-written marketing page served at
`/`, separate from the Next app under `/app`.

### Decision
As of commit `58ce333` (2026-07-31), `public/_redirects` rewrites `/` to
`/app/` (HTTP 200 rewrite, not a redirect), which renders
`web/src/app/page.tsx` → the app's own `home/page.tsx`. `public/index.html`
itself was deleted in that same commit — confirmed as of 2026-08-22 it is
not on disk and not in `git ls-files`, and this is a permanent decision, not
an interim state: the app's Home page is the site's front door going
forward, with no plan to restore the standalone file.

### Consequences
`README.md` and `docs/ARCHITECTURE.md`/`docs/MODULE_MAP.md` were corrected
(2026-08-22) to stop describing `public/index.html` as present-but-
unreachable — several revisions after the file was actually deleted had
still described it that way, which is itself a caution: re-verify this kind
of claim against `git ls-files`/`ls public/`, not just against the last doc
that mentioned it. The "design tokens duplicated by hand" tradeoff described
elsewhere in this file no longer applies for the marketing page specifically
— `web/src/app/globals.css` is now the only place brand tokens live.
`public/help/index.html` is the one remaining hand-written, no-build-step
static file. See "Root routing" in `docs/ARCHITECTURE.md`.

---

## Decision: two auth paths — direct password auth vs. Supabase-mediated OAuth

### Context
The product needs both simple email/password accounts and "Sign in with
Google."

### Decision
Password auth talks directly to the backend, which issues Jorna's own JWTs.
Google OAuth is handled by Supabase purely as an identity provider; the
resulting Supabase token is exchanged for a Jorna session
(`adoptSession`/`/auth/callback`). Supabase never becomes the source of
truth for sessions.

### Consequences
Two different token systems exist in the codebase (Supabase's and Jorna's)
but only Jorna's is used past the callback step. See `docs/API.md`.

---

## Decision: centralized "what's outstanding" task rules

### Context
Multiple surfaces (client dashboard, vendor dashboard, the tab-bar attention
badge) need to agree on what a user still needs to do. An early version had
a task kind ("vendor-reply") that wasn't actually actionable, which made a
"6 things need you" list contain things the user couldn't act on.

### Decision
`web/src/lib/planning.ts` (client) and `web/src/lib/vendorPlan.ts` (vendor)
are the single source of truth for task/attention rules. `lib/attention.ts`
(the badge) and the dashboard pages both read from these rather than
re-deriving their own logic. Every rule is written to mirror an actual
backend guard.

### Consequences
Changing what counts as "needs attention" means changing these two files —
adding parallel logic elsewhere will cause the badge and the dashboard to
disagree, which is the exact bug this convention exists to prevent.

---

## Decision (superseded 2026-08-22): marketing design tokens duplicated rather than shared

### Context
The marketing page (`public/index.html`) was deliberately kept as a
build-step-free static file, but the app (`web/`) uses Tailwind v4 and needed
the same palette.

### Decision
The same color/font tokens were defined twice: inline in `public/index.html`
and as Tailwind `@theme` variables in `web/src/app/globals.css`, kept in sync
by hand rather than by a shared source file.

### Consequences
**Superseded**: `public/index.html` was deleted in commit `58ce333`
(2026-07-31; see the root-routing decision above) and the app's Home page is
now the permanent site root. `web/src/app/globals.css` is the sole source of
brand tokens — there is nothing left to hand-sync. `DESIGN_BRIEF.md` still
lists the full token set as a readable reference; verify against
`globals.css` if a color looks off, same as before.

---

## Decision: Figma Make exports are not committed

### Context
Some UI (e.g. the marketing Home screen, the vendor dashboard) was designed
via Figma Make, which exports a full standalone Vite app (`*.make` files,
~1.4 MB each, containing a git repo in packfiles).

### Decision
`*.make` files are gitignored. What matters from them is ported by hand into
`web/src/app` / `web/src/components`; the raw exports are kept locally only,
to be unzipped and re-read as needed.

### Consequences
There's no in-repo record of the original Figma Make output — only the
ported result and whatever the `.make` file holder still has on disk. If you
need to re-derive a screen from a Make export, check with whoever has the
local file; it will not be in `git log`.
