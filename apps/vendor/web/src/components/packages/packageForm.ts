// The package form's pieces that don't need the component: how a package
// reads in the list, the pricing units, and the form's working shape (text
// fields while typing, parsed in ServicesManager's save()).

import type { ServiceInput } from "@/lib/jorna";
import { taxonomyLabel, type Taxonomy } from "@jorna/shared/lib/taxonomy";
import {
  categoryLabel,
  type AddOn,
  type PackageAttributeValue,
  type ServiceItem,
  type TaxonomyCategory,
} from "@/lib/types";

export function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

/** "6 hours" — included hours if set, else the listing's duration. */
export function coverage(s: ServiceItem): string {
  if (s.included_hours) return `${s.included_hours} hour${s.included_hours === 1 ? "" : "s"}`;
  if (s.duration_minutes) {
    const h = Math.round((s.duration_minutes / 60) * 10) / 10;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return "Flexible";
}

/** The speciality it's listed under, in words. */
export function bestFor(s: ServiceItem, categories: TaxonomyCategory[], taxonomy?: Taxonomy | null): string {
  if (s.service_key && taxonomy) return taxonomyLabel(taxonomy, s.service_key);
  const cat = categories.find((c) => c.value === s.category);
  const sub = cat?.subcategories?.find((x) => x.value === s.subcategory);
  return sub?.label ?? cat?.label ?? (s.category ? categoryLabel(s.subcategory || s.category) : "Any event");
}

// The rate's multiplier. "event" is a flat price — everything else needs a
// quantity from the client at booking time before it can be paid.
export const PRICE_UNITS = [
  { value: "event", label: "Flat price" },
  { value: "person", label: "Per person" },
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "performer", label: "Per performer" },
];

export const ADD_ON_UNITS: { value: AddOn["price_unit"]; label: string }[] = [
  { value: "event", label: "flat" },
  { value: "person", label: "per person" },
  { value: "hour", label: "per hour" },
];

/** An add-on row while it's being typed — price as text, same reason as
 *  FormState.price below. */
export type AddOnDraft = { id?: string; name: string; price: string; price_unit: AddOn["price_unit"] };

// Same as ServiceInput, but price is the raw text the vendor is typing, not
// a number — a native number input's own min/step validation fights a vendor
// trying to clear a pre-filled price and type a new one (it can snap back to
// "0" rather than let the field sit empty mid-edit). Plain text sidesteps
// that entirely; save() parses and validates it before this goes anywhere
// near the API.
//
// The other numeric fields are text for the same reason; terms are shown in
// the units a vendor thinks in (days, dollars) and converted in save().
export type FormState = Omit<
  ServiceInput,
  | "price"
  | "experience"
  | "included_hours"
  | "inclusions"
  | "add_ons"
  | "deposit_percent"
  | "cancellation_window_hours"
  | "overtime_rate_cents"
> & {
  price: string;
  included_hours: string;
  /** One inclusion per line. */
  inclusionsText: string;
  add_ons: AddOnDraft[];
  deposit_percent: string;
  cancellation_days: string;
  overtime_rate: string;
  /** The package's service key ("" until chosen) and its filters. */
  service_key: string;
  attributes: Record<string, PackageAttributeValue>;
};

export const blank: FormState = {
  name: "",
  price: "",
  // No default: the vendor picks. It used to start on "per hour" (iOS parity,
  // and the safer mistake), but a vendor typing a flat price could miss the
  // dropdown entirely and list an hourly rate by accident. Asking is safer
  // than either default.
  price_unit: "",
  description: "",
  negotiable: false,
  require_guest_count: false,
  require_performer_count: false,
  is_popular: false,
  status: "active",
  included_hours: "",
  inclusionsText: "",
  add_ons: [],
  deposit_percent: "",
  cancellation_days: "",
  overtime_rate: "",
  service_key: "",
  attributes: {},
};

/** The editable form for an existing package — also what Duplicate starts
 *  from. */
export function formFrom(s: ServiceItem): FormState {
  return {
    name: s.name,
    price: String(s.price),
    price_unit: s.price_unit ?? "event",
    category: s.category ?? "",
    subcategory: s.subcategory ?? "",
    description: s.description ?? "",
    negotiable: Boolean(s.negotiable),
    require_guest_count: Boolean(s.require_guest_count),
    require_performer_count: Boolean(s.require_performer_count),
    is_popular: Boolean(s.is_popular),
    location: s.location ?? "",
    venue_latitude: s.venue_latitude ?? null,
    venue_longitude: s.venue_longitude ?? null,
    status: s.status === "hidden" ? "hidden" : "active",
    included_hours: s.included_hours != null ? String(s.included_hours) : "",
    inclusionsText: (s.inclusions ?? []).join("\n"),
    add_ons: (s.add_ons ?? []).map((a) => ({ ...a, price: String(a.price) })),
    deposit_percent: s.deposit_percent != null ? String(s.deposit_percent) : "",
    cancellation_days:
      s.cancellation_window_hours != null ? String(Math.round(s.cancellation_window_hours / 24)) : "",
    overtime_rate: s.overtime_rate_cents != null ? String(s.overtime_rate_cents / 100) : "",
    service_key: s.service_key ?? "",
    attributes: s.attributes ?? {},
  };
}

export function hasCustomTerms(f: FormState): boolean {
  return Boolean(f.deposit_percent || f.cancellation_days || f.overtime_rate);
}
