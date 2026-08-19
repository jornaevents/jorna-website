# Booking lifecycle — client and vendor sides

How a booking moves from "AI-generated suggestion" to "money released to a
vendor," on both sides of the marketplace. Read `docs/ARCHITECTURE.md` first
for how the pieces fit together generally; this doc is the detailed walk of
one specific cross-cutting flow.

**Source of truth for all of this is code, not `DESIGN_BRIEF.md` or the root
`*_PROPOSAL.md` files.** See "A note on the proposal docs" at the bottom —
both `MESSAGING_PROPOSAL.md` and `RESCHEDULE_PROPOSAL.md` open with
"decisions made; not yet built," but the features they describe shipped
within a day of the doc being written and the docs were never updated. Trust
`jorna.ts`/`types.ts` over their prose.

## The status model (the one non-obvious thing to internalize first)

A booking has **two independent status fields** — a status pill design that
treats this as one 9-value enum (as `DESIGN_BRIEF.md` sketches) is wrong.
Both live on `Booking` in `web/src/lib/types.ts`.

**`status`** (`BOOKING_STATUS_LABELS`, `types.ts:967-973`) — the request/offer
lifecycle:

| value | label | meaning |
|---|---|---|
| `pending` | "Awaiting vendor" | sent to vendor, no answer yet |
| `negotiation_ongoing` | "Negotiating" | a `Negotiation` is open |
| `approved` | "Approved" | vendor accepted; payable |
| `rejected` | "Declined" | vendor declined, **or** vendor cancelled an already-approved booking (same value, different copy — see "Vendor accept/decline" below) |
| `payment_confirmed` | "Paid" | payment succeeded |

There is no `cancelled` value. `planning.ts`'s `DEAD_STATUSES` and
`MoneyBreakdown.strandedInEscrow` in `types.ts` both defensively check for one
anyway — dead code guarding a value nothing currently sets.

**`payment_status`** (`PAYMENT_STATUS_LABELS`, `types.ts:976-983`) — where the
money is:

| value | label | meaning |
|---|---|---|
| `unpaid` | "Not paid" | default |
| `processing` | "Processing" | charge in flight |
| `paid` | **"Held in escrow"** | Stripe succeeded; funds held — note the label says "escrow," not "paid" |
| `released` | "Released to vendor" | escrow paid out |
| `refunded` | "Refunded" | |
| `disputed` | "Disputed" | frozen for review |

A booking can be `status: payment_confirmed` ("Paid") and
`payment_status: paid` ("Held in escrow") at the same time — that's the normal
state right after checkout, not a contradiction. Any UI showing booking state
needs two pills, not one.

Two more independent status enums exist for sub-flows:
- **`ChangeRequest.status`** (`types.ts:668`): `pending | accepted | declined | withdrawn | expired` — a reschedule proposal.
- **`Negotiation.status`** (`types.ts:721`): `open | accepted | rejected` — a price counter-offer thread.

## Client (host) journey

1. **Build a bundle** — `/plan` (`web/src/app/plan/page.tsx`) posts the event
   brief to `generateBundles()` (`jorna.ts`, `POST /chatbot/bundles`), which
   returns 3 `BundleOption`s (Budget / Balanced / Top Rated), persisted
   server-side as **drafts**. Picking one (`choose()`) deletes the other two
   and routes to `/bundle?id=`. Nothing is sent to any vendor yet.
2. **Add/adjust services** — from a vendor/service page, `/book` (`book/page.tsx`)
   calls `createBooking()` (`POST /bookings`), either into a new bundle or an
   existing one. Still draft until sent.
3. **Send the plan** — `selectBundle()` (`jorna.ts`, `POST /bundles/{id}/select`),
   called from `send()` in `bundle/page.tsx`, is the one action that notifies
   vendors and moves the bundle out of draft. `isDraftBundle()` (`planning.ts`)
   is how the UI tells draft vs. sent apart. Gated by `sendReadiness()` /
   `bookingGaps()` (`planning.ts`): every live booking needs a date, full
   address, hours, and (if per-person priced) a guest count before it can be
   sent — enforced client-side, mirrored by a backend guard.
4. **Vendor responds** — see vendor journey below. While waiting, the client
   sees `status: pending` ("Awaiting vendor").
