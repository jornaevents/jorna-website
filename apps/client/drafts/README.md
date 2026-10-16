# Drafts — not published

Anything here is deliberately outside `public/`, so `npm run deploy` doesn't
touch it.

## `privacy/`, `terms/`, `support/` (+ `legal/style.css`)

Terms and privacy rewritten 2026-10-13 from the Operator's Oct 6 Terms draft:
Jorna as software for vendors (no payment processing — clients pay vendors
directly), contracts signed by link, and Kabir Nagpal operating Jorna until a
company exists. Terms §6 and the privacy page's "Records we keep when you sign"
describe the signing evidence the backend keeps (backend DECISIONS #27): the
emailed one-time code, the e-records consent box, IP and device on open and
sign, the fingerprinted snapshot, and the certificate on the signed PDF that
goes to both sides. The consent wording itself lives in the backend
(`app/services/esign_consent.py`) — keep it and §6 saying the same thing.

`support/` is still the July draft (escrow, Stripe, check-in) and needs the
same rewrite before publishing.

### Before publishing

1. Replace every `FILL:` marker. They're highlighted in the rendered page so they
   can't be skimmed past:
   - effective date (both pages)
   - how long signed contracts and their signing records are kept, and how
     long server logs are kept (privacy page)
   - the support page's entity, email and escrow wording
   - the Terms set the minimum age at 18; the backend still accepts 13
     (`age … ge=13`), so that validation should change too, and it feeds the
     App Store age rating.
2. Have a lawyer read them, including the consent wording. These are accurate
   about the product, not legal advice.
3. `git mv` the three directories and `legal/` back into `public/`.
4. Add `/privacy/`, `/terms/` and `/support/` to the seed list in
   `scripts/deploy.mjs` so a deploy that stops serving them fails.
5. Link them from the app footer (`web/src/components/SiteFooter.tsx`) and the
   marketing page footer (`public/help/index.html`) — guideline 1.2 wants them
   reachable from inside the app, not only from the website.
6. `npm run deploy`. It aborts while any page under `public/` still contains
   `FILL:`, so a half-finished policy can't reach production.

### Why they matter

App Store Connect won't accept a listing without a privacy policy URL and a
support URL, and guideline 1.2 wants terms with a zero-tolerance clause plus a
way to reach a human, because the app carries user content (group chat, reviews,
uploaded photos). See `APP_STORE_LAUNCH_PLAN.md` §2.5–2.6 in the iOS repo.
