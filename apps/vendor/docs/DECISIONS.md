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
Migrated to a Cloudflare Pages project (`jorna-vendor`) serving `public/`.
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

**Update (2026-09-23):** the escrow wording that was still visible with the
flag off is gone too. In-app money UI is gated on the same flag (so flipping
it back restores it): `/my-earnings` and `/my-dashboard`'s Money section
show Paid directly / Awaiting your confirmation / Upcoming instead of Paid
out / Held in escrow / disputes / refunds / the platform-fee note, via new
`paidDirectly*`/`awaitingConfirmation*` fields on `vendorMoney()`. Marketing
copy (Home, How it works, For clients, For vendors, page descriptions) was
rewritten outright rather than flagged, to describe what's true today: terms
agreed in a signed contract, the client paying the vendor directly by
Venmo/Zelle, and each payment recorded on the booking. It makes no claim of
Jorna holding or protecting money, so re-enabling escrow would mean
rewriting that copy again, not just flipping the flag. Left as-is: text only
reachable with escrow money on file (`/payment-complete`, `/profile`'s
delete-account guard, `/my-bookings`' Stripe release step).

---

## Decision: persistent vendor sidebar, replacing the shared header nav for most seller pages

### Context
The vendor side of the app (pipeline, bookings, contracts, listing) used to
share `SiteHeader`'s top nav and `VendorNav`'s phone pill-strip with the
client-facing marketing/marketplace pages — the same chrome for two very
different products. `my-dashboard/page.tsx` had an explicit note from its own
2026-07-27 port explaining why a left sidebar from that Figma design was
*not* carried over: "the app has a header nav and a phone tab bar already,
and a third shell would make the vendor side feel like a different product."

A second Figma Make prototype ("sprint-center", 2026-09-22) made the case the
other way: a persistent sidebar (Dashboard/Bookings/Contracts/Clients/
Settings) that makes the vendor dashboard the app's primary surface for a
vendor, not one destination in a nav shared with the marketing site.

### Decision
Reversed the 2026-07-27 call. `VendorSidebar` (`web/src/components/
VendorSidebar.tsx`) now wraps five vendor routes via a route group
(`web/src/app/(vendor)/layout.tsx`): `/my-dashboard`, `/my-bookings`,
`/contracts/new`, `/clients` (new), `/vendor-profile`. `ChromeGate`
(`web/src/components/ChromeGate.tsx`) hides `SiteHeader`/`SiteFooter` on
those routes by pathname — the one conditional-chrome check in the app.
`/my-pipeline` (the kanban board + Leads/Clients tabs) was folded into
`/my-dashboard`; Clients was promoted to its own route; Leads stayed a
`?view=leads` tab on Dashboard (no sidebar slot for it in the new design).
`/my-calendar` and `/my-earnings` are **not** in the sidebar (only 5 items in
the design) and keep using the old header nav + `VendorNav`.

The marketing Home page at `/` is unchanged — this is a rebuild of the
signed-in vendor experience, not a reversal of the separate "root is the
marketing Home" decision above.

The sidebar also introduces the app's first manual light/dark toggle
(`web/src/lib/theme.ts`) — `globals.css`'s `data-theme` mechanism existed
already but nothing before this ever set it; the app only ever followed
`prefers-color-scheme`.

### Consequences
A vendor now has two different navigation chromes depending on which page
they're on (sidebar on the five shell routes, shared header everywhere else,
including Calendar/Earnings and any client-facing page they visit). This is
a deliberate, disclosed tradeoff, not an oversight — moving Calendar/Earnings
into the sidebar too, or giving the whole app one nav system, is future work
if the sidebar's scope grows past its initial five destinations.

