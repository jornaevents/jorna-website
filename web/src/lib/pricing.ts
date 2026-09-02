/**
 * What a service costs, and what quantity that depends on.
 *
 * One writer. The booking form worked this out in a closure of its own, and the
 * service page needs the same arithmetic to show an estimate — a second copy is
 * how the send gate and the pricer came to disagree about what "per person"
 * meant, which put a booking in front of a vendor that nobody could pay for.
 *
 * This mirrors `estimate_amount_cents` in the backend's booking_service, which
 * is the authority: the server recomputes before charging and its answer is the
 * one that counts. Anything here is a preview of that number.
 */
import { priceUnitKind, type PriceUnitKind } from "./types";

/** The quantities a rate can multiply by. Flat-rate services use none of them. */
export interface Quantity {
  guests?: number | null;
  /** Whole days, end date inclusive — a one-day event is 1, not 0. */
  days?: number | null;
  hours?: number | null;
  /** How many performers a group is asked to provide (per-performer pricing). */
  performers?: number | null;
}

/**
 * What the page offers when nobody has said otherwise.
 *
 * A neutral starting point, not a guess about this celebration: the estimate
 * next to it always names the quantity it used, so a number that isn't theirs
 * is visibly not theirs.
 *
 * Only the service page's estimator uses these. The booking form no longer
 * defaults its time window — a defaulted one was indistinguishable from an
 * answered one — so it simply shows no estimate until the hours are given,
 * which is the honest answer to "what will this cost".
 */
export const DEFAULT_QUANTITY: Required<Quantity> = {
  guests: 150,
  days: 1,
  hours: 6,
  performers: 4,
};

/** Sane bounds for the estimator's steppers. Hours cap at 24 because the
 *  backend refuses a window longer than a day. */
export const QUANTITY_LIMITS: Record<
  Exclude<PriceUnitKind, "event">,
  { min: number; max: number; step: number }
> = {
  person: { min: 1, max: 2000, step: 10 },
  day: { min: 1, max: 30, step: 1 },
  hour: { min: 1, max: 24, step: 1 },
  performer: { min: 1, max: 50, step: 1 },
};

/** Which quantity a unit multiplies by, or null when the price is already a total. */
export function quantityKey(kind: PriceUnitKind): keyof Quantity | null {
  if (kind === "person") return "guests";
  if (kind === "day") return "days";
  if (kind === "hour") return "hours";
  if (kind === "performer") return "performers";
  return null;
}

/**
 * Rate x quantity, or null when the quantity isn't known.
 *
 * Null is not zero and must not be rendered as a price — it means the total
 * cannot be worked out yet, which is exactly the state the backend refuses to
 * let a booking reach a vendor in.
 *
 * A flat (`event`) or unpriced service returns its price unchanged: there is no
 * quantity, and the rate is already the total.
 */
export function estimateTotal(
  service: { price?: number | null; price_unit?: string | null } | null | undefined,
  quantity: Quantity = {},
): number | null {
  if (!service) return null;
  const rate = service.price ?? 0;
  const kind = priceUnitKind(service.price_unit);

  // Matches the backend, which bails on a non-positive rate before it multiplies.
  if (rate <= 0) return kind === "event" ? rate : null;

  if (kind === "person") {
    const g = quantity.guests ?? 0;
    return g > 0 ? rate * g : null;
  }
  if (kind === "day") {
    const d = quantity.days ?? 0;
    return d > 0 ? rate * d : null;
  }
  if (kind === "hour") {
    const h = quantity.hours ?? 0;
    // The backend rejects a window longer than 24h rather than charging for it.
    return h > 0 && h <= 24 ? rate * h : null;
  }
  if (kind === "performer") {
    const p = quantity.performers ?? 0;
    return p > 0 ? rate * p : null;
  }
  return rate;
}

/** Whole days between two ISO dates, end inclusive — the backend's day count. */
export function daysBetweenInclusive(
  dateIso?: string | null,
  dateEnd?: string | null,
): number | null {
  if (!dateIso) return null;
  const start = Date.parse(`${dateIso}T00:00:00Z`);
  const end = Date.parse(`${dateEnd || dateIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86400000) + 1;
}

/**
 * Hours in a clock window, crossing midnight the way the backend does
 * (8 PM – 1 AM is five hours, not minus nineteen).
 */
export function hoursBetween(
  timeStart?: string | null,
  timeEnd?: string | null,
): number | null {
  if (!timeStart || !timeEnd) return null;
  const [sh, sm] = timeStart.split(":").map(Number);
  const [eh, em] = timeEnd.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let hours = eh + em / 60 - (sh + sm / 60);
  if (hours <= 0) hours += 24;
  return hours > 0 && hours <= 24 ? hours : null;
}

/**
 * True when an end time at or before the start time is being read as "the
 * next day" rather than as a mistake — the same branch `hoursBetween` takes
 * silently. Lets a caller warn before treating, say, 8 PM–12 PM as an
 * 18-hour overnight booking instead of a fumbled "midnight."
 */
export function crossesMidnight(
  timeStart?: string | null,
  timeEnd?: string | null,
): boolean {
  if (!timeStart || !timeEnd) return false;
  const [sh, sm] = timeStart.split(":").map(Number);
  const [eh, em] = timeEnd.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  return eh + em / 60 - (sh + sm / 60) <= 0;
}

/** "150 guests" / "6 hours" / "3 days" — names the quantity an estimate used, so
 *  a total is never shown without saying what it assumed. */
export function quantityPhrase(kind: PriceUnitKind, quantity: Quantity): string | null {
  if (kind === "person") {
    const g = quantity.guests ?? 0;
    return `${g.toLocaleString()} ${g === 1 ? "guest" : "guests"}`;
  }
  if (kind === "day") {
    const d = quantity.days ?? 0;
    return `${d} ${d === 1 ? "day" : "days"}`;
  }
  if (kind === "hour") {
    const h = quantity.hours ?? 0;
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  if (kind === "performer") {
    const p = quantity.performers ?? 0;
    return `${p.toLocaleString()} ${p === 1 ? "performer" : "performers"}`;
  }
  return null;
}

/** The word for what still has to be settled before this total is real. */
export function settledBy(kind: PriceUnitKind): string | null {
  if (kind === "person") return "confirmed headcount";
  if (kind === "day") return "confirmed dates";
  if (kind === "hour") return "confirmed start and end times";
  if (kind === "performer") return "confirmed performer count";
  return null;
}
