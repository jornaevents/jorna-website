# Web app parity plan

Goal: bring the web app (`web/`, served at `jornaevents.com/app`) to functional
parity with the native iOS app, against the same FastAPI backend.

Work top to bottom. Tick a box only when the step is **built, verified against
the real backend, and deployed**. Keep steps small enough to ship individually —
each one should leave the app in a working state.

---

## Done

- [x] **Navigation mirrors the iOS tab bar's destinations**, though not its
  literal form any more — a role-aware bottom tab bar (`AppTabBar`) was the
  original approach but was later replaced by `MobileNavMenu` (a hamburger
  opening a full destination list), because a client's 7 destinations didn't
  fit one row at a readable label size. See `docs/MODULE_MAP.md` "App shell &
  routing."
  - Client: Home (browse) · Build · Bundles · Messages · Profile (+ more, via
    the menu)
  - Vendor: Home (browse) · Bookings · Messages · Profile
  - Role = has a vendor profile (`getMyVendor != null`), same signal as iOS.
  - Header slimmed to wordmark + escape + auth; `/profile` is the account hub
    (planning links for all; selling links for vendors, "start selling" for
    clients). `/messages` is a real inbox — see Phase C below, done.


- [x] Design system, auth (email/password), typed API client with token refresh
- [x] AI bundle builder (`/plan`) — one-shot form → 3 comparison bundles
- [x] Browse + filters (`/browse`), vendor profiles (`/vendor?id=`)
- [x] Bundles list (`/bundles`), bundle detail (`/bundle?id=`)
- [x] Stripe hosted checkout + return/reconcile (`/payment-complete`)
- [x] Escrow release — confirm, refund, dispute
- [x] Navigation back to the marketing site

---

## Phase A — close the client transaction loop

The most visible gap: you can browse and find a vendor, but you can't book them.

- [x] **A1. Book a service from a vendor profile** — `/book?service=`
  - "Book this" on each service → a request form → `POST /bookings` → `/bundle?id=`.
  - Guest count is **required** for per-person services (otherwise the total can
    never resolve and checkout would refuse). Multi-day toggle sets `date_end`.
  - Shows a live estimated total using the backend's own arithmetic
    (rate × quantity; per-day counts the end date inclusively, per-hour handles
    a window crossing midnight). Verified against `estimate_amount_cents`.
  - A venue service prefills its address and passes its map pin, so the event is
    anchored for check-in.
  - Adds to a new bundle or an existing one.

- [x] **A2. Edit a bundle**
  - Swap a service, remove a booking, rename, delete — all on `/bundle?id=`.
  - There is no swap endpoint: a swap is "book the replacement into the same
    slot, then remove the original". Candidates are narrowed by **subcategory**
    so a DJ slot never lists dhol.
  - The quantity (`guest_count`, `date_end`) is carried across, or the
    replacement lands unpayable. Needed a backend change to expose those on the
    bundle summary — the iOS swap drops them and has this bug.
  - `POST /bookings` is idempotent, so re-booking the slot returns the *same*
    booking; removing the "old" one would then delete it. Guarded by comparing
    the returned `booking_id`.
  - Editing is hidden once money has moved (`payment_confirmed`, or paid /
    released / refunded / disputed), mirroring the iOS rule.

- [x] **A3. Events** — `/events` and `/event?id=`
  - List + inline create; detail shows the event's bundles and their bookings,
    with a running total. Delete makes clear the bundles survive.
  - There is **no `GET /events/{id}`** — the list is the source of detail.
  - A booking has no `event_id`, so the event's vendors are assembled by matching
    **bundles** on `event_id` (iOS additionally falls back to matching the event
    *name*, which would wrongly merge two events sharing a name — not copied).

## Phase B — make a vendor operable on the web

Today a vendor cannot function on web at all. B1–B4 are what a vendor needs to
take money; B5–B6 complete their side.

- [x] **B1. Become a vendor / vendor profile** — `/vendor-profile`
  - Create or edit: category, speciality, bio, travel radius, long-distance and
    price-negotiation preferences, Instagram.
  - Options come from `GET /vendors/categories`, added for this step. The
    taxonomy is validated server-side, so a hardcoded copy that drifts produces
    400s the user can't act on. Changing category clears the speciality rather
    than sending a stale pair.

