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
import { defaultLanding, goTo } from "@/lib/role";
import { ApiError } from "@jorna/shared/lib/api";

// Every step below is a network call, and none has a timeout of its own: one
// that never answered used to leave "Finishing sign-in…" up forever with no
// way out. Long enough for a cold staging backend.
const STEP_TIMEOUT_MS = 20_000;

class StepTimeout extends Error {}

function within<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new StepTimeout()), STEP_TIMEOUT_MS),
    ),
  ]);
}

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
        let session = (await within(supabase.auth.getSession())).data.session;
        if (!session && code) {
          const { data, error } = await within(supabase.auth.exchangeCodeForSession(code));
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

        const session_ = await within(googleRegister(session.access_token));

        if (session_.access_token && session_.refresh_token) {
          await within(adoptSession({
            access_token: session_.access_token,
            refresh_token: session_.refresh_token,
            token_type: session_.token_type || "bearer",
          }));
          // Jorna's JWT is the session now — the Supabase one isn't needed.
          // Local only: dropping it needs no round trip, and waiting on one
          // here could only hold up a sign-in that has already succeeded.
          void supabase.auth.signOut({ scope: "local" }).catch(() => {});
          // A sign-up goes straight into guided setup — the wizard resumes,
          // and sends an already-set-up vendor on to the dashboard. A sign-in
          // lands where it was headed, else by account (defaultLanding: a
          // vendor's dashboard, or a client's in the client app — goTo).
          const landing =
            role === "vendor" ? "/vendor-onboarding" : (next ?? (await within(defaultLanding())));
          goTo(router, landing, true);
          return;
        }

        // No session came back, which shouldn't happen — fall back to the form.
        router.replace(next ? `/login?google=1&next=${encodeURIComponent(next)}` : "/login?google=1");
      } catch (e) {
        setError(
          e instanceof StepTimeout
            ? "Signing in is taking too long. Check your connection and try again."
            : e instanceof ApiError
              ? e.message
              : "Google sign-in failed. Please try again.",
        );
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
            Try again
          </Link>
        </>
      ) : (
        <p className="text-ink-soft">Finishing sign-in…</p>
      )}
    </div>
  );
}
