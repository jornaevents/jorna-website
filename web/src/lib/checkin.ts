"use client";

// "I'm at the venue", with the browser's location attached.
//
// The backend verifies the coordinates against the venue, so a check-in is a
// geolocation prompt before it's an API call — and the interesting part is what
// to say when the browser refuses. Lives here because both the vendor's
// bookings list and the vendor dashboard offer the action, and two copies of a
// permission flow drift.

import { checkInBooking } from "./jorna";

/** Thrown for the location half, so callers can tell it from an API failure. */
export class LocationError extends Error {}

/**
 * The browser's current position, or a LocationError with a message that
 * actually helps — in particular, one that doesn't tell someone to "allow"
 * something the browser has stopped offering to ask about. Exported so
 * VenueCheckIn.tsx (client-side, fans out across several bookings) and
 * check-in/page.tsx (the no-login token link) share this instead of each
 * keeping their own copy — which is exactly the drift this file's header
 * comment already warns about, and until now they still had.
 */
export function getLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new LocationError(
          "This browser can't share a location, so it can't verify you're at the venue.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) =>
        reject(
          new LocationError(
            // Most mobile browsers won't prompt again once permission is
            // denied — telling someone to "allow it" then does nothing
            // visible, since there's no prompt left to accept. Point at
            // the site settings screen instead, which is the only way back
            // once a browser has stopped asking.
            err.code === err.PERMISSION_DENIED
              ? "Location is blocked for this site. Check your browser's site settings (often behind the padlock or ⋮ menu next to the address bar) to allow it, then try again."
              : "Couldn't read your location. Make sure location services are on and try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

/** Check in at the venue for one booking. Rejects with LocationError or ApiError. */
export async function checkInAtVenue(bookingId: string): Promise<void> {
  const pos = await getLocation();
  await checkInBooking(bookingId, pos.coords.latitude, pos.coords.longitude);
}
