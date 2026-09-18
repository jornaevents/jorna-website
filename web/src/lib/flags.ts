// Build-time feature flags. Static export (no SSR), so these are baked in
// at build time — same NEXT_PUBLIC_*-with-fallback pattern as sentry.ts and
// firebaseConfig.ts.

// Mirrors the backend's ESCROW_ENABLED (Desiconnect/server/app/config.py) —
// see docs/DECISIONS.md's "Escrow disabled for the MVP" entry. Off for the
// MVP: Venmo/Zelle is the only payment option shown anywhere a vendor sets
// one up or a client sees one.
export const ESCROW_ENABLED = process.env.NEXT_PUBLIC_ESCROW_ENABLED !== "false";
