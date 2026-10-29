"use client";

// Supabase client — used only for Google OAuth. Supabase authenticates the
// Google identity; the Jorna backend then exchanges the Supabase token for its
// own JWT via POST /auth/google/lookup (see the /auth/callback page). Email/
// password auth never touches Supabase.
//
// The URL + anon key are the same public project the iOS app uses (the anon key
// is designed to ship in clients). Overridable via env for a different project.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ddfjhfqrrgvzphwiinch.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZmpoZnFycmd2enBod2lpbmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTAyODUsImV4cCI6MjA4ODMyNjI4NX0.McOl0oSLz28r10JYu6BI2N4M85BeuPIyOla3q66Zfuc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // PKCE: signInWithOAuth stores a verifier, Google redirects back with ?code=,
    // and the callback page exchanges it explicitly (detectSessionInUrl off so we
    // control the handshake on the dedicated /auth/callback route).
    flowType: "pkce",
    detectSessionInUrl: false,
    // Persist so the callback's session survives the redirect to the signup
    // completion form (/login?google=1) in the new-user case.
    persistSession: true,
    // We hand off to the Jorna JWT immediately, so no need to keep refreshing
    // the Supabase token in the background.
    autoRefreshToken: false,
  },
});

/** Where Google returns to. MUST be in Supabase → Auth → URL Configuration →
 *  Redirect URLs, or Supabase rejects the redirect. Trailing slash matches the
 *  static export (trailingSlash: true) so Cloudflare serves it without a bounce. */
export function googleRedirectTo(): string {
  return `${window.location.origin}/app/auth/callback/`;
}

// Where to land after a successful Google sign-in — stashed before the redirect
// (the callback page can't receive our own query params alongside Supabase's).
const OAUTH_NEXT_KEY = "jorna_oauth_next";
// Host or Vendor, when the redirect began from the sign-up form. A one-tap Google
// sign-up has no form to carry it, so it rides across the round trip here and
// decides where the new account lands. Absent for a plain sign-in.
const OAUTH_ROLE_KEY = "jorna_oauth_role";

export function rememberOAuthNext(next: string) {
  try {
    localStorage.setItem(OAUTH_NEXT_KEY, next);
  } catch {
    /* storage disabled — fall back to the default on return */
  }
}

/** The page the sign-in was started for, or null for none (see clientLanding). */
export function takeOAuthNext(): string | null {
  try {
    const v = localStorage.getItem(OAUTH_NEXT_KEY);
    localStorage.removeItem(OAUTH_NEXT_KEY);
    return v || null;
  } catch {
    return null;
  }
}

export function takeOAuthRole(): string | null {
  try {
    const v = localStorage.getItem(OAUTH_ROLE_KEY);
    localStorage.removeItem(OAUTH_ROLE_KEY);
    return v;
  } catch {
    return null;
  }
}

/** Begin the Google OAuth redirect. Rejects if Supabase won't start the flow.
 *  `role` is set when starting from the sign-up form, so a brand-new account
 *  knows whether it belongs to a host or a vendor. */
export async function startGoogleSignIn(next: string, role?: string | null): Promise<void> {
  rememberOAuthNext(next);
  try {
    if (role) localStorage.setItem(OAUTH_ROLE_KEY, role);
    else localStorage.removeItem(OAUTH_ROLE_KEY);
  } catch {
    /* storage disabled — a new vendor just lands on the default destination */
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: googleRedirectTo() },
  });
  if (error) throw error;
  // On success the browser is navigating to Google; nothing else to do.
}
