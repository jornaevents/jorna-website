"use client";

// Where the reset email lands (WEB_APP_URL/reset-password?token=…). Reads the
// token from the query and lets the user set a new password.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { resetPassword } from "@/lib/jorna";
import { Button, Card, Field } from "@jorna/shared/components/ui";
import { signInUrl } from "@/lib/vendorSite";

function ResetInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => window.location.replace(signInUrl()), 1600);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "That link may have expired. Request a new one.",
      );
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto w-[min(440px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-2xl text-maroon dark:text-gold">Invalid reset link</h1>
        <p className="mt-3 text-ink-soft">This link is missing its token.</p>
        <Link
          href="/forgot-password"
          className="mt-5 inline-block text-sm font-semibold text-gold hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-[min(440px,100%-2rem)] py-14">
      <h1 className="serif text-center text-3xl text-maroon dark:text-gold">
        Set a new password
      </h1>
      {done ? (
        <Card className="mt-8 p-6 text-center">
          <p className="text-green">Password updated. Taking you to sign in…</p>
        </Card>
      ) : (
        <Card className="mt-8 p-6">
          <form onSubmit={submit} className="grid gap-4">
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters, with an uppercase letter, a lowercase letter, and a number."
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? (
              <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <ResetInner />
    </Suspense>
  );
}