**Update (2026-09-23):** that future work happened. Calendar and Earnings
moved into the `(vendor)/` route group, and Messages got a sidebar item —
eight destinations in all — so a vendor no longer drops out of the sidebar
to reach any seller page. Messages is shared with clients and can't join the
route group, so it gets the sidebar only when the viewer is a vendor
(`ChromeGate`'s `useVendorShell`, `VendorShellIfVendor`); while the role is
still loading, that page shows a placeholder rather than rendering bare and
remounting inside the sidebar a moment later. `VendorNav` (the phone
pill-strip those two pages used) was deleted. On phones the sidebar's items
are now one sideways-scrolling row, with the current one scrolled into view,
instead of a vertical stack eight rows tall. A vendor still sees the shared
header on client-facing pages they visit (a public listing, `/browse`).

---

## Decision: Home trimmed to a landing page; How it works / For clients / For vendors split into their own pages

### Context
Home was one long scroll: hero, a 3-step "How it works" section, an
illustrative bundle showcase, a live vendor showcase, a "For vendors" pitch
card, an escrow/trust section, an FAQ, and a closing CTA. SiteHeader's
signed-out nav linked into two of these as `#how`/`#vendors` anchors. There
was no dedicated "for clients" case being made anywhere — most of Home was
already client-facing content, but nothing stated the trust/escrow pitch on
its own terms the way the vendor card made the vendor case.

### Decision
Three real pages now exist: `/how-it-works` (the 3-step explanation plus the
bundle example and celebration picker that make it concrete), `/for-clients`
(new — the escrow/trust content, given its own page rather than a mid-scroll
section), and `/for-vendors` (the existing pitch card, given room to be a
full page). Home is trimmed to: hero, the live vendor showcase (real data,
kept as Home's proof), a "learn more" section of three cards linking to the
pages above, the FAQ, and the closing CTA. SiteHeader's signed-out nav
(`SiteHeader.tsx`) links to the three real pages instead of `#how`/`#vendors`
anchors, and gained a fourth link ("For clients") it didn't have before.
Shared bits (`Eyebrow`, the marketing icon set) moved to
`components/marketing/` since four pages now use them instead of one.

### Consequences
No redirects were added for the old `/home#how`/`/home#vendors` anchors —
they were never separately indexable URLs, only in-page scroll targets, and
the only place that linked to them (`SiteHeader`) was updated in the same
change. A stray bookmark to `/home#how` still loads Home fine; it just lands
at the top instead of scrolling down, since that `id` no longer exists.

---

## Decision: "Browse vendors" moved out of the signed-out header; fixed 18 links pointing at a route that doesn't exist

### Context
"Browse vendors" was in `SiteHeader`'s signed-out nav, linking to
`/marketplace` — which has no page (`web/src/app/marketplace/` doesn't
exist; only `browse/` does) and no redirect in `public/_redirects` either.
Confirmed 404 in production. All 18 places in the app that linked to
`/marketplace` (Home's hero/showcase/closing-CTA, `/for-clients`,
`/how-it-works`, `/messages`, `/activity`, `/profile`, `/service`,
`/payment-complete`, `/vendor`, plus three `match` arrays in `nav.tsx`) had
the same bug — every "Browse vendors" button in the app was dead.

### Decision
Two changes: (1) every `href="/marketplace"` became `href="/browse"`, and
the `nav.tsx` `match` arrays were cleaned up to reference `/browse` only,
not both; (2) "Browse vendors" no longer shows in `SiteHeader`'s signed-out
nav at all — the marketplace is for someone already planning a celebration,
not a general storefront advertised to a visitor who hasn't signed up. It's
now a `NO_VENDOR_TABS` entry instead (`nav.tsx`), so a signed-in client sees
it in their persistent nav; a signed-out visitor sees Home's three
"learn more" pages instead.

### Consequences
None of Home's own in-page "Browse vendors" buttons (hero, vendor showcase,
closing CTA) were removed — only the persistent header tab. A signed-out
visitor can still reach `/browse` by clicking any of those, just not from
the header on every page.

---

## Decision: Client-app links leave for book.jornaevents.com; contract Phase 0 fixes (2026-09-23)

### Context
An audit of the package → contract → booking flows found that every client
route this repo still linked to — `/book`, `/plan`, `/bundle`, `/bundles` —
was deleted when this repo was forked into the vendor app, so a customer's
"Book this" on jornaevents.com 404'd. The client app lives in the
`jorna-website` repo at book.jornaevents.com. The same audit found contract
bugs: a per-person package's rate was pre-filled as the whole contract's
total, an unsigned contract held its date forever with no way to void it,
a vendor couldn't say who a contract was for, and a lead's "Set up booking"
opened a blank form without converting the lead.

### Decision
- `lib/clientApp.ts`'s `clientAppUrl()` builds absolute links into the client
  app (`NEXT_PUBLIC_CLIENT_APP_URL`, default `https://book.jornaevents.com`);
  every client-route link uses it. The product decision (user, 2026-09-23)
  was to send customers there rather than remove booking from this site.
- `/contracts/new` takes optional client name/email/phone, venue and an end
  date; a per-unit package asks "how many" and totals rate × quantity; the
  cancellation window is entered in days (stored in hours, as before, and
  the same on `/vendor-profile`'s defaults). `?lead=<id>` pre-fills from a
  lead and submits via `convertLead`.
- `/contracts` can **Void** an unsigned contract (backend
  `POST /contracts/{id}/void`), and `/booking-link` shows a voided link as
  withdrawn. `contractStatus` dropped `awaiting_details`: it was inferred
  from a missing `guest_name`, which the vendor can now fill in themselves.

Later phases (tentative holds on send, line items/add-ons, payment
schedules, account-synced templates, e-sign audit trail, marketplace
requests becoming proposals) are planned, not built — decisions for them
were recorded with the user on 2026-09-23.

---

## Decision: Package details, status and add-ons (Phase 1, 2026-09-25)

Backend 0063 (Desiconnect DECISIONS #14) gave packages a status
(active / hidden "Private" / archived), hours included, a "what's included"
list, priced add-ons, and optional per-package deposit / cancellation /
overtime terms; years of experience moved to the vendor.

- `ServicesManager` no longer defaults the price unit: the vendor picks
  "Flat price" or "Per …" before a price field appears. The old per-hour
  default was chosen as the safer mistake, but it let a flat price be
  listed as hourly without the vendor noticing.
- It reads the owner's list via `listMyServices` (hidden + archived
  included); the public `listServices` only ever returns active packages.
  Archived packages sit in a collapsed section with "Restore as private".
- Deleting a booked package archives it (backend behaviour), and the UI
  says so.
- "Years in business" is asked once in `VendorIdentityFields` (onboarding
  and Profile), not on every package.
- `/contracts/new` hides archived packages, marks private ones, and applies
  a package's own terms over the vendor defaults when it's picked.
- `/service` shows hours included, inclusions and add-ons to clients.
- Add-ons are shown to clients and stored, but not yet priced into a
  contract — that's Phase 2's line items.

---

## Decision: Vendor app sign-in lands vendors-to-be in onboarding (2026-10-01)

Signing in on the vendor app with an account that has no vendor profile used
to land on the client home (`/home`) — a rule from when one app served both
sides. On jornaevents.com that read as "sign-in took me to the client view",
and it was all a Google sign-in on staging (separate database, no vendor
profile) could ever show.

- `defaultLanding` (lib/role.ts): a vendor goes to the dashboard, anyone
  else to `/vendor-onboarding`. A failed vendor check (network, 5xx) is
  retried once and never cached, and lands on the dashboard, which shows
  "Try again" instead of treating the failure as "not a vendor".
- Sign-up here is always a vendor sign-up: the Host/Vendor picker is gone,
  and a "Planning a celebration?" link (plus the marketing pages' client
  "Get started" buttons) goes to book.jornaevents.com.
- `/auth/callback` puts a 20s limit on each step and offers "Try again", so
  a stalled request can't leave "Finishing sign-in…" up forever; the
  Supabase session is dropped locally rather than with a network call.
- `logout(to)` does a full page load to a plain `/login` (or `to`), so a
  page's own "signed out → /login?next=<this page>" redirect can't send the
  next person to sign in to the previous person's page.
- Onboarding: choosing a category in the dropdown selects it, and a blank
  travel radius is left out of the update instead of sent as null (which
  the backend rejects).

---

## Decision: Vendor redesign, step 0 — the shell (2026-10-01)

The vendor app is being rebuilt page by page from the Figma Make "Wedding
Vendor Dashboard" design (plan: the "Vendor Dashboard Redesign Plan" doc,
2026-10-01). Step 0 changes the frame every page sits in:

- The palette and fonts (DM Sans, Manrope) are scoped to `.vendor-shell`
  (`app/vendor-shell.css`) instead of edited into the shared `globals.css`,
  which the client app and this app's marketing/signing pages also use.
  The design is light only; dark keeps the existing dark palette.
- Sidebar: Overview, Bookings, Contracts, Calendar, Leads, Vendor Profile,
  Messages, Earnings; Settings, the profile card and Sign out in the footer.
  Below `lg` it's a top bar and a full-screen menu rather than the design's
  bottom tab bar, which can't fit nine destinations legibly. Badges: Leads
  (lib/attention's count until step 2 gives leads their own rules) and
  Messages (unread).
- Clients is dropped (no per-client history in v1): `/clients` 301s to
  `/leads`, which for now hosts the leads list that was the dashboard's
  `?view=leads` tab. Overview keeps the `/my-dashboard` URL until its rebuild.
- Settings collects what a vendor sets once: account, Venmo/Zelle (moved off
  Vendor Profile), tentative-hold length (`contract_hold_days`, previously
  only overridable per contract), Google Calendar, notifications, theme. The
  theme toggle left the sidebar, and a stored theme is now applied before
  first paint (`lib/themeBoot.ts`) — before, a reload dropped it.

---

## Decision: Vendor redesign, step 1 — Overview replaces the dashboard (2026-10-01)

`/my-dashboard` became `/overview` (301, query string kept), built from the
Figma design: a greeting, the next event (stepping through what's coming,
with the mini calendar following it), open leads and how many need a reply,
bookings by tab with deposits owed and money received this month, and the
latest messages. It's a summary only — every action the old dashboard
offered (answering requests, offers, check-in, confirming payments) is on
Bookings, which rows link to.

- The numbers are reducers in `lib/vendorPlan.ts` (`bookingTab`,
  `leadSummary`, `depositsOwedCents`, `receivedThisMonthCents`,
  `upcomingBookings`), with unit tests. `bookingTab` (Deposit due /
  Confirmed / Over) is what the Bookings page will use in step 3.
- "+N this week" and "oldest waited" from the plan aren't shown: bookings
  have no creation timestamp in the backend. That arrives with step 2's
  leads backend work.
- "Received this month" counts installments (and, for older contracts,
  deposits) by confirmation date; a balance confirmed on a contract with no
  payment schedule has no date in the payload and isn't counted.
- `dark:` utilities now follow `data-theme` (shared `globals.css`
  `@custom-variant`), so the Settings theme choice applies to them too.

---

## Decision: Vendor redesign, step 2 — Leads from one pipeline (2026-10-01)

Leads is drawn from the backend's `GET /leads/pipeline` (backend DECISIONS
#20), which decides each item's stage — Inquiry until the contract link is
sent, Negotiation until it's signed — and whether it needs the vendor and
why. The page doesn't re-derive any of it, so web and iOS can't disagree.

- A lead opens in a drawer with that stage's actions: a request → Create
  contract (`/contracts/new?request=`) or Decline; a lead → Create contract,
  Mark as contacted, Not going ahead; a draft → Edit, Send by email, Copy
  link; sent/viewed/expired → View, Copy link, Resend, Edit, Void; a
  counter-offer → the negotiation panel. Archive/Unarchive on everything.
- **Copying a draft's link sends it** (the existing send endpoint, no
  email), so it becomes a Negotiation and the date is held — the plan's
  rule. Copying an already-sent link doesn't resend.
- "New lead" opens the contract editor. The old informal lead form
  (`LeadsPanel`) is gone; informal leads now come from marketplace requests
  and "Add to leads" on a Messages thread. Existing ones still show.
- Overview's lead card and the sidebar's Leads badge read the same
  pipeline, which is what made "+N this week" and "oldest waited" possible
  (bookings carry `created_at` from backend 0066).
- "Mark as unread" on a thread returns to the inbox: the thread re-reads its
  messages every few seconds, and reading is what clears the mark.

---

## Decision: Vendor redesign, step 3 — Bookings are agreed bookings only (2026-10-01)

Bookings lists what's been agreed — a contract signed, or a marketplace
request accepted before contracts — in the tabs Overview uses
(`bookingTab`: Deposit due / Confirmed / Over). Requests and unsigned
offers are Leads now.

- A row expands to the design's five steps (`bookingProgress`: contract
  sent → signed → deposit paid → event over → payment received), the
  event's details, and its money (`bookingMoney`, from the payment schedule
  when there is one).
