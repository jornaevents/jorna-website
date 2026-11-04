"use client";

import { useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { requestPasswordReset } from "@/lib/jorna";
import { Button, Card, Field } from "@jorna/shared/components/ui";
import { signInUrl } from "@/lib/vendorSite";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-[min(440px,100%-2rem)] py-14">
      <h1 className="serif text-center text-3xl text-maroon dark:text-gold">
        Reset your password
      </h1>

      {sent ? (
        <Card className="mt-8 p-6 text-center">
          <p className="text-ink-soft">
            If that email is registered, a reset link is on its way. Open it on this
            device and you&apos;ll be able to set a new password.
          </p>
          <a href={signInUrl()} className="mt-5 inline-block text-sm font-semibold text-gold hover:underline">
            Back to sign in
          </a>
        </Card>
      ) : (
        <>
          <p className="mt-2 text-center text-ink-soft">
            Enter your email and we&apos;ll send you a link.
          </p>
          <Card className="mt-8 p-6">
            <form onSubmit={submit} className="grid gap-4">
              <Field
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error ? (
                <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </Card>
          <p className="mt-5 text-center text-sm text-ink-soft">
            <a href={signInUrl()} className="font-semibold text-gold hover:underline">
              Back to sign in
            </a>
          </p>
        </>
      )}
    </div>
  );
}
