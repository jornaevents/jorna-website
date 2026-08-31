# Current Task

> Temporary working memory for the task in progress. This file describes
> *current* work, not permanent architecture — that belongs in `docs/`. It's
> expected to be overwritten/reset when a task finishes; don't treat it as a
> log.

## Goal

Fix the issues found by the 2026-08-29 vendor onboarding QA pass (published
report artifact, 15 findings + a production test-data note). This session
implemented fixes for everything in-scope for this repo.

## Current Status

Done. 13 of 15 findings fixed and verified with `tsc --noEmit`, `npm run
lint`, and a full `npm run build`, all clean (lint is the same 12
pre-existing `react-hooks/set-state-in-effect` errors as before this
session — none newly introduced, none in onboarding files). No browser
automation tool was available in this session, so the fixes were **not**
exercised in a live browser — see Verification below.

## What Was Fixed

1. **Specializations silently dropped (finding 01)** — originally worked
   around here by making `VendorIdentityFields` single-pick, since the
   backend only persisted one category/subcategory pair. That workaround was
   **reverted** later in the same session once the backend was actually
   fixed: `Desiconnect/server` (sibling repo, `c:\Users\yanik\Documents\GitHub\Desiconnect`)
   got a `specializations` JSON column on `vendors`
   (`server/alembic/versions/0045_add_vendor_specializations.py`) wired
   through `POST /vendors` / `PATCH /vendors/me` / `GET /vendors/me`, plus a
   new test file (`server/tests/test_vendor_specializations.py`, 6 tests,
   full suite 776 passed/0 failed). `VendorIdentityFields` is back to its
   original multi-select, and the `docs/API.md` / `types.ts` comments now
   describe the backend fix rather than "confirmed does not persist".
   **This only actually round-trips once that migration is deployed** —
   `alembic upgrade head` against the real `DATABASE_URL` plus a backend
   deploy, neither of which happened in this session. Until then, multi-pick
   silently reproduces the original bug (only the first entry survives).
   Deploy the backend before shipping this frontend change, or ideally
   together.
2. **Google vendor signup bypassed the wizard (finding 02)** —
   `auth/callback/page.tsx`: landing is now `role === "vendor" ?
   "/vendor-onboarding" : next`, dropping the `is_new_user` check so an
   *existing* client picking "Vendor" also reaches onboarding, not `/plan`.
3. **"Become a vendor" lost intent across the login hop (finding 03)** —
   home page CTA now links `/login?mode=register&role=vendor`; `login/page.tsx`
   seeds `role` state from the URL on mount (was always `null`). Also fixed
   the sign-in-mode subheading, which was hardcoded to the host pitch even
   when `role=vendor` was known (part of finding 14) — applied the same
   `role=vendor` param to the `/vendor-onboarding` and `/vendor-profile`
   unauthenticated redirects so that carries through too.
4. **Client→vendor guard failed open (finding 04)** —
   `vendor-onboarding/page.tsx`: `listBundles()` is no longer
   `.catch(() => [])`'d away. A failure now shows an error + "Try again"
   button (new `!step` render branch) instead of silently treating "couldn't
   check" as "nothing to check". Same page's loading gate previously showed
   an infinite spinner on any load error; now shows the same retry UI.
5. **Stale "Pinned to…" banner (finding 05)** — `ServicesManager.tsx`:
   `setMatched(null)` added to `startNew()`, `startEdit()`, and the Cancel
   button.
6. **Price field ate a typed zero (finding 06)** — `form.price || ""` →
   `form.price ?? ""`.
