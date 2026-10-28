"use client";

// A real address, in a backend that only stores a string.
//
// `location` is a single free-text field on both events and bookings — there is
// no line1/city/state/zip anywhere in the API. So the pieces are collected
// separately, composed into one canonical string on the way out, and parsed
// back out of it on the way in. The round trip is lossless for anything this
// app wrote; for a value typed before this existed (or by iOS, which still
// writes free text) the parser recovers what it can and leaves the rest in
// line 1, which is the honest place for text it can't identify.
//
// Only the event's address is collected this way. A booking inherits its
// location from the event or, for a venue, from the venue's own listing.

/** The 50 states plus DC, for a picker that can't be typo'd. */
export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const STATE_CODES = new Set(US_STATES.map((s) => s.code));

export interface Address {
  line1: string;
  line2: string;
  city: string;
  /** Two-letter code, or "" when unset. Always from US_STATES. */
  state: string;
  /** "60601" or "60601-1234". */
  zip: string;
}

export const EMPTY_ADDRESS: Address = { line1: "", line2: "", city: "", state: "", zip: "" };

/** ZIP or ZIP+4, which is the whole of what a US postal code can be. */
export function isValidZip(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

/**
 * What's still missing, as field keys. An address is complete enough to book
 * against when this is empty — line 2 is genuinely optional.
 */
export function addressGaps(a: Address): (keyof Address)[] {
  const gaps: (keyof Address)[] = [];
  if (!a.line1.trim()) gaps.push("line1");
  if (!a.city.trim()) gaps.push("city");
  if (!STATE_CODES.has(a.state)) gaps.push("state");
  if (!isValidZip(a.zip)) gaps.push("zip");
  return gaps;
}

export function isCompleteAddress(a: Address): boolean {
  return addressGaps(a).length === 0;
}

/** The canonical string: "12 Maple Ave, Suite 4, Evanston, IL 60201". */
export function formatAddress(a: Address): string {
  const head = [a.line1.trim(), a.line2.trim(), a.city.trim()].filter(Boolean).join(", ");
  const tail = [a.state.trim(), a.zip.trim()].filter(Boolean).join(" ");
  return [head, tail].filter(Boolean).join(", ");
}

/** Short form for a heading — "Evanston, IL". Falls back to whatever there is. */
export function shortAddress(a: Address): string {
  const parts = [a.city.trim(), a.state.trim()].filter(Boolean);
  return parts.length ? parts.join(", ") : a.line1.trim();
}

/**
 * Read a stored string back into fields.
 *
 * Recognises what formatAddress writes, and does its best with everything else:
 * "Chicago, IL" — which is what the old city picker stored, and what iOS still
 * writes — comes back as city + state with no street, rather than as nothing.
 * Anything unrecognised lands in line 1 so it's never silently dropped.
 */
const UNIT = /^(apt|apartment|suite|ste|unit|floor|fl|room|rm|bldg|building|#)\b|^#\s*\d/i;

export function parseAddress(raw?: string | null): Address {
  const text = (raw ?? "").trim();
  if (!text) return { ...EMPTY_ADDRESS };

  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  const out: Address = { ...EMPTY_ADDRESS };

  // The tail may be "IL 60601", "IL", or "60601" — take whichever it is.
  const last = parts[parts.length - 1] ?? "";
  const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (stateZip && STATE_CODES.has(stateZip[1].toUpperCase())) {
    out.state = stateZip[1].toUpperCase();
    out.zip = stateZip[2];
    parts.pop();
  } else if (/^\d{5}(-\d{4})?$/.test(last)) {
    out.zip = last;
    parts.pop();
    const maybeState = parts[parts.length - 1];
    if (maybeState && STATE_CODES.has(maybeState.toUpperCase())) {
      out.state = maybeState.toUpperCase();
      parts.pop();
    }
  } else if (last.length === 2 && STATE_CODES.has(last.toUpperCase())) {
    out.state = last.toUpperCase();
    parts.pop();
  }

  if (parts.length > 0) out.city = parts.pop() as string;
  // Line 2 is a unit — "Suite 4", "Apt 2B", "Floor 3" — and only that. Any
  // other part before the city belongs with the street: "Royal Albert's
  // Palace, 1050 King Georges Post Rd" is a venue and its street, and splitting
  // them put the street in "Apartment, suite, floor" (web #164).
  if (parts.length > 1 && UNIT.test(parts[parts.length - 1])) out.line2 = parts.pop() as string;
  if (parts.length > 0) out.line1 = parts.join(", ");

  // A lone token with no state or zip beside it could be either half-finished
  // thought: a street somebody has started typing, or a city the bundle builder
  // was given as a location. A street number tells them apart — "12 Maple Ave"
  // is an address in progress, "Chicago" is a place — and getting it wrong puts
  // a city on the line vendors read as the street they're driving to.
  if (!out.line1 && !out.state && !out.zip && out.city && !text.includes(",")) {
    if (/^\d/.test(out.city)) {
      out.line1 = out.city;
      out.city = "";
    }
  }
  return out;
}

/** Whether a stored string already carries a full address. */
export function isCompleteLocation(raw?: string | null): boolean {
  return isCompleteAddress(parseAddress(raw));
}

/**
 * The zip a booked venue implies, so the event doesn't have to be told twice.
 * Returns null when no venue location parses to one.
 */
export function zipFromVenue(venueLocations: (string | null | undefined)[]): string | null {
  for (const loc of venueLocations) {
    const parsed = parseAddress(loc);
    if (isValidZip(parsed.zip)) return parsed.zip;
  }
  return null;
}

/** The whole address a booked venue implies — used to prefill, never to overwrite. */
export function addressFromVenue(
  venueLocations: (string | null | undefined)[],
): Address | null {
  for (const loc of venueLocations) {
    const parsed = parseAddress(loc);
    if (isValidZip(parsed.zip) || parsed.city) return parsed;
  }
  return null;
}

/**
 * Why a venue string can't go into a contract or booking yet, or null when it
 * can. Blank is allowed — "to be confirmed" is a real answer — but a partial
 * address isn't: a vendor can't drive to "Chicago".
 */
export function locationProblem(raw?: string | null): string | null {
  const text = (raw ?? "").trim();
  if (!text || text === "TBD") return null;
  return isCompleteLocation(text)
    ? null
    : "The venue needs a full address — street, city, state and ZIP.";
}
