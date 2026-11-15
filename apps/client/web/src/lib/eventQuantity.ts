// The client's event as typed into a "Your event" bar — guests, days, hours,
// performers — and what a rate becomes once multiplied by it. Shared by
// Explore (which sends it to /vendors/search) and Compare (which estimates
// locally with the same estimateTotal), and carried between the two in the
// URL so a guest count typed once follows the client to the comparison.

import { quantityKey, type Quantity } from "@jorna/shared/lib/pricing";
import type { PriceUnitKind } from "@/lib/types";

/** The bar's fields as typed — strings, so a half-typed value isn't lost. */
export interface EventInputs {
  guests: string;
  days: string;
  hours: string;
  performers: string;
}

const KEYS = ["guests", "days", "hours", "performers"] as const;

export function inputsFromParams(params: { get(name: string): string | null }): EventInputs {
  return {
    guests: params.get("guests") ?? "",
    days: params.get("days") ?? "",
    hours: params.get("hours") ?? "",
    performers: params.get("performers") ?? "",
  };
}

/** A typed quantity, or undefined until it's a usable one. The backend refuses
 *  out-of-range values outright, so they're held back here rather than turning
 *  the whole result list into an error while someone is mid-keystroke. */
function quantityValue(raw: string, max: number, whole = true): number | undefined {
  if (!raw.trim()) return undefined;
  const n = whole ? Math.round(Number(raw)) : Number(raw);
  return Number.isFinite(n) && n > 0 && n <= max ? n : undefined;
}

/** Caps match the backend's; hours stop at 24, the longest booking window. */
export function quantityFrom(inputs: EventInputs): Quantity {
  return {
    guests: quantityValue(inputs.guests, 5000),
    days: quantityValue(inputs.days, 60),
    hours: quantityValue(inputs.hours, 24, false),
    performers: quantityValue(inputs.performers, 100),
  };
}

/** "?guests=200&hours=6", or "" when nothing usable has been entered. */
export function quantityQuery(quantity: Quantity): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const n = quantity[key];
    if (n) params.set(key, String(n));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

const QUANTITY_NOUN: Record<Exclude<PriceUnitKind, "event">, [string, string]> = {
  person: ["guest", "guests"],
  day: ["day", "days"],
  hour: ["hour", "hours"],
  performer: ["performer", "performers"],
};

/** "200 guests" — the quantity a rate was multiplied by, or null if none was. */
export function quantityText(kind: PriceUnitKind, quantity?: Quantity): string | null {
  if (kind === "event") return null;
  const key = quantityKey(kind);
  const n = key ? quantity?.[key] : null;
  if (!n) return null;
  const [one, many] = QUANTITY_NOUN[kind];
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The field a unit still needs, for "Add guests above" — lower case, plural. */
export function quantityNoun(kind: PriceUnitKind): string | null {
  return kind === "event" ? null : QUANTITY_NOUN[kind][1];
}
