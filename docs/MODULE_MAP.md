# Module Map

Navigational index: "where do I look if I need to change X?" Read
`docs/ARCHITECTURE.md` first for how these pieces fit together.

There is no automated test suite in this repo — the "Tests" line below is
included for every module so it doesn't need re-checking each time; it's
always "none, verify manually" until a test runner is added.

## Marketing page

- **Responsible for:** the hand-written homepage at `/index.html` and the
  static `/help` page. No framework, no build step.
- **Code:** `public/index.html`, `public/help/index.html`.
- **Entry points:** open the HTML file directly; edit CSS/JS inline.
- **Consumers:** currently reachable only via a direct `/index.html` request —
  see "Root routing" in `docs/ARCHITECTURE.md`.
- **Related:** design tokens must stay in sync with `web/src/app/globals.css`.

## App shell & routing

- **Responsible for:** the Next.js App Router page tree, root layout, global
  nav chrome, and the root-route special case that makes `/` serve the app's
  Home page.
- **Code:** `web/src/app/layout.tsx`, `web/src/app/page.tsx`,
  `web/src/app/home/`, `public/_redirects`.
- **Entry points:** `RootLayout` wraps every page with `AuthProvider`,
  `SiteHeader`, `SiteFooter`, `AppTabBar`, `PushRuntime`.
- **Depends on:** `lib/auth.tsx`.
- **Related modules:** Shared UI shell (below).

## Shared UI shell

- **Responsible for:** header/footer chrome (including the mobile hamburger
  menu) and generic UI primitives used across pages.
- **Code:** `web/src/components/SiteHeader.tsx`, `SiteFooter.tsx`,
  `MobileNavMenu.tsx`, `VendorNav.tsx`, `nav.tsx`, `ui.tsx`,
  `ClientOnlyRoute.tsx`.
- **Depends on:** `lib/auth.tsx` (role-aware nav), `lib/role.ts`.
- **Consumers:** every page, via the root layout.

## API client layer

- **Responsible for:** all communication with the external backend — auth
  headers, retry-on-401, error normalization, typed request/response
  functions, and the TypeScript types mirroring backend schemas.
- **Code:** `web/src/lib/api.ts` (transport), `web/src/lib/jorna.ts`
  (one function per endpoint), `web/src/lib/types.ts` (schemas).
- **Entry points:** `apiFetch`, `apiUpload` (api.ts); everything in
  `jorna.ts` is a consumer-facing call — add new backend calls there.
- **Depends on:** nothing in-repo (talks to the external FastAPI backend via
  `NEXT_PUBLIC_API_BASE_URL`).
- **Consumers:** effectively every page/component that fetches data.
- **Full detail:** `docs/API.md`.

## Auth

- **Responsible for:** session state, token persistence, login/register,
  Google OAuth handoff.
- **Code:** `web/src/lib/auth.tsx` (context/provider), `web/src/lib/supabase.ts`
  (Google identity), `web/src/app/login/`, `forgot-password/`,
  `reset-password/`, `auth/callback/`.
- **Entry points:** `AuthProvider`, `useAuth()` (defined in `auth.tsx`).
- **Depends on:** `lib/api.ts` (`configureTokens`), `lib/attention.ts` and
  `lib/role.ts` (cache clearing on logout).
- **Consumers:** `RootLayout`, every page gating on `user`.

## Client planning flow

- **Responsible for:** the AI bundle builder, the client's plan/dashboard, and
  the "what's still outstanding" task rules for clients.
- **Code:** `web/src/lib/planning.ts` (task rules — single source of truth,
  see `docs/ARCHITECTURE.md`), `web/src/app/bundle/`, `bundles/`, `plan/`,
  `my-dashboard/`, `web/src/components/BundleResults.tsx`,
  `PlanProgress.tsx`, `DraftDetails.tsx`.
- **Depends on:** `lib/jorna.ts`, `lib/types.ts`, `lib/address.ts`
  (`isCompleteLocation`).
- **Consumers:** `lib/attention.ts` reads `planning.ts` for the nav badge.
- **Full detail (booking status model, checkout/escrow, confirm/release):**
  `docs/BOOKING_FLOW.md`.

## Vendor flow

- **Responsible for:** vendor profile/services management, availability,
  bookings, earnings, and the vendor equivalent of the task-rules module.
- **Code:** `web/src/lib/vendorPlan.ts` (task rules), `web/src/app/vendor/`,
  `vendor-profile/`, `my-availability/`, `my-bookings/`, `my-calendar/`,
  `my-earnings/`, `web/src/components/ServicesManager.tsx`,
  `VendorCard.tsx`, `VendorNav.tsx`.