5. **Negotiate (optional)** — `NegotiationPanel.tsx`, shown when a booking is
   `open_to_price_negotiation` and still actionable. Backed by
   `getNegotiation`/`startNegotiation`/`counterOffer`/`acceptOffer`/`rejectOffer`
   (`jorna.ts`). Turn-based: `Negotiation.proposed_by` gates who may counter vs.
   accept/decline (`NegotiationPanel.tsx`, `mineIsCurrent`). Accepting sets the
   booking's price and flips `status` to `approved` server-side.
6. **Pay** — once `approved`, `pay()` in `bundle/page.tsx` calls
   `createCheckoutSession()` (`POST /payments/bookings/{id}/checkout-session`)
   and redirects to Stripe-hosted Checkout. `/payment-complete` reads back
   `?booking_id&status` and calls `syncBookingPayment()` as an idempotent
   webhook-delay safety net. A saved card (`getSavedCard`/`startCardSetup`/
   `syncSavedCard`, rendered by `CardOnFile`) lets later vendor approvals
   auto-charge without a repeat Checkout trip; `/card-saved` handles that
   return leg via a `sessionStorage` handoff key.
7. **Reschedule (optional)** — `DateChangePanel.tsx` (sticky rail on
   `/bundle`) proposes a new date plan-wide via `proposeChange()`
   (`POST /bundles/{id}/change-request`) against every `movable` booking
   (`approved`/`payment_confirmed`). If the new dates cost more,
   `repriced_amount_cents` is set and the client must
   `consentToChangePrice()` (charges the difference) before it takes effect —
   gated by `awaitingClientConsent()` (`types.ts`). If a vendor declines or
   the request expires, the client can `refundAfterFailedReschedule()` for
   `100 - RESCHEDULE_CANCELLATION_PCT` (90%) of that booking's total.
8. **Guest list / RSVP** — hangs off the *event*, not the booking directly
   (`bundle → event_id → EventItem`). `/guests` manages the list
   (`getGuestList`/`addGuest`/`addFunction`/etc.); guests RSVP either
   passwordless via an emailed token link (`getInvitation`/`sendRsvp`,
   `/rsvp`) or by joining a shared invite link. `GuestsRow` on `/bundle`
   deliberately shows only the *biggest function's* headcount against the
   booking's own `guest_count` — not a sum across functions.
