"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { clientLanding } from "@/lib/landing";
import { ApiError } from "@jorna/shared/lib/api";
import { supabase, startGoogleSignIn } from "@/lib/supabase";
import { EntryField, EntryShell, ErrorNote, primaryButton, textButton } from "@/components/entry/ui";
import { vendorSiteUrl } from "@/lib/vendorSite";
import { withTrailingSlash } from "@jorna/shared/lib/paths";

function GoogleMark() {
  // Google "G", inline so nothing is fetched over the network (the site's ethos).
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Sign-up here is for hosts. Vendors join and work on jornaevents.com (the
// jorna-vendor app); this page used to ask "Host or Vendor?" and send vendors
// into an onboarding that now lives there. See VendorAccountGate.

/**
 * Where a successful login is allowed to send someone.
 *
 * `next` comes straight off the URL, so a crafted link — mailed, messaged, or
 * just shared — can put anything there. Without this, a login that succeeds
 * for real would hand the browser off to whatever the link named, right after
 * the one moment a phishing page most wants to borrow credibility from.
 * Anything but a single leading slash (a bare path, no scheme, no host) is
 * rejected in favour of the same default an absent `next` already gets.
 *
 * Null means nothing asked for a page: the sign-in then picks one by whether
 * the client has started planning (clientLanding).
 */
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return null;
  }
  return raw;
}