- [x] **B2. Services CRUD** — originally its own `/my-services` page, since
  folded into `/vendor-profile` (see `ServicesManager.tsx`'s header comment)
  - List, create, edit, delete; photos added and removed inline.
  - Rate + unit (flat/person/hour/day) with a note that anything but flat needs a
    quantity from the client before it can be paid. `negotiable` per service.
  - Venue services require an address **and** map coordinates (the check-in
    anchor) — enforced before submitting, with a "use my current location"
    helper for a vendor filling it in on site.
  - Category/speciality come from `/vendors/categories`, defaulting to the
    vendor's own so most services need no fiddling.
  - Gated behind having a vendor profile, since services hang off one.
  - Image upload needed `apiUpload` in the API client: multipart must **not**
    set Content-Type by hand, or the boundary is missing and the body won't parse.

- [x] **B3. Booking requests (approve / decline)** — `/my-bookings`
  - Filtered by what needs an answer vs. accepted vs. all, with the pending count
    up top. Declining goes through a confirmation.
  - Accepting can 409 when the vendor already has an accepted or paid booking on
    an overlapping date (one event per day) — the server's message is shown
    rather than a generic failure.
  - Flags a request whose total is still pending a quantity, so a vendor isn't
    surprised when the client can't pay yet.
  - Seller pages now share a `VendorNav` (Requests / Services / Profile).

- [x] **B4. Stripe onboarding + earnings** — `/my-earnings`
  - Connect onboarding as a hosted redirect, with the un-onboarded state saying
    plainly that a booking can be accepted but checkout will refuse.
  - Paid out / held in escrow / upcoming, plus disputed and refunded when they
    apply, and a payment history. Amounts are net — the platform fee is already
    out — and the page says so.
  - Onboarding needed the same `client=web` split as checkout: the return page
    otherwise bounces to `jorna://` and strands a browser mid-setup.
  - The return path is **fixed by the backend** as
    `{WEB_APP_URL}/vendor/stripe-onboard/return` (and `/refresh`), so the app has
    routes at exactly those paths — without them a vendor 404s right after
    finishing setup. They just forward to Earnings, which re-checks live status.

- [x] **B5. Vendor confirm + check-in** — on `/my-bookings`
  - Once a booking is paid, the vendor's half of releasing escrow appears:
    - **Venue event** → "Check in at venue" using browser geolocation →
      `POST /bookings/{id}/check-in`. The backend requires being within ~0.2mi,
      and a vendor may check in early (release still waits on the client).
    - **Venue-less event** → plain "Confirm" (`/confirm`), shown only once the
      event date has passed, since that call is date-gated.
  - After confirming it says whether it's waiting on the client or already
    released. The venue is detected from the booking's mirrored coords.

- [x] **B6. Weekly availability** — `/my-availability`
  - A per-weekday editor (0=Mon … 6=Sun) with multiple time windows per day,
    saved via `PUT /vendors/me/availability`. Validates end-after-start client-side.
  - **Google Calendar sync deferred** (noted in-page): it's a backend-owned OAuth
    redirect (`/vendors/{id}/google-auth-url` → Google → the backend callback at
    `GOOGLE_OAUTH_REDIRECT_URI`), so it returns to the API, not the web app —
    the same return-URL problem as checkout/onboarding, and it also depends on
    that env config. Wire it with a web return like the others when prioritised.

## Phase C — communication & trust

- [x] **C1. Group chat** — `/messages` (inbox) + `/conversation?id=` (thread)
  - Real inbox replaces the placeholder; the thread loads the newest window and
    streams new messages over the `/conversations/ws/{id}` WebSocket.
  - Browsers can't set WS headers, so it auths via `?token=`. Messages upsert by
    `message_id`, so the sender's echo, the POST response, and a 5s REST poll
    fallback all converge without duplicating (mirrors iOS ChatSocket). Capped
    reconnect backoff; a live/offline indicator.
  - Static export is fine here — the socket is a plain browser client, no SSR.
- [x] **C2. Negotiation** — a shared `NegotiationPanel` on both sides
  - Client sees it on a negotiable, unpaid booking in `/bundle`; the vendor on a
    still-decidable negotiable request in `/my-bookings`.
  - Turn-based, mirroring the backend: `proposed_by` is whoever made the current
    offer; only the *other* party may counter or accept, and no one accepts their
    own offer. Accepting sets the booking price and approves it, so both pages
    refresh. Start / counter / accept / decline.
- [x] **C3. Leave a review** — a `ReviewPanel` on the client's paid bookings in
  `/bundle`. Loads any existing review (one per booking) and otherwise offers a
  star + comment form. `POST /reviews`; client-only, matching the backend guard.
  Reviews already render on the public vendor profile (Phase 2).
- [x] **C4. Report & block** — a `ModerationMenu` on the vendor profile (report
  with a reason + details, or block the vendor's user), and a `/blocked` page to
  unblock, linked from the Profile hub. The backend hides blocked users from
  search and hides their reviews/messages, so no client-side filtering is needed.
  Note: the moderation router has **no prefix** — the paths are `/reports` and
  `/blocks`, not `/moderation/*` (verified against the live schema).

## Phase D — account completeness

- [x] **D1. Account settings** — `/account` (linked from the Profile hub)
  - Edit name/email/phone/location (`PATCH /me`), avatar upload (`PUT /me/avatar`,
    multipart field `file`), and change password (`POST /auth/change-password`).
  - Password change bumps `token_version` server-side, invalidating the session,
    so on success we sign the user out and send them to sign in again.
  - `AuthProvider` gained `setUser` so edits reflect immediately in the tab
    bar / profile. (Username isn't in `PATCH /me`, so it isn't editable here.)
- [x] **D2. Password reset** — request (`/forgot-password`) + confirm (`/reset-password`)
  - `POST /auth/forgot-password` with `client: "web"`, reached from a "Forgot
    password?" link on the sign-in form. Always shows the same generic
    confirmation (the backend never reveals whether the email exists).
  - `client: "web"` is what makes the emailed link land in the web app: the
    backend builds it as `{WEB_APP_URL}/reset-password?token=…` (`= https://
    jornaevents.com/app/reset-password`) for `web` and the `jorna://` deep link
    otherwise — the same return-path split as checkout/onboarding. Verified in
    `auth_service._send_password_reset_email`.
  - `/reset-password` reads the token from the query, `POST /auth/reset-password`
    with the new password, then routes to sign in — a successful reset bumps
    `token_version`, killing all sessions, so a fresh login is required anyway.
    The hint states the real rule (8+ chars incl. upper, lower, digit), not just
    length, so the user isn't bounced by a 422 the form didn't warn about.
- [x] **D3. Google OAuth** — Supabase sign-in → `POST /auth/google/lookup` exchange.
  *(Verified live: a real Google sign-in round-trips into the web app.)*
  - "Continue with Google" on `/login` (both modes) → `supabase.auth.signInWithOAuth`
    (PKCE) → Google → `/auth/callback`, which exchanges the code for a Supabase
    session and calls `POST /auth/google/lookup` (`lib/supabase.ts`, the new
    callback page). Reuses the same public Supabase project + anon key as iOS.
  - **Existing / email-linkable account** → the backend returns Jorna tokens
    (`is_new_user: false`); `adoptSession` persists them and we sign out of
    Supabase (the Jorna JWT is the session). **New Google identity** → we hold the
    Supabase session and route to `/login?google=1`, a completion form with the
    email locked to the Google address, which registers a Google-linked account
    (`supabase_user_id` + token proving ownership), matching iOS.
  - Fixed a latent bug this flow depends on: **`/auth/register` returns only
    `{user_id, email}`, not tokens** — the old web `register()` cast it to a
    `TokenPair` and never established a session (the account was created but the
    user wasn't signed in). Now it logs in right after registering, fixing both
    the email/password and Google sign-ups.
  - **Required Supabase config (done):** in **Authentication → URL
    Configuration**, Redirect URLs include `https://jornaevents.com/app/**` (and
    `http://localhost:3000/app/**` for dev), and the Site URL is
    `https://jornaevents.com/app`. The app sends `redirect_to=…/app/auth/callback/`
    (trailing slash, matching the static export); if the allow-list doesn't match
    it *exactly*, GoTrue silently falls back to the Site URL — which is why the
    wildcard is used rather than a bare path. Google is already enabled on this
    project (iOS uses it), so no Google-console work was needed.

## Phase E — platform differences

These can't be a straight port; decide per item rather than assuming parity.

- [x] **E1. Client GPS check-in** — "At the venue?" on `/bundle`
  - **This turned out not to be a port.** iOS has *no* client check-in: only the
    vendor side calls `check-in`. But the backend has always supported it — the
    same `POST /bookings/{id}/check-in` derives the caller's role server-side and
    takes a client down a different branch. So web is the first client to use it.
  - **It is not an escrow action, and the UI says so.** The vendor's check-in
    sets `vendor_confirmed_at` (their half of the release); the client's sets
    only `client_checked_in_at` and notifies the vendor they've arrived. Sitting
    next to "Confirm & release" that would otherwise read as the thing that pays
    the vendor, so the copy states plainly that it releases nothing.
  - Offered only when the bundle has a **live venue** — mirroring the backend's
    `_live_venue_booking` (a rejected/cancelled/refunded venue stops anchoring,
    a disputed one still anchors) — since without an anchor check-in 400s.
    No backend change needed: the bundle summary already returns the check-in
    timestamps, and the venue is derived from the bookings themselves.
  - Check-in is per booking server-side, but a client arrives at *the event*, so
    one action fans out across the live bookings and every vendor is told once.
    If all calls fail, the backend's own wording is shown (it's the one that
    knows you're 3 miles away), not a generic error.
  - Closed the loop on the vendor side: `/my-bookings` now shows "… checked in at
    the venue on …". It was already in the payload and the type, but nothing
    rendered it, so the client's arrival would have been write-only.
  - Fidelity caveat stands: browser geolocation is permission-gated and coarser
    than native, and the backend's ~0.2mi radius is unforgiving — a denied or
    low-accuracy fix reads as "you're not at the venue".
- [x] **E2a. "Needs you"** — `/activity`, linked from the Profile hub
  - **The plan assumed an in-app notification list was the cheap first step. It
    isn't.** There is no notifications table and no endpoint: `notify_*` sends an
    FCM push + an email and **persists nothing**. So a feed of past events would
    need a table, a write at every notify site, a read endpoint, read-tracking —
    and a migration against the production DB. Same order of work as real push.
  - So this is **derived, not stored**: one screen computing what's waiting on
    you from data the app already fetches — no backend change, no migration.
    - *Vendor:* Stripe onboarding unfinished (clients literally can't pay you),
      requests to answer, and paid bookings where your check-in/confirm is the
      only thing holding up your own payout.
    - *Client:* bookings to pay, a total still pending a quantity (so the Pay
      button's absence is explained rather than mysterious), and events that are
      over and waiting on your confirm to release the vendor.
    - *Both:* unread group-chat messages.
  - Every row mirrors a backend guard, so it never points at an action the server
    must reject — confirms use the booking's **last** day, like
    `event_confirmable_date`, and a quantity-pending booking is never shown as
    payable.
  - Cost: 2 calls for a client, 4 for a vendor, all already-existing endpoints.
  - The page says plainly that nothing can reach you with the tab closed.

- [x] **E2b. True web push** — FCM for Web (service worker + VAPID)
  *(Verified: opt-in on a real browser, and an actual push arrived — with some
  first-delivery latency, which is normal for web push, see note at the end.)*
  - **Backend shipped first** (separate repo, deployed): push tokens moved off the
    single `users.fcm_token` column to a `push_tokens` table (one user → many
    devices), a `send_push_to_user` helper that fans out and prunes dead tokens,
    and `register-token` gaining a `platform`. Migration 0031 backfilled then
    dropped the column. **The key realisation:** FCM registration tokens are the
    same string shape for native and web, so a browser is just another device on
    the existing Firebase Admin send path — no separate VAPID/pywebpush stack.
  - **Web client:** `lib/push.ts` registers `/app/firebase-messaging-sw.js`
    (explicit scope — FCM would otherwise look for it at the origin root and 404
    under `/app`), requests permission, `getToken({ vapidKey })`, and registers
    it with `platform:"web"`. The firebase SDK is imported lazily so it never
    loads for users who don't opt in. "Turn on notifications" lives on `/activity`;
    a foreground listener shows messages FCM suppresses while the tab is focused;
    sign-out removes this browser's token (needs the session still valid, so it
    runs before the session clears).
  - **Config:** `firebaseConfig.ts` (env-overridable) + the same five values
    hard-coded in the service worker (a static file can't read env). The **web**
    app's `apiKey`/`appId` — not the iOS ones. The values are public by design
    (they ship in the browser), so they're committed, not secret. A guard hides
    the opt-in until every value is real.
  - **Verified live** — opt-in, permission grant, and a real push delivered.
  - **Latency note:** web push isn't as instant as native. The first push after
    enabling is the slowest (token propagation), and the browser/OS wakes the
    service worker to deliver, which adds a beat — especially when idle or the
    tab is closed. It's normal. If it needs to be snappier for time-sensitive
    messages, the backend can mark web pushes high-urgency
    (`WebpushConfig` headers `Urgency: high`) in `_build_message` — a small,
    optional backend change + deploy.

---

## Working rules

- Mirror the backend's guards in the UI — never offer an action that must fail
  (see the Pay button and escrow actions for the pattern).
- Never show a rate as if it were a total; carry `price_unit` through.
- Verify against the real backend before ticking a box; `npm run deploy` publishes
  the marketing page and the app together.
- **`npm run deploy` is self-verifying — use it, not `wrangler deploy` directly.**
  `wrangler`'s incremental asset upload has intermittently dropped files while
  still printing `Deployed … triggers` + a Version ID — so a success line is NOT
  proof the app shipped. It's happened 3+ times: `/` (a plain static file) keeps
  serving while every `/app` route 404s. One run failed hard
  (`assets-upload-session`, `code: 10013`); another reported success yet shipped
  nothing.

  `scripts/deploy.mjs` handles this: build once, deploy, then fetch every route
  in the built export (cache-busted) and re-deploy until they all return 200,
  exiting non-zero if it can't. `npm run deploy:once` is the raw single-shot if
  you ever need it. Manual spot-check is still cheap:

  ```bash
  for p in / /app/ /app/browse/ /app/book/ /app/plan/ /app/bundles/; do
    echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' -L https://jornaevents.com$p)"
  done
  ```

- Client-rendered pages ship a Suspense fallback in their static HTML, so
  grepping the deployed HTML for page copy proves nothing — check the status
  code and that the JS bundle is referenced.
