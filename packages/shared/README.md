# @jorna/shared

Code both web apps use, identical on both sides: the API client and token
refresh, push, Sentry, pricing and address helpers, the UI kit, and the
brand styles. Each app imports it as source —

```ts
import { apiFetch } from "@jorna/shared/lib/api";
import { Button } from "@jorna/shared/components/ui";
import "@jorna/shared/styles/globals.css";
```

— and Next compiles it with the app (Turbopack builds workspace packages
automatically), so there's no build step here.

`fonts/` holds the typefaces as committed `.woff2` files (latin subset,
variable weight, SIL Open Font License), loaded through `next/font/local` by
`lib/fonts` (DM Sans, Manrope) and `lib/landingFonts` (Cormorant Garamond,
Inter) — so a build never downloads fonts. To add a face or weight,
download its file from Google Fonts into `fonts/` and declare it there.

It also holds the contract and negotiation code the client app will need
for signing in its own app (plan phase 4): the contract's types
(`lib/contractTypes`), the draft model (`lib/contractDraft`), the comparison
(`lib/contractDiff`), the negotiation value model (`lib/negotiation`), and
`components/negotiation/` (`ContractPaper`, `ContractCompare`,
`NegotiationWorkspace`). These read only the fields they declare
(`PackageSource`, `RequestSource`, `ContractTermsSource`, …), so either app's
wider types fit. The wrappers that call the API (`VendorNegotiation`,
`ClientNegotiation`) stay in the vendor app.

The service taxonomy (backend DECISIONS #35) is here too: `lib/taxonomy`
(`useTaxonomy`, search and labels) and `components/ServicePicker`, so a
service is found and named the same way in both apps.

So are a chat's labels (Inquiry, Negotiation, Booked, Closed): their words
and colours in `lib/messageLabels`, and `StatusPill` in `components/ui`,
drawn with the `--pill-*` tokens in `styles/globals.css`.

The Messages inbox's AI summary line (`components/SummaryPreview`) and its
"Show AI summaries" account setting (`components/AiSummarySetting`) are here
too, since both apps draw them the same way (backend DECISIONS #43).

Change something here and both apps get it. What isn't here yet — the
typed API layer (`lib/jorna.ts`), most of `lib/types.ts`, auth and the
components built on them — has drifted apart between the apps and is being
reconciled before it moves.

```bash
npm --workspace @jorna/shared run lint
npm --workspace @jorna/shared run typecheck
npm --workspace @jorna/shared run test
```
