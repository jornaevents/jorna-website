"use client";

// Where the half-hour reminder lands (/check-in?t=…).
//
// Built for one moment: a vendor has parked, they have a van to unload, and
// they are holding a phone in one hand. So there is one button, it is large,
// and nothing else on the page competes with it. No sign-in — the token in the
// link is the credential, because a password screen here is a check-in that
// doesn't happen.
//
// What keeps that safe is that the token isn't enough. The backend measures the
// GPS fix against the venue before it records anything, which is the same rule
// the in-app button obeys. Somebody who intercepts the email gets a link that
// won't do anything until they drive to the wedding.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { getLocation, LocationError } from "@/lib/checkin";
import { checkInWithToken, getCheckInInvite, type CheckInInvite } from "@/lib/jorna";
import { Button, Card } from "@/components/ui";

function prettyWhen(invite: CheckInInvite): string | null {
  if (!invite.starts_at) return null;
  const d = new Date(invite.starts_at);
  if (Number.isNaN(d.getTime())) return null;
  // Rendered in the reader's own timezone, which for somebody standing at the
  // venue is the venue's.
  return d.toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-[min(460px,100%-2rem)] py-16 text-center">{children}</div>;
}

function CheckInInner() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";

  const [invite, setInvite] = useState<CheckInInvite | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getCheckInInvite(token)
      .then((data) => {
        if (cancelled) return;
        setInvite(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 401
            ? "This check-in link has expired. Sign in to the app to check in."
            : "Couldn't open this link. Check your connection and try again.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function checkIn() {
    setBusy(true);
    setError(null);
    try {
      const pos = await getLocation();
      const result = await checkInWithToken(token, pos.coords.latitude, pos.coords.longitude);
      setDone(result.message ?? "You're checked in.");
    } catch (err) {
      setError(
        err instanceof LocationError
          ? err.message
          : // The backend's own wording, which names the distance when that's
            // the problem — more use than anything this page could invent.
            err instanceof ApiError
            ? err.message
            : "Couldn't check you in — make sure you're at the venue.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell>
        <h1 className="serif text-2xl text-maroon dark:text-gold">Check-in link</h1>
        <p className="mt-3 text-ink-soft">
          This link is missing its code. Open the app to check in instead.
        </p>
      </Shell>
    );
  }

  if (loading) return <p className="py-20 text-center text-ink-soft">One moment…</p>;

  if (loadError || !invite) {
    return (
      <Shell>
        <h1 className="serif text-2xl text-maroon dark:text-gold">
          We couldn&apos;t open this
        </h1>
        <p className="mt-3 text-ink-soft">{loadError}</p>
      </Shell>
    );
  }

  if (done || invite.already_checked_in) {
    return (
      <Shell>
        <div
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-green/15 text-2xl text-green"
        >
          ✓
        </div>
        <h1 className="serif mt-4 text-3xl text-maroon dark:text-gold">
          {invite.already_checked_in && !done ? "Already checked in" : "You're checked in"}
        </h1>
        <p className="mt-3 text-ink-soft">
          Your client has been told you&apos;ve arrived. This also confirms the event went
          ahead — your payment is released once they confirm too.
        </p>
      </Shell>
    );
  }

  const when = prettyWhen(invite);

  return (
    <div className="mx-auto w-[min(460px,100%-2rem)] py-14">
      <div className="text-center">
        <p className="eyebrow">You&apos;re on</p>
        <h1 className="serif mt-2 text-4xl text-maroon dark:text-gold">Check in</h1>
      </div>

      <Card className="mt-8 p-5 text-center">
        {when ? <p className="text-ink">{when}</p> : null}
        {invite.location ? (
          <p className="mt-1 text-sm text-ink-soft">{invite.location}</p>
        ) : null}
      </Card>

      {error ? (
        <p className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <Button size="lg" className="w-full" disabled={busy} onClick={checkIn}>
          {busy ? "Checking you in…" : "I'm here"}
        </Button>
        <p className="mt-3 text-center text-xs text-ink-faint">
          Your phone will ask to share its location. It&apos;s how we confirm you&apos;re
          at the venue, and it isn&apos;t stored.
        </p>
      </div>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <CheckInInner />
    </Suspense>
  );
}