- **First-time setup:** `web/src/app/vendor-onboarding/` — a resumable
  3-step wizard (category+bio, reach, first service) that both the
  register-as-vendor flow and "Start selling" route to instead of
  `vendor-profile/` directly. It shares field UI with `vendor-profile/` via
  `web/src/components/VendorProfileFields.tsx`, and reuses `ServicesManager`
  itself (via its `autoStartNew`/`onServiceAdded` props) for the service
  step rather than a second form. `vendor-profile/` assumes setup is done and
  redirects here if a user has no vendor record yet; the wizard's own test
  for "done" is having at least one service, not just a vendor record — see
  the comments in `vendor-onboarding/page.tsx` for why.
- **Depends on:** `lib/jorna.ts`, `lib/types.ts`, `lib/availability.ts`,
  `lib/pricing.ts`.
- **Consumers:** `lib/attention.ts` reads `vendorPlan.ts` for the nav badge.
- **Related:** `web/src/app/vendor/stripe-onboard/` (+ `refresh/`, `return/`)
  — Stripe Connect onboarding redirect targets; the onboarding wizard's last
  step links to `/my-earnings` to start that flow, but doesn't build it.
- **Full detail (approve/decline, check-in, earnings/Stripe gate):**
  `docs/BOOKING_FLOW.md`.

## Messaging & negotiation

- **Responsible for:** client↔vendor chat (pre-booking questions and
  in-booking threads), price negotiation, and date-change requests.
- **Code:** `web/src/lib/chat.ts`, `web/src/app/messages/`, `conversation/`,
  `web/src/components/AskVendor.tsx`, `NegotiationPanel.tsx`,
  `DateChangePanel.tsx`, `DateChangeRequest.tsx`, `ServiceSwapPanel.tsx`.
- **Depends on:** `lib/jorna.ts`, `lib/types.ts`.
- **Design context, already built despite the docs' own framing:**
  `MESSAGING_PROPOSAL.md` and `RESCHEDULE_PROPOSAL.md` both open with
  "decisions made; not yet built," but both shipped within a day of being
  written and were never updated afterward — treat them as rationale for *why*
  this works the way it does, not as a statement that it's unbuilt. See "A
  note on the proposal docs" in `docs/BOOKING_FLOW.md` for the one real gap
  (negotiation history rendering in two places) this staleness caused.

## Booking, events & check-in

- **Responsible for:** the booked event itself — guest list/RSVP, run sheet,
  venue check-in, payment completion screens.
- **Code:** `web/src/app/book/`, `event/`, `events/`, `guests/`, `rsvp/`,
  `check-in/`, `payment-complete/`, `card-saved/`, `calendar-connected/`,
  `web/src/components/RunSheet.tsx`, `VenueCheckIn.tsx`,
  `AddressFields.tsx`, `CityCombobox.tsx`.
- **Depends on:** `lib/checkin.ts`, `lib/geocode.ts`, `lib/cities.ts`,
  `lib/zips.ts`, `lib/address.ts`.

## Reviews & moderation

- **Code:** `web/src/components/ReviewPanel.tsx`, `ModerationMenu.tsx`,
  `web/src/app/blocked/`.
- **Depends on:** `lib/jorna.ts`.

## Push notifications

- **Responsible for:** requesting permission, registering device tokens, and
  handling foreground push while the tab is open.
- **Code:** `web/src/lib/push.ts`, `firebaseConfig.ts`,
  `web/src/components/PushOptIn.tsx`, `PushRuntime.tsx`.
- **Depends on:** Firebase Cloud Messaging (external), `lib/jorna.ts` for
  token registration.

## Marketplace / browse / search

- **Code:** `web/src/app/browse/`, `marketplace/`, `service/`,
  `vendor-profile/`, `web/src/lib/categoryTiles.tsx`, `celebrations.ts`.
- **Depends on:** `lib/jorna.ts` (`searchVendors` and related).

## Account & profile

- **Code:** `web/src/app/account/`, `profile/`, `activity/`.
- **Depends on:** `lib/auth.tsx`, `lib/jorna.ts`.

## Build & deploy tooling

- **Responsible for:** turning `web/` into `public/app/` and shipping
  `public/` to Cloudflare Pages reliably.
- **Code:** `web/scripts/export-to-public.mjs` (copy step, runs as part of
  `npm --prefix web run build`), `scripts/deploy.mjs` (self-verifying
  deploy — see `DEPLOY.md`), `scripts/build-zips.mjs`, `wrangler.jsonc`.
- **Do not** deploy with a bare `wrangler deploy` / `wrangler pages deploy`
  for routine changes — `npm run deploy` exists because incremental uploads
  have silently dropped files before. `npm run deploy:once` is the raw
  single-shot, for when you specifically want to skip verification.

## Unpublished drafts

- **Code:** `drafts/privacy/`, `drafts/terms/`, `drafts/support/`,
  `drafts/legal/`.
- **Note:** deliberately outside `public/` so they don't ship; see
  `drafts/README.md` for why they're parked.
