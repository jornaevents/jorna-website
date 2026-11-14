// Build-time feature flags. Static export (no SSR), so these are baked in
// at build time — same NEXT_PUBLIC_*-with-fallback pattern as sentry.ts and
// firebaseConfig.ts.

// Mirrors the backend's ESCROW_ENABLED (Desiconnect/server/app/config.py) —
// see docs/DECISIONS.md's "Escrow disabled for the MVP" entry. Off for the
// MVP: Venmo/Zelle is the only payment option shown anywhere a vendor sets
// one up or a client sees one.
export const ESCROW_ENABLED = process.env.NEXT_PUBLIC_ESCROW_ENABLED !== "false";

// Web push. Off until it's switched back on: the backend's Firebase
// credentials were removed from production on 2026-09-29 (no devices were
// registered), so an opt-in would register a browser that never hears
// anything. Turning it back on needs FIREBASE_CREDENTIALS_JSON on the backend
// first (jorna-backend docs/STAGING.md), then NEXT_PUBLIC_PUSH_ENABLED=true here.
export const PUSH_ENABLED = process.env.NEXT_PUBLIC_PUSH_ENABLED === "true";

// Dark mode. Off unless "true" (2026-11-13): the site is light only, whatever
// the device's setting, and vendor Settings has no theme picker. On, it's the
// light/dark switch as it was: the Settings picker, following the device by
// default. The layouts mark <html data-dark-mode> when it's on, and every dark
// rule in globals.css and vendor-shell.css requires that mark — CSS can't read
// the variable itself, and the mark keeps a stored theme or a dark device from
// reaching a build that's meant to be light.
export const DARK_MODE_ENABLED = process.env.NEXT_PUBLIC_DARK_MODE_ENABLED === "true";
