# API (client-side)

This repo contains **no server or API implementation** — it's a client of an
external FastAPI backend (`Desiconnect/server`, a separate repository,
typically deployed to Railway). This document covers how the frontend talks
to that API, not the API's own route implementations.

## Layers

```
components/pages
      │  call typed functions, never fetch() directly
      ▼
web/src/lib/jorna.ts     one function per endpoint, typed request/response
      │
      ▼
web/src/lib/api.ts       transport: auth headers, retry-on-401, error parsing
      │
      ▼
fetch() → NEXT_PUBLIC_API_BASE_URL (default: a Railway-hosted FastAPI backend)
```

- **`api.ts`** — `apiFetch<T>()` and `apiUpload<T>()`. Attaches
  `Authorization: Bearer <access>` when `auth: true` (default). On a 401 with
  a refresh token available, attempts exactly one silent refresh
  (`/auth/refresh`) before retrying; calls `tokens.onAuthLost()` if that
  fails. `apiUpload` deliberately omits `Content-Type` so the browser can set
  the multipart boundary itself.
- **`jorna.ts`** — the actual API surface (~1000 lines, one export per
  backend call: bundles, vendor search, bookings, negotiation, messaging,
  earnings, etc.). **Add new backend calls here**, not as inline `fetch`
  calls in components.
- **`types.ts`** — TypeScript interfaces mirroring the backend's Pydantic
  schemas, kept close by convention (hand-maintained, not generated). This is
  also where shared response-shaping helpers live (e.g. price-line
  formatting — see "Pricing contract" in `docs/ARCHITECTURE.md`).

## Auth model

- **Email/password:** goes directly to the backend (`/auth/login`,
  `/auth/register`), which issues Jorna's own JWT access + refresh token
  pair. Persisted in `localStorage` by `web/src/lib/auth.tsx`.
- **Google OAuth:** goes through Supabase (`web/src/lib/supabase.ts`) to get
  a Supabase-issued token, which is then exchanged for a Jorna session via
  `adoptSession` (see `web/src/app/auth/callback/`). Supabase is used purely
  as an OAuth identity provider — it is not the app's general auth system.
- Token access is injected into `api.ts` via `configureTokens()` (called by
  `AuthProvider`) rather than imported directly, so `api.ts` has no React
  dependency and stays usable outside components (e.g. a future server
  action, or the WebSocket connection via `currentAccessToken()`).

## Error handling

- `ApiError` carries the HTTP status and a human-readable message.
- `parseError()` in `api.ts` special-cases:
  - `429` → a fixed friendly message (the backend's slowapi body shape
    doesn't match the others and is developer-facing).
  - FastAPI/Pydantic `detail` arrays → joined `msg` fields, with the
    Pydantic v2 `"Value error, "` prefix stripped.
  - Falls back to `data.message` or a generic `Request failed (status)`.
- Components generally catch `ApiError` and show `.message` directly — it's
  already been made presentable by this layer.

## CORS / environment note

The backend's `ALLOWED_ORIGINS` only includes `https://jornaevents.com` (and
presumably `http://localhost:3000` for dev — confirmed working per
`README.md`). `*.pages.dev` preview URLs are **rejected** by CORS; see
`DEPLOY.md` for the verified preflight output. Don't expect a Cloudflare
Pages preview deployment to be able to call the API.

## Realtime

`currentAccessToken()` in `api.ts` exists specifically so a WebSocket
connection can authenticate via a `?token=` query param (bearer headers don't
apply to WS handshakes). See `web/src/lib/chat.ts` for the consumer.

## Where to look for more

- Full endpoint list: read `web/src/lib/jorna.ts` directly — it's short
  per-function and organized by feature area with section comments.
- Response shapes: `web/src/lib/types.ts`.
- `MESSAGING_PROPOSAL.md` and `RESCHEDULE_PROPOSAL.md` read as "not yet
  built," but both shipped shortly after being written and neither doc was
  updated — the messaging, negotiation, and reschedule endpoints they
  describe are live. Treat them as design rationale, not a to-do list; see
  "A note on the proposal docs" in `docs/BOOKING_FLOW.md`.
- `VendorDetail.specializations` / the `specializations` field on
  `VendorCreateInput`/`VendorUpdateInput` (`web/src/lib/types.ts`) is a
  vendor's full multi-select category list. A 2026-08-29 onboarding QA pass
  found the backend silently dropped everything past the first entry — a
  `POST /vendors` with two specializations came back with no
  `specializations` key at all, and a reload showed only the first.
  `Desiconnect/server` migration `0045_add_vendor_specializations` (not in
  this repo) adds a matching column and wires it through
  `POST /vendors` / `PATCH /vendors/me` / `GET /vendors/me`.
  `VendorIdentityFields` (`web/src/components/VendorProfileFields.tsx`) was
  reverted from a single-pick workaround back to multi-select on the
  strength of that backend change — **this only actually round-trips once
  that migration is deployed**; until then (or for a vendor record that
  predates it), `vendorSpecializations()` in `types.ts` is where the
  reload-time single-item fallback lives. `category`/`subcategory` are still
  sent alongside `specializations` (mirroring its first entry), since the
  backend persists all three as independent columns rather than deriving one
  from another.
- `client_note` on `BookingCreateInput` (`jorna.ts`) / `BundleBooking` /
  `VendorBooking` (`types.ts`) is the same kind of optimistic field: `/book`
  sends whatever the client typed in "Anything the vendor should know?", and
  `/my-bookings` and `/my-dashboard` render it back on the vendor's side —
  but until the backend accepts and stores this field on `POST /bookings`
  and returns it on both booking shapes, a vendor won't actually see
  anything a client writes there. No fallback exists for this one the way
  there is for specializations; it's silently a no-op until the backend
  adds the field.
