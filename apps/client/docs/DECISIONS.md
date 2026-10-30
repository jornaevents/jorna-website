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

---

## Decision: Escrow disabled for the MVP via an ESCROW_ENABLED flag

### Context
The MVP cuts Jorna down to a leaner product: vendors get paid off-platform
via a Venmo handle and/or Zelle contact on their profile, not through Stripe
checkout/escrow. The manual Venmo/Zelle track already existed in the backend
and this repo as an opt-in alternative to Stripe (`payment_method: "stripe" |
"manual"` on `VendorDetail`/bookings), so this wasn't new payment
infrastructure — it was making that existing alternative the only one shown,
without ripping out the Stripe code paths in case escrow comes back later.

### Decision
`web/src/lib/flags.ts` exports `ESCROW_ENABLED` (from
`NEXT_PUBLIC_ESCROW_ENABLED`, defaults `true`), mirroring the backend's flag
of the same name (`Desiconnect/server/app/config.py`). With it `false`:

- `VendorPaymentFields` (`components/VendorProfileFields.tsx`) renders only
  the Venmo/Zelle inputs — no Stripe/manual radio choice.
- The Stripe-onboarding banner on `/vendor` and the Stripe readiness gate/CTA
  on `/my-earnings` don't render; `getStripeStatus()` isn't even fetched
  (`/my-earnings`, `/my-dashboard`), so `vendorTasks()` never emits a
  `"stripe"` task (it already treats a `null` status as "nothing to check").
  `/my-earnings` gained a standing "Payment details" card using the shared
  `VendorPaymentFields` component instead of its own duplicate Venmo/Zelle
  form — consolidating what used to be two separate implementations of the
  same fields (this page and `/vendor-profile`).
- `/vendor-onboarding`'s "reach" step (step 2 of 3) also collects Venmo/Zelle
  and won't advance without at least one — there was previously no point in
  the wizard that asked for payment info at all, since Stripe onboarding
  happened later, out-of-band, on `/my-earnings`.

Nothing was deleted: the Stripe checkout branch in `/bundle`, the Connect
onboarding pages (`/vendor/stripe-onboard/*`), `/payment-complete`,
`/card-saved` are all left as unreachable dead routes/branches once the
backend's own flag forces every booking's `payment_method` to `"manual"` —
see the backend's `docs/DECISIONS.md` #12 for that half of the mechanism.

### Consequences
Flipping `NEXT_PUBLIC_ESCROW_ENABLED` back to `true` (the default) and
rebuilding restores the Stripe UI exactly as it was — no code revert needed.
A vendor row saved while the flag was off always has `payment_method:
"manual"` with at least one contact method; nothing here retroactively edits
a vendor who already had `payment_method: "stripe"` on file, since the
backend's booking-time override is what actually keeps new bookings off
Stripe regardless of what a vendor's profile still says.

## Decision: vendors are served by jornaevents.com only

- **Date:** 2026-09-28
- **What:** The seller pages that were still here from before the vendor side
  moved to its own app — `/my-dashboard`, `/my-bookings`, `/my-calendar`,
  `/my-availability`, `/my-earnings`, `/vendor-profile`,
  `/vendor-onboarding`, `/calendar-connected`, `/vendor/stripe-onboard` —
  are deleted, with `lib/vendorPlan.ts`, the vendor tabs and the vendor-only
  components. Old URLs 301 to the same page on jornaevents.com
  (`public/_redirects`). Sign-up here is for hosts; "Become a vendor" and old
  `?role=vendor` links go to the vendor site's sign-up.
- **Why:** Two copies of the seller app had already drifted — contracts,
  templates and payment schedules exist only on jornaevents.com, so a vendor
  working here was missing most of their job. And the backend's links for
  vendors (`WEB_APP_URL`, the Google Calendar return) already point there.
- **A vendor account signing in here** sees `VendorAccountGate`: a notice
  with a link to jornaevents.com and a sign-out, on every page but the
  sign-in ones. It replaces `ClientOnlyRoute`, which guarded only five pages
  and sent vendors to the dashboard that no longer exists here. Sessions
  don't carry across (different origins), so the notice says to sign in there.

## Decision: the request form adds to a plan; only the plan asks the vendors (2026-10-16)

