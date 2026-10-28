"use client";

// The event's address, collected as fields rather than as a sentence.
//
// The old control was a city autocomplete over lib/cities that accepted any
// free text, so "Chicagoo", "tbd" and "" were all equally valid answers and a
// vendor could be sent to any of them. These are the parts of a US address, the
// state is a picker so it can't be misspelt, and the zip is checked for shape.
//
// The backend has no address columns, so the caller composes these into the one
// `location` string it does have — see lib/address.
//
// Four of the five fields are facts about the fifth: a ZIP determines its city
// and state. lib/zips ships that table, so typing a ZIP fills them in and a ZIP
// that contradicts them says so — which is where the real mistakes are. The
// street line is the part people know by heart, and stays typed.

import { useRef, useState } from "react";
import {
  addressGaps,
  formatAddress,
  isValidZip,
  parseAddress,
  US_STATES,
  type Address,
} from "../lib/address";
import { loadZipIndex, zipDisagrees, type ZipIndex } from "../lib/zips";

const LABELS: Record<keyof Address, string> = {
  line1: "Street address",
  line2: "Apartment, suite, floor",
  city: "City",
  state: "State",
  zip: "ZIP code",
};

export function AddressFields({
  value,
  onChange,
  /** Shown under the zip when a booked venue supplied it. */
  zipHint,
  /** Fields to mark in red — pass the gaps only after a save is attempted. */
  showGaps = false,
}: {
  value: Address;
  onChange: (next: Address) => void;
  zipHint?: string | null;
  showGaps?: boolean;
}) {
  const gaps = showGaps ? addressGaps(value) : [];
  const bad = (field: keyof Address) => gaps.includes(field);

  // The ZIP table, fetched the first time somebody touches these fields —
  // never on page load, and never at all for a visitor who doesn't get here.
  const [zips, setZips] = useState<ZipIndex | null>(null);
  const asked = useRef(false);

  function warm() {
    if (asked.current) return;
    asked.current = true;
    void loadZipIndex().then(setZips);
  }

  // Once a whole ZIP is typed, the city and state are facts rather than
  // questions — fill them, but only into blanks. Overwriting what somebody
  // deliberately typed is how a form argues with you; the mismatch note below
  // handles that case instead, by offering rather than taking.
  function setZip(zip: string) {
    const place = zips?.place(zip);
    const fillable = place && !value.city.trim() && !value.state.trim();
    onChange(fillable ? { ...value, zip, city: place.city, state: place.state } : { ...value, zip });
  }

  const conflict = zipDisagrees(zips, value.zip, value.city, value.state);

  const field = (
    key: keyof Address,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">
        {LABELS[key]}
        {key === "line2" ? (
          <span className="font-normal text-ink-faint"> (optional)</span>
        ) : null}
      </span>
      <input
        {...extra}
        value={value[key]}
        onFocus={warm}
        onChange={(e) =>
          key === "zip" ? setZip(e.target.value) : onChange({ ...value, [key]: e.target.value })
        }
        aria-invalid={bad(key) || undefined}
        className={`w-full rounded-xl border bg-ground-2 px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 ${
          bad(key) ? "border-maroon dark:border-gold" : "border-card-edge"
        }`}
      />
    </label>
  );

  return (
    <div className="grid gap-3">
      {field("line1", { placeholder: "12 Maple Ave", autoComplete: "address-line1" })}
      {field("line2", { placeholder: "Suite 4", autoComplete: "address-line2" })}

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        {field("city", { placeholder: "Evanston", autoComplete: "address-level2" })}

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">State</span>
          <select
            value={value.state}
            onChange={(e) => onChange({ ...value, state: e.target.value })}
            autoComplete="address-level1"
            aria-invalid={bad("state") || undefined}
            className={`w-full rounded-xl border bg-ground-2 px-3 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 ${
              bad("state") ? "border-maroon dark:border-gold" : "border-card-edge"
            }`}
          >
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>
        </label>

        <div>
          {field("zip", {
            placeholder: "60201",
            inputMode: "numeric",
            autoComplete: "postal-code",
            maxLength: 10,
          })}
          {zipHint ? (
            <p className="mt-1 text-xs text-ink-faint">From your venue: {zipHint}</p>
          ) : value.zip && !isValidZip(value.zip) ? (
            <p className="mt-1 text-xs text-maroon dark:text-gold">
              Five digits, or ZIP+4.
            </p>
          ) : null}
        </div>
      </div>

      {/* The ZIP says one place and the fields say another. Which is the typo
          isn't knowable from here, so this offers rather than corrects — but it
          catches "60201, Chicago, IL" before a vendor drives to it. */}
      {conflict ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-gold/10 px-3 py-2 text-sm text-ink-soft">
          <span>
            {value.zip.trim().slice(0, 5)} is{" "}
            <strong className="font-semibold text-ink">
              {conflict.city}, {conflict.state}
            </strong>
            .
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...value, city: conflict.city, state: conflict.state })}
            className="font-semibold text-gold hover:underline"
          >
            Use that
          </button>
        </div>
      ) : null}

      {gaps.length > 0 ? (
        <p className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          Vendors travel to this address — it needs a street, a city, a state and a
          valid ZIP before anyone can be sent to it.
        </p>
      ) : null}

      {/* The ZIP table is GeoNames' work under CC BY 4.0, and a link is the
          attribution that licence asks for. Shown only once the data has
          actually been used. */}
      {zips ? (
        <p className="text-xs text-ink-faint">
          ZIP lookup by{" "}
          <a
            href="https://www.geonames.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink-soft"
          >
            GeoNames
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

/**
 * The same fields over a `location` string, for the places that store one —
 * contracts, booking links, venue listings, negotiated values. The fields are
 * held here and only their composed string goes out, so typing isn't fought by
 * a parse on every keystroke (a trailing space, a street with no number yet).
 * A value that changes from outside — a template applied, a draft reloaded —
 * is parsed afresh.
 */
export function AddressStringFields({
  value,
  onChange,
  zipHint,
  showGaps = false,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
  zipHint?: string | null;
  showGaps?: boolean;
}) {
  const incoming = value ?? "";
  const [addr, setAddr] = useState<Address>(() => parseAddress(incoming));
  const [sent, setSent] = useState(incoming);
  if (incoming !== sent) {
    setSent(incoming);
    setAddr(parseAddress(incoming));
  }
  return (
    <AddressFields
      value={addr}
      showGaps={showGaps}
      zipHint={zipHint}
      onChange={(next) => {
        const composed = formatAddress(next);
        setAddr(next);
        setSent(composed);
        onChange(composed);
      }}
    />
  );
}
