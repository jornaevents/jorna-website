// Which booking a price offer in a thread is about.
//
// An offer used to live only in its booking's own thread, so the thread's
// booking_id answered this. Once a booking's offers can land in the client's
// existing question thread (backend: open_booking_thread reuses it), the
// thread has no booking of its own — the offer carries its booking in `meta`
// instead. The thread is the fallback for offers sent before that.

export interface OfferTarget {
  bookingId: string | null;
  bundleId: string | null;
}

type OfferMetaRef = { booking_id?: unknown; bundle_id?: unknown } | null | undefined;
type ThreadRef = { booking_id?: string | null; bundle_id?: string | null } | null | undefined;

const id = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function offerTarget(meta: OfferMetaRef, thread: ThreadRef): OfferTarget {
  const bookingId = id(meta?.booking_id);
  if (!bookingId) return { bookingId: thread?.booking_id ?? null, bundleId: thread?.bundle_id ?? null };
  // The thread's plan is only this offer's plan when it's the same booking.
  const bundleId = id(meta?.bundle_id) ?? (thread?.booking_id === bookingId ? (thread?.bundle_id ?? null) : null);
  return { bookingId, bundleId };
}
