"use client";

// The client's "I'm at the venue" check-in, for the bundle view.
//
// Deliberately NOT an escrow action: the backend records client_checked_in_at
// and notifies the vendor, but only confirmBookingEvent (date-gated) releases
// money. The copy says so, because sitting next to "Confirm & release" it would
// otherwise read as the thing that pays the vendor.
//
// Check-in is per booking server-side, but a client arrives at *the event*, not
// at five separate bookings — so one action fans out across the live bookings so
// every vendor is told once.

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { checkInBooking } from "@/lib/jorna";
import { getLocation, LocationError } from "@/lib/checkin";
import { formatCheckInTime, type BundleBooking } from "@/lib/types";
import { hasLiveVenue, isDeadBooking as isDead } from "@/lib/planning";
import { Button, Card } from "@/components/ui";

export { hasLiveVenue };

/** The bookings worth telling "your client has arrived" — real engagements, not
 *  dead ones or requests a vendor hasn't accepted yet. */
function checkInTargets(bookings: BundleBooking[]): BundleBooking[] {
  return bookings.filter((b) => {
    if (isDead(b)) return false;
    const pay = b.payment_status ?? "unpaid";
    return (
      b.status === "approved" ||
      b.status === "payment_confirmed" ||
      pay === "paid" ||
      pay === "released"
    );
  });
}

export function VenueCheckIn({
  bookings,
  onCheckedIn,
}: {
  bookings: BundleBooking[];
  onCheckedIn: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = checkInTargets(bookings);
  const pending = targets.filter((b) => !b.client_checked_in_at);
  const alreadyIn = targets.find((b) => b.client_checked_in_at);

  // No venue anchor means the backend refuses the call — so don't offer it.
  if (!hasLiveVenue(bookings) || targets.length === 0) return null;

  if (pending.length === 0 && alreadyIn?.client_checked_in_at) {
    return (
      <Card className="mt-6 p-4">
        <p className="text-sm text-ink-soft">
          You checked in at the venue on{" "}
          {formatCheckInTime(alreadyIn.client_checked_in_at)}. Your vendors were
          notified.
        </p>
      </Card>
    );
  }

  async function checkIn() {
    setBusy(true);
    setError(null);
    let pos: GeolocationPosition;
    try {
      pos = await getLocation();
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof LocationError
          ? err.message
          : "Couldn't read your location. Make sure location services are on and try again.",
      );
      return;
    }
    const results = await Promise.allSettled(
      pending.map((b) =>
        checkInBooking(b.booking_id, pos.coords.latitude, pos.coords.longitude),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === results.length) {
      // Every call failed the same way (distance, or a vanished venue) —
      // surface the backend's own wording rather than inventing one.
      const first = (failed[0] as PromiseRejectedResult).reason;
      setError(
        first instanceof ApiError
          ? first.message
          : "Couldn't check you in — make sure you're at the venue.",
      );
    }
    setBusy(false);
    await onCheckedIn();
  }

  return (
    <Card className="mt-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="serif text-lg text-ink">At the venue?</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {/* Explicit {" "}: JSX strips the space at the line break after the
                expression, which shipped as "let your vendorsknow you've arrived". */}
            Check in to let your {pending.length === 1 ? "vendor" : "vendors"}{" "}
            know you&apos;ve arrived. This doesn&apos;t release any payment — you
            confirm that separately, after the event.
          </p>
        </div>
        <Button disabled={busy} onClick={checkIn}>
          {busy ? "Checking in…" : "Check in at the venue"}
        </Button>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