9. **At the event** — `VenueCheckIn.tsx` offers the client an "I'm at the
   venue" action (`checkInBooking()`). This is explicitly **not** an escrow
   action — it only sets `client_checked_in_at` for presence/notification
   purposes (see the component's own header comment).
10. **Confirm & release** — the "Confirm & release" action in `BookingRow`
    (`bundle/page.tsx`) is gated on `canConfirmBooking()` (`types.ts`): the
    event is over, or the vendor has checked in and the event has started.
    Calls `confirmBookingEvent()` (`POST /payments/bookings/{id}/confirm`).
    Funds release only once **both** `customer_confirmed_at` and
    `vendor_confirmed_at` are set (or `autoReleaseOn()` — last event day + 7 —
    passes once the vendor has confirmed).
11. **Refund / dispute** — `refundBooking()` (`POST /payments/bookings/{id}/refund`)
    is a full refund, only within `REFUND_WINDOW_HOURS` (24h) of `paid_at`
    (`withinRefundWindow()`). `disputeBooking()`
    (`POST /payments/bookings/{id}/dispute`) freezes a single booking's
    payment while it's `payment_status: paid`. Both live in the escrow block
    of `BookingRow`.

## Vendor journey

1. **Onboarding** — `/vendor-onboarding`, a resumable 3-step wizard
   (identity+bio → reach → first service). An account with active client-side
   bookings/requests is blocked from switching to vendor
   (`hasActiveBookings()`, `planning.ts`). "Done" means at least one service
   exists, not just a vendor record — `/vendor-profile` redirects back here
   until that's true.
2. **Availability** — `/my-availability`: per-weekday time windows
   (`getMyAvailability`/`setMyAvailability`). This is advisory, not a hard
   gate — `listingHealth()` (`vendorPlan.ts`) flags "no weekly hours set" as a
   warning, and the marketplace date filter and `getVendorAvailability`
   (which also folds in Google Calendar busy times) use it for display.
3. **Receive a request** — `/my-bookings`, filtered `pending` (needs an
   answer — includes `negotiation_ongoing`) / `upcoming`
   (`approved`/`payment_confirmed`) / `all`.
4. **Approve / decline** — `setBookingStatus(id, "approved"|"rejected")`
   (`PUT /bookings/{id}/status`). A 409 on approve means an overlapping
   accepted booking. Cancelling an already-approved booking reuses the same
   `rejected` status (different copy in the UI) and is only offered while
   `payment_status` isn't `processing`/`paid`/`released`/`refunded`/`disputed`
   — i.e. never after money has moved.
5. **Negotiate / respond to a reschedule** — mirror of the client actions
   above: `NegotiationPanel.tsx` (vendor can counter/accept when it's their
   turn), `DateChangeRequest.tsx` on `/my-bookings` → `respondToChange()`.
6. **Check in / confirm at the event** — the vendor's half of escrow release,
   two routes depending on whether the booking has a venue anchor
   (`checkin_latitude`/`longitude`, resolved from the plan's venue or the
   event address):
   - **Has a venue**: GPS "Check in at venue" on `/my-bookings`, or the
     no-login token link from a pre-event reminder email
     (`/check-in?t=`, `getCheckInInvite`/`checkInWithToken`) — same
     server-side GPS verification either way.
   - **No venue** (e.g. a mobile service): falls back to a plain "Confirm"
     once the event is over (`vendorConfirm()` → `confirmBookingEvent()`).
   Either path sets `vendor_confirmed_at`; release still waits on the
   client-side confirmation too (see step 10 above).
7. **Get paid** — `/my-earnings`. `paymentsSetup()` (`vendorPlan.ts`) is the
   single source of truth for the Stripe Connect gate, with 5 states:
   `not-started | unfinished | needs-more | under-review | ready` — read
   identically by the attention badge, the dashboard, and this page.
   `startStripeOnboarding()` redirects to Stripe's hosted Connect flow and
   returns to `/my-earnings?stripe=return`; `getStripeStatus()` polls live
   status. Earnings tiles (`getEarnings()`): released total, in-escrow total,
   upcoming, plus disputed/refunded when applicable; history rows show gross
   minus platform fee = net. An un-onboarded vendor can still accept bookings
   but cannot be paid — the earnings page states this plainly rather than
   hiding the booking flow.

## Where the rules live (don't re-derive elsewhere)

Both files below are read by `web/src/lib/attention.ts` for the tab-bar badge
and by the respective dashboard pages — see "single source of truth" in
`docs/ARCHITECTURE.md`.

- **`web/src/lib/planning.ts`** (client) — `TaskKind`:
  `event-detail | quantity | payment | confirm`. (`event-detail` is
  deliberately excluded from the attention badge — it's a task list item, not
  a badge-worthy one.)
- **`web/src/lib/vendorPlan.ts`** (vendor) — `VendorTaskKind`:
  `stripe | request | negotiation | date-change | confirm | check-in`. Also
  owns `PaymentsState` (the Stripe gate, above) and `DayStatus`
  (`booked | tentative | free`, for the vendor calendar).
- **`planning.ts`**'s `ProgressStage` (`toBook | chosen | awaiting | accepted
  | paid | problem | done`) drives the plan-progress bar on `/bundle` — a
  display concept, not a task list.

## A note on the proposal docs

`MESSAGING_PROPOSAL.md` and `RESCHEDULE_PROPOSAL.md` both open with
"decisions made; not yet built." In practice, both shipped within a day (in
one case 28 minutes) of being written, and neither doc was updated
afterward. Everything described in "Negotiate / respond to a reschedule"
above and the reschedule flow in the client journey is live, current code —
do not describe these as future work. The one real gap: the messaging
proposal says `NegotiationPanel`'s own offer-history rendering should be
retired once threaded messaging ships (the conversation thread becomes the
history of record); that retirement hasn't happened, so negotiation history
currently renders in two places (the panel inline, and the conversation
thread). Treat both proposal docs as design rationale ("why was this built
this way"), not as a statement of what's built — verify any specific claim
against `jorna.ts`/`types.ts` first.
