# Booking audit roadmap

Tracks the 17 findings from the 2026-09-01 client/vendor QA pass (booking
request flow + both dashboards) through to resolution. Each item was
re-verified against the current code (and in three cases, live on
production) before being fixed — the original single-pass QA agent got a
few false positives where behavior was actually deliberate; those are noted
below rather than silently dropped.

Severity and IDs match the original audit artifact.

## High

- [x] **JR-01** — Every conversation thread crashed on open.
  Root cause: `getConversationMessages` read `res.messages`, but the backend
  returns `{items, total, limit, offset}` — `res.messages` was always
  `undefined`, and `upsert(undefined)` dereferenced `.message_id` on it.
  Fixed in `web/src/lib/jorna.ts` + `web/src/app/conversation/page.tsx`.
- [x] **JR-02** — Vendor calendar always showed "nothing booked."
  Root cause: `my-calendar/page.tsx` requested `limit=200`; the backend caps
  at 100 (`422`), silently swallowed by a `.catch(() => [])`. Every other
  call site in the app already used 100. Fixed the one stray call.
  The other half of this finding (no availability-awareness in the booking
  form) is folded into JR-08 below.
- [x] **JR-03** — Uploading an account photo blanked the whole profile form.
  Root cause, worse than the original report: `PUT /me/avatar` returns only
  `{pfp_url}`, but the frontend typed it as a full `User` and did
  `setUser(updated)` — replacing the entire app-wide session user object,
  not just the account page's local form state. Fixed `uploadAvatar`'s
  return type and merged the new `pfp_url` into the existing user instead
  of replacing it.
- [ ] **JR-04** — Vendor Stripe Connect onboarding never clears an hCaptcha
  challenge. This is Stripe's own bot-detection, not Jorna code — no fix
  possible from this repo. Worth a manual (non-automated) recheck
  periodically in case it's environment-specific.

## Medium

- [x] **JR-05** — ~~Vendor bio silently reverts on a second edit.~~
  **Not reproducible.** Live-tested on production (real vendor account,
  two sequential bio edits, network panel inspected): both `PATCH
  /vendors/me` requests carried the correct, current bio text and both
  persisted correctly. Closing without a code change.
- [x] **JR-06** — ~~"Add to plan" reads as sent.~~ **Already handled.** The
  form already shows an explicit disclaimer under the button ("Nothing
  reaches {vendor} yet... Sending the plan is what asks them") — a prior
  fix for this exact ambiguity, per the comment above it in
  `book/page.tsx`. No further change made.
- [x] **JR-07** — Booking note never reaches the message thread. This is
  intentional storage (the note lives on the booking, not the chat), but
  the field's copy invited the wrong expectation. Added a hint clarifying
  it's shown on the request, not sent as a message, in `book/page.tsx`.
- [x] **JR-08** — Booking form had no vendor-availability awareness. Reused
  the marketplace's existing (already-built, already-fails-open)
  `hasConflictOn` / `getVendorAvailability` helpers to show a soft warning
  when the selected date conflicts with the vendor's calendar. Not a hard
  block — `lib/availability.ts`'s own notes document the endpoint as
  unreliable/often-empty, so a wrong guess should cost a missed warning,
  never a wrongly-blocked request.
- [x] **JR-09** — "Needs you" page hung on "Loading…" with no escape.
  Root cause: `load()` had no try/catch, so any rejection left `items` at
  `null` forever. Added error handling + a visible "Try again" action,
  matching the pattern every other page in the app already uses.
- [x] **JR-10** — A decline produced zero client-side notification. The
  "Needs you" badge is deliberately actionable-only (confirmed by
  `ATTENTION_KINDS`), so a decline doesn't belong there — but the status
  label itself used `text-ink-faint`, the dimmest tone in the file, for a
  status change a client hasn't necessarily seen. Changed to the same
  alert tone already used for refunded/disputed. A full fix (actual
  push/notification on decline) needs backend work — this repo has no
  notification-history mechanism to build on.

## Low

- [x] **JR-11** — $0 pricing published with no confirmation. Changed the
  price field's `min` from `0` to `0.01`, so the browser's own constraint
  validation (already trusted for rejecting negative prices) also rejects
  zero.
- [x] **JR-12** — ~~Mobile menu highlights the wrong active item.~~ **Not a
  bug.** Confirmed by reading `nav.tsx`'s own comment: `VENDOR_TABS`
  deliberately collapses every seller page (including Listing) under one
  "Dashboard" tab on mobile — there's no separate "Listing" item to
  highlight. This was a fix for an earlier, worse problem (duplicate
  navigation). No change made.
- [x] **JR-13** — Empty Messages state linked to the client dashboard
  (`/bundles`) even for vendor-only accounts. Wired in the existing
  `loadIsVendor()` role check (already used elsewhere for the same
  decision) to point at `/my-dashboard` instead.
- [x] **JR-14** — Travel-radius spinbutton reported `aria-valuemin/max` as
  0/0. Root cause: the field had `min` but no `max` HTML attribute, which
  Chromium reports as `0` in the accessibility tree. Added `max={500}`
  (matches the backend's own `1–500` validation) and tightened `min` to
  `1` to match.
- [ ] **JR-15** — Negative guest counts have no server-side guard (client
  constraint only). Needs a backend-side validation fix; out of scope for
  this frontend-only repo.
- [x] **JR-16** — "Negotiate price" stayed live on a declined booking.
  Root cause: the negotiate-button condition checked `isBeyondActionable`
  (payment states only) but not `isDeadBooking` (rejected/cancelled) —
  every other action on this page already checks both. Added the missing
  check.
- [ ] **JR-17** — Expected 404s (existence checks) logged as console
  errors. This is the browser's own behavior for any non-2xx fetch
  response, regardless of how gracefully the app handles it in JS — not
  fixable from application code without changing the API to use a
  different sentinel (backend decision). Documented, not fixed.

## Summary

10 real bugs fixed, 3 findings investigated and closed as false positives
(deliberate behavior, verified live or against code/comments), 3 need
backend work or are outside this repo's control, 1 confirmed unfixable
from the frontend. `npm --prefix web run typecheck`, `lint`, and `test`
all pass on the resulting change.