function LoginInner() {
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  // Set when we've come back from Google as a brand-new identity that needs to
  // finish creating a Jorna account (the callback routes here with ?google=1).
  const isGoogleSignup = params.get("google") === "1";
  // ?mode=register opens the sign-up form — what a "Get started" entry point
  // promises. Completing a Google sign-up implies it too.
  //
  // Read from the URL on every render, not seeded into state once. The header
  // offers both doors at the same time — "Sign in" to /login, "Get started" to
  // /login?mode=register — and they are the same route, so moving between them
  // reconciles this component instead of remounting it. A useState initialiser
  // runs on the first render and never again, so the query string changed and
  // the form didn't: whichever door you came through was the only one that
  // worked, in both directions, for as long as you stayed on the page.
  const mode: "login" | "register" =
    isGoogleSignup || params.get("mode") === "register" ? "register" : "login";
  // Old "Become a vendor" links still carry ?role=vendor. They mean the
  // vendor site's sign-up, so that's where they go.
  const forVendor = params.get("role") === "vendor";
  // Signing in is one page for both sides now (jornaevents.com/app/login,
  // 2026-10-29): it sends each account to its own dashboard. Only sign-up and
  // finishing a Google sign-up stay here. A page this app wanted to come back
  // to rides along as a full site path, /client/… .
  const handOff = !forVendor && mode === "login";
  useEffect(() => {
    if (forVendor) {
      window.location.replace(vendorSiteUrl(`/login?${params.toString()}`));
    } else if (handOff) {
      const q = new URLSearchParams();
      if (next) q.set("next", `/client${withTrailingSlash(next)}`);
      window.location.replace(vendorSiteUrl(q.size ? `/login?${q.toString()}` : "/login"));
    }
  }, [forVendor, handOff, next, params]);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  // Register-only
  // Name, email and password: the backend derives a username and leaves age
  // and city for later (backend #154), as the vendor sign-up does.
  const [email, setEmail] = useState("");
  const [fName, setFName] = useState("");
  const [lName, setLName] = useState("");
  // Google-signup linkage (recovered from the persisted Supabase session)
  const [googleReady, setGoogleReady] = useState(!isGoogleSignup);
  const [googleUserId, setGoogleUserId] = useState<string | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);

  // When completing a Google sign-up, recover the held Supabase session to
  // prefill + lock the email and carry the proof-of-ownership token.
  useEffect(() => {
    if (!isGoogleSignup) return;
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (session?.user?.email) {
        setEmail(session.user.email);
        setGoogleUserId(session.user.id);
        setGoogleToken(session.access_token);
        setGoogleReady(true);
      } else {
        setError("Your Google session expired. Please choose Continue with Google again.");
      }
    });
  }, [isGoogleSignup]);

  /**
   * Flip between signing in and signing up, by changing the URL.
   *
   * The mode is the query string now, so this has to move the query string —
   * setting state would show one form at an address that names the other, and
   * the header's two buttons would go on disagreeing with the page. Every other
   * param is carried across, `next` above all: someone sent here from a booking
   * must still land back on it whichever door they end up using.
   *
   * replace, not push, so flipping back and forth doesn't bury the page they
   * came from under a stack of its own history.
   */
  function switchMode() {
    setError(null);
    const q = new URLSearchParams(params.toString());
    if (mode === "login") q.set("mode", "register");
    else q.delete("mode");
    const qs = q.toString();
    router.replace(qs ? `/login?${qs}` : "/login");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({
        email,
        password,
        f_name: fName,
        l_name: lName,
        ...(isGoogleSignup && googleUserId && googleToken
          ? { supabase_user_id: googleUserId, supabase_access_token: googleToken }
          : {}),
      });
      // The Jorna JWT is the session now; drop the Supabase one.
      if (isGoogleSignup) await supabase.auth.signOut();
      router.push(next ?? (await clientLanding()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    setGoogleBusy(true);
    try {
      await startGoogleSignIn(next ?? "", null);
    } catch {
      setGoogleBusy(false);
      setError("Couldn't start Google sign-in. Please try again.");
    }
  }

  if (forVendor || handOff) {
    return (
      <EntryShell>
        <p className="py-20 text-center text-[14px] text-(--e-muted)">Taking you to sign in…</p>
      </EntryShell>
    );
  }

  // Signing in is the shared page's (handOff above), so this is only ever
  // the sign-up form — laid out as the vendor sign-up there is.
  return (
    <EntryShell>
      <main className="grid flex-1 place-items-center px-3 pb-16 pt-6 sm:pt-10">
        <section className="w-full max-w-[500px] rounded-[20px] border border-(--e-line) bg-(--e-paper)/95 px-5 py-8 text-center shadow-[0_22px_60px_rgba(74,21,38,.1)] sm:px-9">
          <h1 className="e-display text-[32px] sm:text-[36px]">{isGoogleSignup ? "Finish signing up" : "Create your account"}</h1>
          <p className="mt-2 text-[14px] leading-normal text-(--e-muted)">
            {isGoogleSignup ? "A few details and your Google account is all set." : "A few details and you're planning."}
          </p>

          <form onSubmit={submit} className="mt-7 grid gap-4 text-left">
            <div className="grid gap-3 sm:grid-cols-2">
              <EntryField label="First name" htmlFor="reg-first">
                <input id="reg-first" className="e-input" autoComplete="given-name" value={fName} onChange={(e) => setFName(e.target.value)} required />
              </EntryField>
              <EntryField label="Last name" htmlFor="reg-last">
                <input id="reg-last" className="e-input" autoComplete="family-name" value={lName} onChange={(e) => setLName(e.target.value)} required />
              </EntryField>
            </div>
            <EntryField label="Email" htmlFor="reg-email" hint={isGoogleSignup ? "From your Google account." : undefined}>
              <input
                id="reg-email"
                className="e-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                // Locked to the Google account: the backend rejects a mismatch.
                readOnly={isGoogleSignup}
                required
              />
            </EntryField>
            <EntryField label="Password" htmlFor="reg-password" hint="At least 8 characters, with an uppercase letter, a lowercase letter, and a number.">
              <input
                id="reg-password"
                className="e-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </EntryField>
            {/* Google — offered when starting out, not mid-completion. */}
            {!isGoogleSignup ? (
              <button
                type="button"
                disabled={googleBusy}
                onClick={google}
                className="flex min-h-[46px] items-center justify-center gap-2.5 rounded-[10px] border border-(--e-field) bg-white text-[14px] font-bold text-[#4b4641] transition hover:border-[#baa985] disabled:opacity-60"
              >
                <GoogleMark />
                {googleBusy ? "Connecting…" : "Continue with Google"}
              </button>
            ) : null}

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            <button type="submit" disabled={busy || (isGoogleSignup && !googleReady)} className={`${primaryButton} mt-1 w-full`}>
              {busy ? "One moment…" : isGoogleSignup ? "Complete sign-up" : "Create account"}
            </button>
          </form>

          {!isGoogleSignup ? (
            <>
              <p className="mt-6 text-[14px] text-(--e-muted)">
                Already have an account?{" "}
                <button type="button" className={textButton} onClick={switchMode}>
                  Sign in
                </button>
              </p>
              <p className="mt-5 border-t border-(--e-line) pt-4 text-[13px] text-(--e-muted)">
                Offering services instead?{" "}
                <a href={vendorSiteUrl("/login?mode=register&role=vendor")} className={textButton}>
                  Sign up as a vendor
                </a>
              </p>
            </>
          ) : null}
        </section>
      </main>
    </EntryShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
