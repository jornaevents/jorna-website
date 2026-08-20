"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { createBooking, listServices, removeBookingFromBundle } from "@/lib/jorna";
import {
  categoryLabel,
  priceUnitKind,
  priceUnitLabel,
  type BundleBooking,
  type ServiceItem,
} from "@/lib/types";
import { Button, Card } from "./ui";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Swap one booked service for another in the same slot.
 *
 * There's no swap endpoint — a swap is "book the replacement into the same slot
 * (date, time, location, quantity, bundle), then remove the original". The
 * quantity has to come along or the replacement can't be priced.
 */
export function ServiceSwapPanel({
  booking,
  bundleId,
  eventName,
  onClose,
  onSwapped,
}: {
  booking: BundleBooking;
  bundleId: string;
  eventName: string;
  onClose: () => void;
  onSwapped: () => void;
}) {
  const [candidates, setCandidates] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Narrow by subcategory when the slot has one, so a DJ slot never lists a
    // dhol player (both are music_entertainment).
    listServices({
      category: booking.service_category ?? undefined,
      subcategory: booking.service_subcategory ?? undefined,
      limit: 50,
    })
      .then((res) => {
        if (cancelled) return;
        // Drop the service already in this slot — re-booking it would hit the
        // duplicate guard rather than swap anything.
        setCandidates(
          res.items.filter(
            (s) =>
              !(s.vendor_id === booking.vendor_id && s.name === booking.service_name),
          ),
        );
      })
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Couldn't load alternatives."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [booking]);

  async function swapTo(service: ServiceItem) {
    setBusyId(service.service_id);
    setError(null);
    try {
      const res = await createBooking({
        service_id: service.service_id,
        event_name: eventName,
        date_iso: booking.date_iso ?? "",
        date_end: booking.date_end ?? null,
        time_start: booking.time_start ?? "",
        time_end: booking.time_end ?? "",
        location: booking.location ?? "",
        // Carry the quantity across, or a rate-priced replacement can't be paid.
        guest_count: booking.guest_count ?? null,
        venue_latitude: service.venue_latitude ?? null,
        venue_longitude: service.venue_longitude ?? null,
        bundle_id: bundleId,
      });

      // The create endpoint is idempotent: asking for a slot that already
      // exists returns that same booking. If that happened, removing the
      // "old" booking would delete the very one we just got back.
      if (res.booking_id === booking.booking_id) {
        setError("That's already the package booked for this slot.");
        setBusyId(null);
        return;
      }

      await removeBookingFromBundle(bundleId, booking.booking_id);
      onSwapped();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't swap the package.");
      setBusyId(null);
    }
  }

  const slot = booking.service_subcategory || booking.service_category;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-b-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line-soft bg-card p-4">
          <div>
            <h2 className="serif text-xl text-ink">Swap this package</h2>
            <p className="mt-0.5 text-xs text-ink-faint">
              {slot ? categoryLabel(slot) : "Same slot"} · keeps your date, time,
              and guest count
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-ink-faint hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <p className="mb-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="py-8 text-center text-ink-soft">Loading alternatives…</p>
          ) : candidates.length === 0 ? (
            <p className="py-8 text-center text-ink-soft">
              No other {slot ? categoryLabel(slot) : "packages"} available right now.
            </p>
          ) : (
            <div className="grid gap-2">
              {candidates.map((s) => {
                const unit = priceUnitLabel(s.price_unit);
                // Warn when the replacement is priced by a quantity this booking
                // doesn't have — it would land unpayable.
                const kind = priceUnitKind(s.price_unit);
                const missingQty =
                  (kind === "person" && !booking.guest_count) ||
                  (kind === "day" && !booking.date_end && !booking.date_iso);
                return (
                  <div
                    key={s.service_id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-card-edge bg-panel p-3"
                  >
                    <div className="min-w-0">
                      {/* A new tab on purpose: this picker is a modal over the
                          bundle, and navigating in place would close it and
                          lose the swap the client came here to make. */}
                      <a
                        href={`/service?id=${s.service_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-semibold text-ink transition hover:text-maroon dark:hover:text-gold"
                      >
                        {s.name}
                      </a>
                      <p className="truncate text-xs text-ink-faint">
                        {s.vendor_name}
                        {/* This list compares listings, so the listing's own
                            rating is the one that answers the question. Fall
                            back to the vendor's only when this listing has no
                            reviews of its own, and say which it is — an
                            unlabelled star that silently switches between the
                            two is worse than either. */}
                        {s.num_reviews && s.rating
                          ? ` · ★ ${s.rating.toFixed(1)} (${s.num_reviews})`
                          : s.vendor_rating
                            ? ` · vendor ★ ${s.vendor_rating.toFixed(1)}`
                            : ""}
                      </p>
                      {missingQty ? (
                        <p className="mt-1 text-xs text-gold">
                          Priced {unit} — you&apos;ll need to add that before paying.
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-ink">{money(s.price)}</p>
                      {unit ? <p className="text-[0.65rem] text-ink-faint">{unit}</p> : null}
                      <Button
                        size="md"
                        className="mt-1"
                        disabled={busyId !== null}
                        onClick={() => swapTo(s)}
                      >
                        {busyId === s.service_id ? "Swapping…" : "Pick"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
