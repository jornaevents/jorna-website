"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { useAuth } from "@/lib/auth";
import { clientLanding, safeNext } from "@/lib/landing";
import { sendEmailCode, updateMe, verifyEmailCode } from "@/lib/jorna";
import { EntryField, EntryShell, ErrorNote, primaryButton, textButton } from "@/components/entry/ui";

// Right after a client signs up with a password: a 6-digit code to their
// email proves the address is theirs (backend DECISIONS #44). Google sign-ups
// skip this, since Google has checked the address. `next` carries on to
// wherever the sign-up was headed.

type Sent = { sent_to: string; expires_in_minutes: number };

function VerifyEmailInner() {
  const { user, loading, setUser } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  // The first code goes out on arrival, once per account — not again on a
  // re-render or React's development double effect.
  const sentFor = useRef<string | null>(null);

  const goOn = useCallback(async () => {
    router.replace(next ?? (await clientLanding()));
  }, [next, router]);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const state = await sendEmailCode();
      if (state.email_verified) await goOn();
      else setSent({ sent_to: state.sent_to, expires_in_minutes: state.expires_in_minutes });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send the code. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }, [goOn]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const back = next ? `/verify-email?next=${encodeURIComponent(next)}` : "/verify-email";
      router.replace(`/login?next=${encodeURIComponent(back)}`);
      return;
    }
    if (user.email_verified) {
      void goOn();
      return;
    }
    if (sentFor.current === user.user_id) return;
    sentFor.current = user.user_id;
    void send();
  }, [loading, user, next, router, goOn, send]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (code.length !== 6) {
      setError("Enter the 6-digit code from the email");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyEmailCode(code);
      setUser({ ...user, email_verified: true });
      await goOn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check the code. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateMe({ email });
      setUser(updated);
      setChanging(false);
      setCode("");
      setSent(null);
      await send();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change your email. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || user.email_verified) {
    return (
      <EntryShell>
        <p className="py-20 text-center text-[14px] text-(--e-muted)">One moment…</p>
      </EntryShell>
    );
  }

  return (
    <EntryShell>
      <main className="grid flex-1 place-items-center px-3 pb-16 pt-6 sm:pt-10">
        <section className="w-full max-w-[460px] rounded-[20px] border border-(--e-line) bg-(--e-paper)/95 px-5 py-8 text-center shadow-[0_22px_60px_rgba(74,21,38,.1)] sm:px-9">
          <h1 className="e-display text-[32px] sm:text-[36px]">Check your email</h1>
          <p className="mt-2 text-[14px] leading-normal text-(--e-muted)">
            {sent
              ? `We sent a 6-digit code to ${sent.sent_to}. It works for ${sent.expires_in_minutes} minutes.`
              : sending
                ? "Sending you a code…"
                : "We'll email you a code to confirm the address is yours."}
          </p>

          {changing ? (
            <form onSubmit={changeEmail} className="mt-7 grid gap-4 text-left">
              <EntryField label="Your email" htmlFor="verify-new-email">
                <input
                  id="verify-new-email"
                  className="e-input"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </EntryField>
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
                {busy ? "One moment…" : "Send the code there"}
              </button>
              <button type="button" className={textButton} onClick={() => { setChanging(false); setError(null); }}>
                Keep {user.email}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-7 grid gap-4 text-left">
              <EntryField label="6-digit code" htmlFor="verify-code">
                <input
                  id="verify-code"
                  className="e-input text-center text-[20px] tracking-[0.3em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </EntryField>
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              <button type="submit" disabled={busy || sending} className={`${primaryButton} w-full`}>
                {busy ? "Checking…" : "Confirm email"}
              </button>
            </form>
          )}

          {!changing ? (
            <div className="mt-6 grid gap-2 text-[14px] text-(--e-muted)">
              <p>
                Didn&apos;t get it?{" "}
                <button type="button" className={textButton} disabled={sending} onClick={() => void send()}>
                  {sending ? "Sending…" : "Send a new code"}
                </button>
              </p>
              <p>
                Wrong email?{" "}
                <button
                  type="button"
                  className={textButton}
                  onClick={() => { setNewEmail(user.email); setChanging(true); setError(null); }}
                >
                  Change it
                </button>
              </p>
            </div>
          ) : null}
        </section>
      </main>
    </EntryShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
