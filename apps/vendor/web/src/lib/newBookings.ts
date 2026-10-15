// A booking the client signed that the vendor hasn't opened yet (backend
// DECISIONS #30). Signing turns a lead into a booking with nothing for the
// vendor to do, so the Bookings tab carries a badge until they open it.

import type { VendorBooking } from "./types";

/** Fired after a booking is marked seen, so the sidebar's badge drops
 *  straight away instead of on the next navigation. */
export const BOOKINGS_SEEN_EVENT = "jorna:bookings-seen";

/** Strictly null: a backend older than the field sends nothing, and every
 *  signed booking would otherwise read as new. */
export function isNewBooking(b: Pick<VendorBooking, "signed_at" | "vendor_seen_at" | "status">): boolean {
  return Boolean(b.signed_at) && b.vendor_seen_at === null && b.status !== "rejected";
}
