"use client";

// Where Google returns after OAuth (Supabase → this page with ?code=…).
// Completes the PKCE handshake, then trades the Supabase token for a Jorna
// session — creating the account if the identity is new, so "Continue with
// Google" is the entire sign-up. A new vendor goes on to build their storefront;
// everyone else lands where they were headed.
//
// Which side a new account is on comes from where Google was started. The
// vendor sign-up (and a vendor-side "Sign in") says "vendor". The shared
// sign-in page doesn't know, so a brand-new identity from there is asked once,
// "Planning an event, or a vendor?", before the account is made (backend #53):
// it's looked up first, which creates nothing, and registered with the answer.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, takeOAuthNext, takeOAuthRole, takeOAuthTerms } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { googleLookup, googleRegister, type GoogleLookupResponse } from "@/lib/jorna";
import { defaultLanding, goTo } from "@/lib/role";
import { VendorShellSkeleton } from "@/components/VendorSidebar";
import { primaryButton, secondaryButton } from "@/components/entry/ui";
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

function errorText(e: unknown): string {
  return e instanceof StepTimeout
    ? "Signing in is taking too long. Check your connection and try again."
    : e instanceof ApiError
      ? e.message
      : "Google sign-in failed. Please try again.";
}

/** What a new identity from the shared sign-in page needs to finish. */
interface Pending {
  token: string;
  acceptTerms: boolean;
  next: string | null;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { adoptSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [choosing, setChoosing] = useState(false);
  const ran = useRef(false);

  /** Take the Jorna session a Google call returned and go where it belongs. */
  async function finish(res: GoogleLookupResponse, next: string | null, toOnboarding: boolean) {
    if (!res.access_token || !res.refresh_token) {
      // No session came back, which shouldn't happen — fall back to the form.
      router.replace(next ? `/login?google=1&next=${encodeURIComponent(next)}` : "/login?google=1");
      return;
    }
    const me = await within(adoptSession({
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      token_type: res.token_type || "bearer",
    }));
    // Jorna's JWT is the session now — the Supabase one isn't needed.
    // Local only: dropping it needs no round trip, and waiting on one
    // here could only hold up a sign-in that has already succeeded.
    void supabase.auth.signOut({ scope: "local" }).catch(() => {});
    // A sign-up goes straight into guided setup — the wizard resumes, and
    // sends an already-set-up vendor on to the dashboard. A sign-in lands
    // where it was headed, else by account (defaultLanding: a vendor's
    // dashboard, onboarding for one not set up yet, or a client's home in
    // the client app — goTo).
    const landing = toOnboarding ? "/vendor-onboarding" : (next ?? (await within(defaultLanding(me))));
    goTo(router, landing, true);
  }

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

        const next = takeOAuthNext();
        const role = takeOAuthRole();
        const acceptTerms = takeOAuthTerms();

        if (role === "vendor") {
          // Started from the vendor side: a new account is a vendor's.
          const res = await within(googleRegister(session.access_token, acceptTerms, "vendor"));
          await finish(res, next, true);
          return;
        }

        // The shared sign-in page: an existing account signs straight in; a
        // new identity is asked which side it's on before anything is made.
        const found = await within(googleLookup(session.access_token));
        if (found.is_new_user) {
          setPending({ token: session.access_token, acceptTerms, next });
          return;
        }
        await finish(found, next, false);
      } catch (e) {
        setError(errorText(e));
      }
    })();
    // finish closes over router and adoptSession only, both stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptSession, router]);

  async function choose(side: "client" | "vendor") {
    if (!pending) return;
    setChoosing(true);
    try {
      const res = await within(googleRegister(pending.token, pending.acceptTerms, side));
      await finish(res, pending.next, side === "vendor");
    } catch (e) {
      setChoosing(false);
      setError(errorText(e));
    }
  }

  if (pending && !error) {
    return (
      <div className="mx-auto w-[min(440px,100%-2rem)] py-24 text-center">
        <h1 className="serif text-2xl text-maroon dark:text-gold">Welcome to Jorna</h1>
        <p className="mt-3 text-ink-soft">Are you planning an event, or a vendor?</p>
        <div className="mt-6 grid gap-3">
          <button type="button" className={`${primaryButton} w-full`} disabled={choosing} onClick={() => choose("client")}>
            I&apos;m planning an event
          </button>
          <button type="button" className={`${secondaryButton} w-full`} disabled={choosing} onClick={() => choose("vendor")}>
            I&apos;m a vendor
          </button>
        </div>
      </div>
    );
  }

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
        <>
          {/* A vendor (vendorishBoot) watches their dashboard load instead —
              over the site's header, which the dashboard doesn't have. */}
          <div className="fixed inset-0 z-[60] hidden overflow-hidden [html[data-vendorish]_&]:block">
            <VendorShellSkeleton />
          </div>
          <p className="text-ink-soft">Finishing sign-in…</p>
        </>
      )}
    </div>
  );
}