- The vendor's move is highlighted and sorts first: payments the couple
  says they've sent (`paymentsToConfirm` — per installment, or the legacy
  deposit/balance pair), a date change to answer, and the escrow check-in or
  confirm. Cancelling keeps its confirmation and the server's guard.
- "Signed contract" opens the contract page; there's no PDF endpoint, and
  the browser's print-to-PDF covers it. "Message couple" replaces the
  design's "View client details" (no per-client history in v1).
- The one-click "Accept & send contract" for a marketplace request moved
  with requests to the Leads drawer ("Send with my usual terms").
- The shared primary Button's text is white: in dark mode the ground colour
  it used was near-black on maroon.

---

## Decision: Vendor redesign, step 4 — Messages is a hub, and conversation only (2026-10-01)

A vendor's `/messages` is the Figma design's hub (`components/vendor/MessagesHub.tsx`):
conversations (search, All/Unread, counts), the open thread, and a side
panel saying what this couple is — a booking ("View booking"), a lead
("View lead", matched through the pipeline's `conversation_id` or the
thread's booking), or neither ("Add to leads") — with the event, the
contract, and "Mark as unread". Clients keep the old list and
`/conversation` page; a vendor opening `/conversation?id=…` is forwarded to
`/messages?id=…`, so every existing link still lands.

- The thread itself (socket, 5s poll, send) is one component,
  `ConversationThread`, used by both, so live delivery can't drift between
  them.
- A price offer in a thread links to its lead's drawer ("Answer in Leads");
  nothing in Messages accepts or counters a price (the plan's rule).
- "New message" only opens a thread with a couple the vendor already has an
  account booking or request with (the confirmed assumption) — guest
  contracts have no account to message.
- "Mark as unread" closes the thread: the open thread re-reads its messages
  every few seconds, and reading is what clears the mark.
- Left out as decided: "Active now" and file attachments.

---

## Decision: Vendor redesign, step 5 — Vendor Profile in the design's layout (2026-10-01)

Vendor Profile has the design's header ("Add package"), identity card (photo,
name, category · city, "Preview public profile"), the package list, then
"About your business".

- Packages are the design's numbered, expandable rows: name (and Private),
  coverage (included hours, else duration), "best for" (the speciality),
  starting price. A row opens to "What's included" and a summary that adds
  the real fields the design doesn't show — open to offers, add-ons, listing
  — plus the existing controls: reorder, duplicate, private/public,
  preview, delete, photos and video.
- "Edit package" opens `ServicesManager`'s existing editor inside that row,
  so every field (price unit, add-ons, photos, negotiable, per-package terms)
  is edited exactly as before; a new package's editor still opens at the
  top. The page header reaches it through a ref (`ServicesManagerHandle`).
- No "Most popular" badge: nothing records which package is most popular.
- Contract defaults, saved templates, availability and reviews stay below,
  restyled; Contracts (step 7) is where contract defaults may move.

---

## Decision: Vendor redesign, step 6 — Calendar and Earnings restyled, no new behaviour (2026-10-01)

Both pages take the shell's page header and the design's tile style; the
calendar's Month/Year switch is the shared filter tabs. Nothing they do
changed, as planned. One fix rode along: Earnings' "Payment details → Edit"
pointed at Vendor Profile, but Venmo/Zelle have been on Settings since
step 0.

---

## Decision: Vendor redesign, step 7a — Contracts library and template gallery (2026-10-01)

Contracts is the design's template gallery over a document library; the
builder behind "New contract" is still today's (`/contracts/new`) until the
document editor (7b) replaces it.

- Gallery: Blank (the vendor's usual terms), the vendor's first saved
  template (opens `/contracts/new?template=<id>`, which the builder now
  reads), a "<speciality> services agreement" when nothing is saved, and
  Addendum / Cancellation shown as coming with the new editor — they need
  backend template types (plan's backend change 4).
- Saved templates moved from Vendor Profile to "Manage templates" here.
- Library: search, filters, and a table of name, client, status, last
  modified. Statuses are the plan's (Draft, Sent, Viewed, Signed, Deposit
  due, Paid, Expired, Declined, Void) plus "Confirm payment" when the
  couple says they've paid. A draft opens in the builder; anything sent or
  signed opens read-only. The hold line (opened yet, held until) stays on
  each unsigned row, as do Send/Resend, Copy link, View as client and Void.

## Decision: Vendor redesign, step 7b — a document editor; addenda and cancellations signed as attachments (2026-10-01)

**Context.** The step builder (Client → Event → Items → Payments → Terms →
Review) didn't read like the agreement a couple receives. Vendors also had
no written way to change or end a booking once it was signed.

**Decision.**

- `/contracts/new` is one document. Its title and block order go to the
  backend as `document_title` and `document_layout` (backend 0067). A terms
  block's text stays in `terms_clauses`, so the signing page is unchanged.
- The payment plan follows the total until the vendor edits it. The old
  builder got the same result by drafting the plan on arrival at Payments.
- **Copy link sends the contract too**, just without the email. Either way
  the date is held and a lead moves to Negotiation (the step 4 rule).
- **Addendum and Cancellation are signable, attached documents.** They are
  text only, belong to an agreed booking (`vendorPlan.canAttachDocument`,
  mirroring the backend), and are signed on `booking-link?d=` with their own
  token. Signing one changes nothing on the booking; both editors and the
  signing page say so. Any change to price or date still goes through the
  booking itself.
- Templates carry a `kind`. The contract editor lists only `agreement`
  templates, and the document editor lists only its own kind.

## Decision: Contract and document PDFs come from the backend (2026-10-01)

**Context.** Vendors and couples want a file of the agreement to keep.

**Decision.**

- The backend draws the PDFs (its DECISIONS #22): from the signed snapshot
  once signed, with the fingerprint.
- **The vendor's downloads go through `apiDownload`** in
  `packages/shared/lib/api.ts`. It does the same refresh-once as `apiFetch`,
  and the file is saved from a blob under the server's filename. The backend
  exposes `Content-Disposition` over CORS for this; without it, every file
  would save as "contract.pdf".
- **The couple's are plain links** (`lib/download.ts`). Their token in the
  URL is already the whole credential, as it is for the page.
- Buttons are on the contract view (the contract and each attached document)
  and on both signing pages, before and after signing.

## Decision: "Browse vendors" leaves for the client app's marketplace (2026-10-01)

**Context.** Every "Browse vendors", "See all vendors" and "Back to
marketplace" link on jornaevents.com pointed at `/browse`. That page only
redirects to Home, so a couple looking for vendors went in a circle.

**Decision.** Those links, and the signed-in "Browse vendors" tab, go to
`clientAppUrl("/marketplace")` (book.jornaevents.com/app/marketplace), where
the marketplace lives. `/browse` stays as a redirect for old bookmarks. The
signed-out header still doesn't advertise browsing; that earlier decision
stands.


## Decision: Over keeps every past booking; both apps name the same stages (2026-10-02)

**Context.** The lifecycle is Inquiry → Negotiation → Deposit due →
Confirmed → Over. `vendorPlan.bookingTab` held a past event in Over only
until its money was all confirmed, then returned null. So a fully paid
booking disappeared from every tab, at exactly the point a vendor might
want to look back at it. The client app used its own words ("Accepted —
awaiting your signature", "Booked") for the same states.

**Decision.**
- **Over is every agreed booking whose event has passed, paid or not.**
  Each Over row says Paid or Balance due (`overPill`). The Over tile
  counts balances due instead of saying "Waiting on final payment".
- **The client app names the same stages** with `lib/contract.ts`
  `bookingStage`: Requested, Contract to review, Signed · deposit due,
  Confirmed and Completed. Deposit due reads the payment schedule, as the
  vendor side does. The bundle payload has no legacy deposit fields, so a
  booking without a schedule goes straight to Confirmed once signed.
  Bookings from before contracts keep their old escrow-era labels.

## Decision: the client proposes changes to the contract; one comparison view for both sides (2026-10-02)

**Context.** Negotiation used to be price counters on a request. The user wanted one place to negotiate, the contract itself: the client proposes changes to any term, and the vendor accepts, declines or revises (backend DECISIONS #23).

**Decision.**
- **One comparison.** `lib/contractDiff` compares two versions of the terms section by section:
  - event details
  - line items, matched by id and then by name
  - payment schedule
  - terms, with word-level differences
  - policies

  `components/ContractCompare` draws it. Wide screens get columns; on a phone each change stacks, with the old value struck through and the new one highlighted. Unchanged sections fold behind "Show unchanged". The couple's signing page and the vendor's `/contracts/changes` both use it. (Superseded on the vendor side by the workspace — see below.)
- **The couple proposes on the signing page** (`booking-link/ProposeChanges`, since replaced by the workspace below; `?propose=1` opens it straight away). Their working copy is the editor's own model (`contractDraft.fromContract`). `proposalChanges` sends only the sections that differ, plus the schedule whenever the total moves. Signing stays available the whole time.
- **Ids survive editing.** `contractDraft` used to drop line and payment ids on save, so every version had new ones. They're kept now, so versions compare line by line.
- **Revise is the editor** (now inline in the workspace; the editor route still works), opened with the proposal laid over the contract (`/contracts/new?edit=…&proposal=…`). Saving sends `proposal_id`.
- **Price counters:** the panel shows only for a counter that's already open, on both sides. Starting a new one is retired.
- **The client app** names the two negotiation stages "Changes proposed" and "New version to review", and links "Propose changes" next to "Review & sign".

## Decision: negotiation happens in one workspace, from the Figma design, with drafts on the server (2026-10-02)

**Context.** The Figma Make design ("Wedding Vendor Dashboard") draws negotiation as one screen: the contract as a page with the other side's changes in red, and beside it each changed value as Original / Proposed / Your revised value, a clause checklist, Save draft and Send. What shipped first was a comparison page with Accept / Decline / Revise, where Revise opened the full editor. The user chose to rebuild to the design, replace `/contracts/changes` with it, keep drafts on the server (backend DECISIONS #24), and give the couple the same screen in this round.

**Decision.**
- **One workspace for both sides** (`components/negotiation/NegotiationWorkspace`). The host decides what Send means:
  - the vendor, with the couple's proposal open: Send with nothing changed is **Accept**, anything changed is **Revise** (`PATCH` with `proposal_id` and `proposal_note`), and **Decline** stays a separate button;
  - the vendor, with nothing open: Send is a plain edit;
  - the couple: Send is a proposal. Their own open proposal opens read-only, with Change and Withdraw.
- **Values, not sections.** `lib/negotiation` reads a version as negotiable values (date, each line's quantity and price, each payment, policies, each clause's text), matched across versions by saved id, so three versions line up. The cards show what the other side changed, what you've changed, and anything picked from "Change something else". Lines and clauses that one version lacks get checkboxes; the vendor's clause checklist also offers their saved default clauses.
- **Marks:** rose for the other side's change, gold for yours. "View original" shows the version before.
- **Where it opens:** a Negotiation lead with a sent contract opens straight into it from Leads ("Lead details" goes back to the drawer for copy link, void and archive). `/contracts/changes?id=` is the same screen full-page, for links from the contract page and notifications. The signing page opens it full-screen in place of the old proposal form, which is gone.
- **The full editor is still there** for structural changes (reordering, new packages) — nothing in the workspace replaces it.
- `lib/contractDiff` and `ContractCompare` stay: the signing page's "What changed" summary and the contract page still use them.


## Decision: rounds count turns, asks are credited to whoever asked, and the contract says when money is due (2026-10-02)

Found in a local end-to-end run of the negotiation workspace.

- **Round N is the turn of the back-and-forth** (`lib/negotiation.roundOf`): 1 for the contract, +1 for each proposal the couple sent, +1 for each answer (accepted, revised, declined). Sent → proposed → revised is Round 3.
- **Who asked for what.** On the couple's side, after the vendor answers, each difference is read against what the couple asked for (`attribute`). Their own ask the vendor took shows as theirs ("You asked for this — … accepted it", gold), not the vendor's. A countered ask shows original / you asked / theirs. An ask the vendor kept as it was says so. Only changes nobody asked for are the vendor's (rose). Items and clauses get the same labels.
- **"We emailed the link" only when we did.** The backend now returns `email_sent` (true / false / null) from create, send, lead convert, accept-with-a-proposal and accept-with-usual-terms. The app claims an email only on true, says to share the link on false, and stays neutral when it isn't told. The timeline shows "Couldn't email the link" on a failure.
- **The booking card reads the contract.** `bookingMoney.balanceDue` comes from the next unpaid payment on the schedule (`describeDue`), e.g. "Due May 31, 2030 (14 days before the event)", instead of the hard-coded "Due after the event". All payments confirmed reads as paid in full. Contracts without a schedule keep the old wording.

## Decision: signing asks for an emailed code and the e-records consent (2026-10-07)

Backend DECISIONS #27. The signing page (`booking-link/SignatureStep.tsx`, shared by contracts and attached documents) now asks for three things before it signs:

- **The typed name.** Unchanged.
- **A 6-digit code emailed to the client.** On a contract, the email typed on the form is saved first, because the code goes to the email on file.
- **The consent box.** Its words come from the backend (`esign_consent`) and are shown exactly as sent. The signature sends their version back.

The backend adds the IP address and browser and puts it all in the signed copy's certificate. The vendor app shows no client IPs. The timeline only says a code was asked for and that signed copies were emailed.

An older backend sends no `esign_consent`. Then the page signs with the name alone, as before, so this can ship ahead of the backend flag (`SIGNING_REQUIRE_CODE`).

The staging round trip signs with `STAGING_E2E_SIGNING_CODE`, which must equal the staging backend's `SIGNING_TEST_CODE`.

## Decision: the signing page checks the name and can't move the terms (2026-10-13)

From the 2026-10-05 staging walkthrough (#169, #154), with backend jorna-backend #113.

- **A different name warns, then signs.** If the typed signature isn't the client's name on the contract, the page says so (`lib/signerName.ts`, the same rule as the backend's `name_check`: case, punctuation and middle names don't count). It doesn't block, because a partner or a parent signing is a real signature. The backend records the mismatch, the certificate shows it, and the vendor's timeline reads "Signed by Bob Smith — the contract is for Asha Mehta".
- **Venue and guest count are terms.** The client fills them in only when the vendor left them blank. Once set, they're read-only on the form, with a link into negotiation. The backend refuses a change (409). A change to the client's own name, email or phone shows on the vendor's timeline (`details_updated`).
- **One cancellation sentence everywhere**: "Cancelling within N days of the event may forfeit what's been paid", the editor's wording, now also on the signing page and the PDF.
- **Signing isn't "set".** After signing, the page says "You signed with {vendor}". While the deposit or first payment hasn't arrived, it adds "Your date is secured once {vendor} receives …", which matches the vendor's "Deposit due".
- **The signing page has the wordmark only** (`SiteHeader`'s `BARE_PATHS`). Whoever is signed in, the site's navigation only leads away from the contract.

## Decision: the contract editor says what's wrong before Send (2026-10-14)

From the 2026-10-05 staging walkthrough (#166), with backend jorna-backend #114 (its DECISIONS #28), which refuses the same things.

- **Payments.** A payment due before today is a problem to fix ("“Final balance” would be due May 8, 2026, which has passed"). One due after the event is only a note under the schedule: a balance on delivery is ordinary. `contractDraft.dueDateOf` is the backend's `scheduled_date`.
- **A discount that wipes out the total** is named as the problem, and the "add a payment" problem it used to cause is gone. Negative money reads "−$500.00".
- **A date that's already taken** is said when it's picked (`lib/dateClash.ts`, the backend's `commits_vendor_date` and `booking_blocks`), not as a 409 after Send.
- **The cancellation window lives in a Cancellation section.** One place says what cancelling costs: the days, then the generated sentence, then the vendor's own words if any. A section that's only the window isn't sent as a section (`contractDraft.asSent`); the window goes as `cancellation_window_hours`, which every copy prints. Removing the section removes the window. Overtime stays under the schedule.
- **Suggested sections don't make up numbers.** Travel uses the vendor's radius and leaves the rate as `___`, which must be filled in before sending.
- **An empty custom row stays put.** It used to vanish when focus left it, and the click that left it landed on whatever moved up. Left empty, it isn't part of the contract.
- **A package's included hours** go into its line ("5 hours included"), which the client's copy, the signing page and the PDF print.
- **Hold days** outside 1–60 are said under the field instead of quietly becoming 7.
- **A contract started from a lead or a request belongs to Leads**: the back link says so and the sidebar lights Leads.
## Decision: one answer to "whose move is it" (2026-10-14)

From the 2026-10-05 staging walkthrough (#150, #151, #165, #167, #170, #135), with backend jorna-backend #114 (its DECISIONS #28).

- **The client's changes are the vendor's turn, everywhere.** Contracts and bookings carry `negotiation` (whose turn, how many changes wait on each side). `vendorPlan.contractStatus` has `changes_waiting` (`changesWaiting()`, which also counts an open proposal on the older flow). Leads reads the backend pipeline, which uses the same field. The contract page says "Asha asked for 2 changes — your turn", with Answer them as its main action.
- **Money reaches Overview.** `vendorTasks` adds the client's changes, payments the client says are sent, and overdue payments (`overdueInstallments`, due no earlier than signing, like the backend's `effective_due`). Overview's line counts them: "1 payment to confirm and 1 payment is overdue."
- **Bookings say what's late, in order.** The steps put "Paid in full" before "Event over" when the last payment is due before the event (`bookingSteps`). The remaining balance starts after the deposit, which has its own due date (#135). An overdue payment is flagged on the row and the card.
- **A negotiation reads as one turn** on the timeline ("Your client asked for 2 changes", "You accepted 1 and answered 1 other change"). The edit and resend the backend writes alongside a vendor's answer are hidden (`visibleEvents`).
- **Contracts:** All counts every contract. A declined or void one has no link to copy. A signed row says who signed, and flags a name that isn't the client's.
- **Leads:** a row names the event as well as the package. The drawer shows the time, the guest count, the client's note and the full venue. Declining can carry a note, which is emailed to the client and shown on their plan. Closed leads sit under Archived with how they ended ("You declined", "Client cancelled", …). Add a client checks the email, phone and date before saving.
- **Client app:** a request the client took off a sent plan stays on it as "You cancelled", and a vendor's decline note shows under the declined request.
## Decision: the negotiation workspace shows the contract as it would be (2026-10-14)

From the 2026-10-05 staging walkthrough (#152, #153, #155, #168), with backend jorna-backend #114.

- **The contract on the left has the reader's answers in it**, marked, as they make them (`fieldNegotiation.previewTerms`): a counter, an accepted price, a new item, a section left out. The other side's open asks stay highlighted as before.
- **The other side's note leads their turn.** It was stored and returned (`last_send.message`) but never shown.
- **Wording.** The card reads "Contract:" for the current value, not "Agreed:", before anything is agreed. When the other side kept the contract's value, it says "Arjun kept 30 days (you asked 0 days)". A counter shows the reader's own ask beside it (`your_last_ask`, new from the backend). The button says what's being sent: "Send 2 changes", "Send 1 answer and 1 change".
- **Nothing silly gets sent.** A field opened with Change but left as it was isn't sent or counted (`effectiveAnswers`). A guest count outside 1–100,000, a $0 price, or a total of $0 or less disables Send with the reason (`valueProblem`). The backend refuses the same.
- **"We emailed them" only when it's true.** The send's reply carries `email_sent`; without an email on the contract the vendor is told to send the link themselves.
