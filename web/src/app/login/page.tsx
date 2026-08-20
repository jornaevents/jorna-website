"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { supabase, startGoogleSignIn } from "@/lib/supabase";
import { Button, Card, Field } from "@/components/ui";
import { CityCombobox, type Coords } from "@/components/CityCombobox";

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

// Which side of the marketplace someone is joining. Deliberately *not* a
// backend concept: /auth/register takes no role and the account created is
// identical either way — "is a vendor" is derived from having a vendor profile.
// The choice decides where we land them afterwards, and it puts selling in
// front of vendors at the same moment iOS asks the same question.
type Role = "host" | "vendor";

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "host", label: "Host", hint: "Plan a celebration and book a team." },
  { value: "vendor", label: "Vendor", hint: "List your packages and get booked." },
];

/**
 * Where a successful login is allowed to send someone.
 *
 * `next` comes straight off the URL, so a crafted link — mailed, messaged, or
 * just shared — can put anything there. Without this, a login that succeeds
 * for real would hand the browser off to whatever the link named, right after
 * the one moment a phishing page most wants to borrow credibility from.
 * Anything but a single leading slash (a bare path, no scheme, no host) is
 * rejected in favour of the same default an absent `next` already gets.
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/plan";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return "/plan";
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
  // No default: the choice is required, the way iOS's two signup cards are.
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  // Register-only
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fName, setFName] = useState("");
  const [lName, setLName] = useState("");
  const [ageStr, setAgeStr] = useState("");
  const [location, setLocation] = useState("");
  const [cityCoords, setCityCoords] = useState<Coords | null>(null);
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
          username,
          f_name: fName,
          l_name: lName,
          age: Number(ageStr) || 25,
          location,
          latitude: cityCoords?.lat ?? null,
          longitude: cityCoords?.lng ?? null,
          gender: "unspecified",
          language: "English",
          ...(isGoogleSignup && googleUserId && googleToken
            ? { supabase_user_id: googleUserId, supabase_access_token: googleToken }
            : {}),
        });
        // The Jorna JWT is the session now; drop the Supabase one.
        if (isGoogleSignup) await supabase.auth.signOut();
      }
      // A new vendor goes straight into guided setup — the web equivalent of
      // iOS routing "I am a Vendor" into VendorInfoView, so the account and
      // the storefront are one continuous flow.
      router.push(mode === "register" && role === "vendor" ? "/vendor-onboarding" : next);
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
      // The role only means something for a sign-up; a returning user's account
      // already knows what it is.
      await startGoogleSignIn(next, mode === "register" ? role : null);
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

  // Doubles as the prompt for the role choice: until one is picked the submit
  // button is disabled, so the subheading says what's missing rather than
  // leaving a dead button to puzzle over.
  const subheading =
    mode === "login"
      ? "Sign in to build and book your celebration."
      : role === null
        ? "First — how will you use Jorna?"
        : isGoogleSignup
          ? "A few details and your Google account is all set."
          : role === "vendor"
            ? "A few details and you're ready to list."
            : "A few details and you're planning.";

  const submitLabel = busy
    ? "One moment…"
    : isGoogleSignup
      ? "Complete sign-up"
      : mode === "login"
        ? "Sign in"
        : role === "vendor"
          ? "Create account & continue"
          : "Create account";

  return (
    <div className="mx-auto w-[min(460px,100%-2rem)] py-14">
      <h1 className="serif text-center text-4xl text-maroon dark:text-gold">{heading}</h1>
      <p className="mt-2 text-center text-ink-soft">{subheading}</p>

      <Card className="mt-8 p-6">
        {/* The role fork sits above Google, not inside the form: with one-tap
            sign-up, that button *is* the whole registration, so the choice has to
            be made before it's pressed. It rides across the OAuth round trip in
            localStorage (see lib/supabase) since there's no form to carry it. */}
        {mode === "register" ? (
          <div className="mb-5">
            <p className="mb-2.5 text-sm font-medium text-ink-soft">I&apos;m joining as</p>
            <div className="grid grid-cols-2 gap-2.5">
              {ROLES.map((r) => {
                const active = role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRole(r.value)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-gold bg-gold/12 ring-1 ring-gold/40"
                        : "border-card-edge bg-ground-2 hover:border-gold/50"
                    }`}
                  >
                    <span
                      className={`block text-sm font-semibold ${active ? "text-maroon dark:text-gold" : "text-ink"}`}
                    >
                      {r.label}
                    </span>
                    <span className="mt-0.5 block text-[0.7rem] text-ink-faint">{r.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Google — offered on the normal login/register screens, not mid-completion. */}
        {!isGoogleSignup ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={googleBusy || (mode === "register" && role === null)}
              onClick={google}
              className="w-full"
            >
              <GoogleMark />
              {googleBusy ? "Connecting…" : "Continue with Google"}
            </Button>
            {mode === "register" ? (
              <p className="mt-2 text-center text-xs text-ink-faint">
                {role === null
                  ? "Choose one above to continue."
                  : "That's the whole sign-up — no form to fill in."}
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
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Username"
                  // Mirrors the backend's rule (3–30 of [A-Za-z0-9_]) so a space
                  // or a dot is caught here instead of coming back as a 422.
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_]{3,30}"
                  title="3–30 characters: letters, digits, and underscores only."
                  hint="Letters, digits, and underscores."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <Field
                  label="Age"
                  type="number"
                  min={13}
                  max={120}
                  value={ageStr}
                  onChange={(e) => setAgeStr(e.target.value)}
                  required
                />
              </div>
              <CityCombobox
                label="City & state"
                placeholder="Start typing a city…"
                value={location}
                // The picker has always reported coordinates for a chosen city
                // and this dropped them. They're what places a vendor on the
                // map; without them a vendor is findable by nobody searching a
                // location. Null for free text, which is honest — we don't know
                // where "chicagoo" is.
                onChange={(v, c) => {
                  setLocation(v);
                  setCityCoords(c);
                }}
                required
              />
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
              busy || (isGoogleSignup && !googleReady) || (mode === "register" && role === null)
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
