"use client";

// Where Google returns after OAuth (Supabase → this page with ?code=…).
// Completes the PKCE handshake, then trades the Supabase token for a Jorna
// session — creating the account if the identity is new, so "Continue with
// Google" is the entire sign-up. A new vendor goes on to build their storefront;
// everyone else lands where they were headed.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, takeOAuthNext, takeOAuthRole } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { googleRegister } from "@/lib/jorna";
import { ApiError } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { adoptSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard React StrictMode's double-invoke
    ran.current = true;

    (async () => {
      try {
        // Turn the ?code= into a Supabase session (detectSessionInUrl is off, so
        // we drive the exchange here).
        const code = new URLSearchParams(window.location.search).get("code");
        const oauthError = new URLSearchParams(window.location.search).get("error_description");
        if (oauthError) {
          setError(oauthError);
          return;
        }
        let session = (await supabase.auth.getSession()).data.session;
        if (!session && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = data.session;
        }
        if (!session) {
          setError("Google sign-in didn't complete. Please try again.");
          return;
        }

        // Exchange the Supabase token for a Jorna session, creating the account
        // if this Google identity is new. One tap is the whole sign-up: the token
        // carries the email, name and avatar, the username is derived, and the
        // rest of the profile is nullable and filled in later.
        const next = takeOAuthNext();
        const role = takeOAuthRole();

        const session_ = await googleRegister(session.access_token);

        if (session_.access_token && session_.refresh_token) {
          await adoptSession({
            access_token: session_.access_token,
            refresh_token: session_.refresh_token,
            token_type: session_.token_type || "bearer",
          });
          // Jorna's JWT is the session now — the Supabase one isn't needed.
          await supabase.auth.signOut();
          // Anyone who chose "Vendor" goes straight into guided setup — not
          // just a brand-new account. An existing client picking "Vendor" here
          // is just as much a vendor-to-be, and the wizard already knows how
          // to resume (and to refuse an account with live bookings), so it's
          // safe to send any of them there.
          const landing = role === "vendor" ? "/vendor-onboarding" : next;
          router.replace(landing);
          return;
        }

        // No session came back, which shouldn't happen — fall back to the form.
        router.replace(`/login?google=1&next=${encodeURIComponent(next)}`);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Google sign-in failed. Please try again.");
      }
    })();
  }, [adoptSession, router]);

  return (
    <div className="mx-auto w-[min(440px,100%-2rem)] py-24 text-center">
      {error ? (
        <>
          <h1 className="serif text-2xl text-maroon dark:text-gold">Couldn&apos;t sign in</h1>
          <p className="mt-3 text-ink-soft">{error}</p>
          <Link
            href="/login"
            className="mt-5 inline-block text-sm font-semibold text-gold hover:underline"
          >
            Back to sign in
          </Link>
        </>
      ) : (
        <p className="text-ink-soft">Finishing sign-in…</p>
      )}
    </div>
  );
}
