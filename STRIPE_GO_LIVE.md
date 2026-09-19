# Taking Stripe out of test mode

Stripe is entirely server-side — reached only through the backend's hosted
Checkout/Connect redirects (see `docs/ARCHITECTURE.md`). There is no Stripe
code or key in this repo (`jorna-website`); going live is a Stripe Dashboard +
backend (`Desiconnect/server`, deployed on Railway) config task.

Relevant backend files (for reference, not checked out here):
`app/config.py`, `app/services/stripe_service.py`.

## Steps

1. **Activate the Stripe account for live mode.**
   Complete business verification in the Stripe Dashboard (legal entity, bank
   account, etc.). Live mode stays locked until this is done.

2. **Swap the API keys on the backend (Railway env vars).**
   - `STRIPE_SECRET_KEY`: `sk_test_...` → `sk_live_...`
   - `STRIPE_PUBLISHABLE_KEY`: `pk_test_...` → `pk_live_...` (defined in
     config but currently unused anywhere in the codebase — safe to update
     for consistency, not functionally required)

3. **Create a live-mode webhook.**
   Test and live webhooks are separate in Stripe. In Dashboard → Developers →
   Webhooks (with "Viewing test data" toggled off), add an endpoint at
   `https://<api-domain>/payments/webhook`, subscribe to at least
   `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `account.updated` (the events `stripe_service.py` handles), then copy its
   live `whsec_...` into `STRIPE_WEBHOOK_SECRET` on Railway.

4. **Re-onboard vendors.**
   Stripe Connect Express accounts created in test mode (`stripe_account_id`
   stored per vendor) don't exist in live mode. Every vendor who onboarded
   pre-launch will need to go through "Start Stripe Onboarding" again once
   live keys are active — their first live charge/payout would otherwise fail
   against a nonexistent account.

5. **Confirm `FRONTEND_URL` / `WEB_APP_URL`.**
   These build the Checkout/Connect return URLs — make sure they're set to
   `https://book.jornaevents.com` (this repo's production domain since the
   jorna-vendor cutover; not localhost, and not the apex `jornaevents.com`,
   which now belongs to the vendor app) in the production environment. As of
   this cutover, Railway's `FRONTEND_URL` is actually
   `https://desiconnect-production.up.railway.app` — the backend's own URL,
   not a frontend at all, and there's no `WEB_APP_URL` set — pre-existing,
   found while updating this doc, not caused by the domain move. Harmless
   while escrow/Stripe stays disabled for the MVP, but fix this before Stripe
   go-live per this checklist.

6. **Sanity-check `PLATFORM_FEE_PERCENT`.**
   Confirm it's set to the real intended fee, not a test value.

7. **Run one real transaction end-to-end.**
   Small live booking through checkout, confirm both parties, verify the
   Transfer lands in a vendor's Connect account and the platform fee is
   correct, before opening it up.

None of this requires touching this repository.