From the 2026-10-05 staging walkthrough (#164, #132), decided 2026-10-14: fields are required only at "Send to vendors", and the form keeps what was typed.

- **One story.** Nothing on `/book` reaches the vendor (on a draft plan), so the page says "Add to your plan", the package page's button says "Add to plan", and both say the date, address and times are needed before the plan is sent — add them now or on the plan.
- **The form never disappears.** A load failure is a page of its own; a refused add is said beside the button. A past date is caught as it's typed, under the date, and holds both add buttons — it used to reach the server and replace the whole form.
- **Unset times read as unset.** The shared `TimeField` shows "--" with neither AM nor PM chosen until a time is picked (picking an hour first lands on :00 PM); it used to show 12:00 AM, which looked like an answer.
- **Add-ons are listed, not picked.** `POST /bookings` takes no add-ons, so the form lists the package's add-ons and says to mention any in the note — the vendor adds them in the contract.
- **"Add to" says where a plan stands:** nothing (draft), "sent to vendors", "partly booked", or "booked" — a plan with a signed contract was "(already sent)".
- **The form sits under Market** in the nav, with the package it came from.
- **Marketplace chips are the vendor categories** (`GET /vendors/categories`), named as vendors see them, with a second row of types for a category that has them (Beauty → Mehndi Artist). Home's picture tiles keep their friendly names and link into the same filters. `/browse` takes a signed-in client to the Marketplace.
- **Addresses:** `parseAddress` puts only a unit (Suite, Apt, Floor, #…) on line 2; a venue name stays with its street, which used to land in "Apartment, suite, floor".
- **Copy:** the plan's headcount hint goes once a count is in; "Your vendor has been asked" for one; "plan", not "bundle". The payment-complete page only mentions escrow when `ESCROW_ENABLED` is on (#132).

## Decision: anyone can send a vendor an inquiry, from their page or the link they share (2026-10-17)

Backend #66, DECISIONS #32 there. Decided 2026-10-17: the form lives on the vendor's page and at a link of its own; short fields; spam is a honeypot plus rate limits.

- **`/inquire?vendor=<id>` is the link vendors share** (Instagram bio, their site): the vendor's name and photo, then the form, with nothing else around it. **"Send an inquiry"** on `/vendor` opens the same form (`InquiryForm`) in a sheet.
- **No account.** Signed in, the name, email and phone are filled in. Signed out, "Ask a question" (a message thread, which needs an account) is hidden and the inquiry is the way in.
- **Name and email are required;** phone, date ("leave it blank if you're not sure yet"), event (suggested from the celebrations list), rough guest count and a message are optional.
- **Errors stay with their field.** The server's messages don't name the field, so the form maps them by what they mention (email, phone, date, guest, name); anything else is said above the button. Nothing typed is lost.
- **The honeypot** is an off-screen `website` input, sent empty by people.
- **A 429 with its own message is shown as written** (a vendor's daily cap: "try again tomorrow"); `parseError` used to replace every 429 with the generic rate-limit line.

## Decision: a returning client signs in to their dashboard (2026-10-29)

A sign-in with nowhere particular to go (no `?next=`) used to land on
`/plan` for everyone, which put a returning client back at step one of a
celebration they'd already planned. Now `lib/landing.ts` (`clientLanding`)
checks their plans and events: any at all, and they land on the dashboard
(`/bundles`); none, the Plan wizard as before. Email and Google sign-in both
use it (`app/login`, `app/auth/callback`). A `?next=` still wins.

## Decision: the app moves to jornaevents.com/client (2026-10-29)

Served beside the vendor app on one site, so one sign-in covers both: basePath
`/client` (was `/app`), built into the vendor app's deploy (see
`apps/vendor/DEPLOY.md`). This app's own Pages project now publishes only
redirects from book.jornaevents.com (`public/_redirects`), and its old help
and 404 pages are gone — jornaevents.com's serve both sides. Links into the
vendor app (`vendorSiteUrl`, contract links) are now same-origin.

## Decision: sign-in hands off to the shared one; sign-up is name, email, password; no second home page (2026-10-29)

- **Signing in** happens on the site's one sign-in page (jornaevents.com/app/login),
  which sends each account to its own dashboard. This app's `/login` keeps
  sign-up and finishing a Google sign-up, and hands a sign-in over there with
  its page as `?next=/client/…`.
- **Sign-up** asks first and last name, email and password — no username,
  age or city (backend #154 derives the username and leaves the rest blank).
- **The client root** (`/client/`, `/client/home/`) was a second landing page
  beside the site's real one. It now sends a signed-out visitor to For clients
  and a signed-in client to their dashboard; the "Home" tab is gone (it would
  be a second Dashboard), and the wordmark goes to the dashboard (signed in)
  or For clients.
- **Links to the vendor app carry their trailing slash** (`vendorSiteUrl`,
  `contractSignUrl`), so they don't cost a 308 on the way.