7. **"You're live" / dashboard mismatch (finding 07)** — took the
   report's "cheapest honest version": softened the done-screen headline,
   added a "Set weekly hours" link next to "Set up payments", moved "Go to
   your listing" to a smaller tertiary link. Did **not** add a 4th wizard
   step (report's "fuller version") — out of scope for this pass.
8. **No profile-photo nudge (finding 08)** — added a `no-profile-photo`
   warning rule to `listingHealth()` in `web/src/lib/vendorPlan.ts`,
   pointing at `/account` (where the upload actually lives).
9. **Vendor could report/block themselves (finding 09)** — `vendor/page.tsx`
   now computes `isOwnVendor` via `useAuth()` vs `vendor.user_id` and hides
   the CTA block + `ModerationMenu` when true.
10. **No way back / no way out of the wizard (finding 10)** — added a
    state-only Back button on steps 2 and 3, and an "I'll add packages
    later" link (→ `/vendor-profile`) on step 3 before a package is added.
    Because Back can now return to step 1 after the vendor record already
    exists, `submitIdentity` was changed to call `updateMyVendor` instead of
    `createVendor` when `vendor` is already set — otherwise a second Back
    round-trip would have tried to create a duplicate vendor record.
11. **Validation error not cleared (finding 11)** — both onboarding step 1
    and `/vendor-profile` now clear `error` as soon as a category is picked
    (`updateSpecializations` wrapper around `setSpecializations`).
12. **No `aria-live` on errors (finding 12)** — added `role="alert"` to
    every error paragraph in the onboarding path: both wizard steps,
    `ServicesManager.tsx`, and `/vendor-profile`. Did **not** implement the
    report's secondary ask (moving focus to the offending control) — no
    existing focus-management convention in this codebase to extend, and
    `role="alert"` alone satisfies the "screen reader gets nothing" failure
    mode.
13. **CityCombobox missing `aria-controls` (finding 13)** — added `useId()`
    to link the input to the listbox.
14. **Copy mismatches (finding 14)** — reach-step "skip them" text (no skip
    button existed) reworded to "leave them blank"; login subheading fix
    covered under item 3 above.

## Not Fixed (deliberately out of scope)

- **Finding 15 (red lint)** — still the same 12 pre-existing
  `react-hooks/set-state-in-effect` errors from before this session, spread
  across mostly-unrelated files (account, activity, book, bundle, bundles,
  conversation, payment-complete, vendor, NegotiationPanel, nav ×2, auth.tsx).
  `vendor/page.tsx` has one (line ~190, not touched by this session's edit)
  but fixing it means touching every other file in that list too — a
  separate repo-wide lint-hygiene pass, not an onboarding fix.
- **Stripe Connect round trip** — still unverified; starting it creates a
  real third-party account, not something to do unattended.
- **The `blocked` step** (client with an active/escrowed booking converting
  to vendor) — still only reviewed in code, not exercised; needs a second
  account with money in flight.
- **Production test data** — the QA report's `qa_vendor_0829` account and
  the pre-existing `Test DJ Package (QA)` vendor are still sitting on the
  live backend. This repo has no admin/deletion tooling; cleanup needs to
  happen against the backend directly (`Desiconnect/server`) or via whatever
  admin access exists there.
- **Deploying the `specializations` backend fix** — the migration and API
  change exist in `Desiconnect/server` (see item 1 above) but nothing was
  deployed this session. The frontend is already back to multi-select on the
  assumption this lands; if the backend deploy slips, multi-pick reproduces
  the original silent-data-loss bug until it does.

## Verification

- `npx tsc --noEmit` (in `web/`) — clean.
- `npm run lint` (in `web/`) — 12 errors, 5 warnings, identical set to the
  pre-session baseline (confirmed by re-running before and after every
  change, including after the multi-select revert).
- `npm run build` (repo root) — full production build + static export
  succeeded, all 40 routes prerendered without error (also re-run after the
  revert).
- `Desiconnect/server`: full backend test suite (`pytest`, from
  `server/venv`) — 776 passed, 12 skipped, 0 failed, including the 6 new
  `test_vendor_specializations.py` tests.
- **Not done**: no browser was available in this session to click through
  the flow. Before shipping, someone should walk: home → "Become a vendor"
  (logged out) → register as vendor → land correctly on step 1 with role
  pre-selected; Back/forward through all 3 steps; the retry button on a
  simulated network failure; the vendor-viewing-own-listing case (no
  Report/Block, no client CTAs); and — once the backend is deployed — that
  picking two specializations in step 1 survives a reload.

## Files Changed

**This repo (jorna-website)**:
`web/src/app/{auth/callback,home,login,vendor-onboarding,vendor-profile,vendor}/page.tsx`,
`web/src/components/{VendorProfileFields,ServicesManager,CityCombobox}.tsx`,
`web/src/lib/{types,vendorPlan}.ts`, `docs/API.md`.

**`Desiconnect/server`** (sibling repo, `c:\Users\yanik\Documents\GitHub\Desiconnect`
— not this repo, but touched this session per an explicit ask):
`server/app/db/models.py`, `server/app/routers/vendors.py`,
`server/app/services/vendor_service.py`,
`server/alembic/versions/0045_add_vendor_specializations.py` (new),
`server/tests/test_vendor_specializations.py` (new). Uncommitted, undeployed
— see "Not Fixed" above.
