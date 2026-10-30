"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { clientLanding } from "@/lib/landing";
import { ApiError } from "@jorna/shared/lib/api";
import { supabase, startGoogleSignIn } from "@/lib/supabase";
import { Button, Card, Field } from "@jorna/shared/components/ui";
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
  const { login, register } = useAuth();
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

  // Shared
  const [identifier, setIdentifier] = useState("");
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
      if (mode === "login") {
        await login(identifier, password);
      } else {
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
      }
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

  const heading = isGoogleSignup
    ? "Finish signing up"
    : mode === "login"
      ? "Welcome back"
      : "Create your account";

  const subheading =
    mode === "login"
      ? "Sign in to build and book your celebration."
      : isGoogleSignup
        ? "A few details and your Google account is all set."
        : "A few details and you're planning.";

  const submitLabel = busy
    ? "One moment…"
    : isGoogleSignup
      ? "Complete sign-up"
      : mode === "login"
        ? "Sign in"
        : "Create account";

  if (forVendor || handOff) {
    return <p className="py-20 text-center text-ink-soft">Taking you to sign in…</p>;
  }

  return (
    <div className="mx-auto w-[min(460px,100%-2rem)] py-14">
      <h1 className="serif text-center text-4xl text-maroon dark:text-gold">{heading}</h1>
      <p className="mt-2 text-center text-ink-soft">{subheading}</p>

      <Card className="mt-8 p-6">
        {/* Google — offered on the normal login/register screens, not mid-completion. */}
        {!isGoogleSignup ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={googleBusy}
              onClick={google}
              className="w-full"
            >
              <GoogleMark />
              {googleBusy ? "Connecting…" : "Continue with Google"}
            </Button>
            {mode === "register" ? (
              <p className="mt-2 text-center text-xs text-ink-faint">
                That&apos;s the whole sign-up — no form to fill in.
              </p>
            ) : null}
            <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
              <span className="h-px flex-1 bg-card-edge" />
              or
              <span className="h-px flex-1 bg-card-edge" />
            </div>
          </>
        ) : null}

        <form onSubmit={submit} className="grid gap-4">
          {mode === "login" ? (
            <Field
              label="Email or username"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          ) : (
            <>
              <Field
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                // Locked to the Google account: the backend rejects a mismatch.
                readOnly={isGoogleSignup}
                hint={isGoogleSignup ? "From your Google account." : undefined}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="First name"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  required
                />
                <Field
                  label="Last name"
                  value={lName}
                  onChange={(e) => setLName(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <Field
            label="Password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            hint={
              mode === "register"
                ? "At least 8 characters, with an uppercase letter, a lowercase letter, and a number."
                : undefined
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {mode === "login" ? (
            <div className="-mt-2 text-right">
              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-gold underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={
              busy || (isGoogleSignup && !googleReady)
            }
            className="mt-1"
          >
            {submitLabel}
          </Button>
        </form>
      </Card>

      {!isGoogleSignup ? (
        <p className="mt-5 text-center text-sm text-ink-soft">
          {mode === "login" ? "New to Jorna? " : "Already have an account? "}
          <button
            type="button"
            className="font-semibold text-gold underline-offset-2 hover:underline"
            onClick={switchMode}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      ) : null}
      <p className="mt-3 text-center text-xs text-ink-faint">
        A vendor?{" "}
        <a
          href={vendorSiteUrl(mode === "login" ? "/login" : "/login?mode=register&role=vendor")}
          className="font-semibold text-gold underline-offset-2 hover:underline"
        >
          {mode === "login" ? "Sign in on jornaevents.com" : "Sign up on jornaevents.com"}
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <LoginInner />
    </Suspense>
  );
}
