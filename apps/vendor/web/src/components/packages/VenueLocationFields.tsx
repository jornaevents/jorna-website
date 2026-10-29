"use client";

import { AddressStringFields } from "@jorna/shared/components/AddressFields";
import type { Dispatch, SetStateAction } from "react";
import { Button, Field } from "@jorna/shared/components/ui";
import type { FormState } from "./packageForm";

/** Where a venue stands. Required for venues: its pin is what vendor
 *  check-in is measured against. */
export function VenueLocationFields({
  form,
  setForm,
  locating,
  matched,
  onLocate,
  onUseMyLocation,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  locating: boolean;
  /** The address as the Census matched it, after a successful pin. */
  matched: string | null;
  onLocate: () => void;
  onUseMyLocation: () => void;
}) {
  return (
    <div className="rounded-xl bg-panel p-4">
      <p className="text-sm font-medium text-ink">Where is it?</p>
      <p className="mt-1 text-xs text-ink-faint">
        A venue anchors the whole event — its map pin is what vendor
        check-in is measured against, so it&apos;s required.
      </p>
      <div className="mt-3 grid gap-3">
        <AddressStringFields
          value={form.location}
          onChange={(location) => setForm((f) => ({ ...f, location }))}
        />
        {/* The pin comes from the address lookup below; the raw
            numbers are only for fixing a pin that landed on the
            wrong door. */}
        <details className="rounded-lg border border-line-soft px-3 py-2">
          <summary className="cursor-pointer text-xs text-ink-soft">
            {form.venue_latitude != null && form.venue_longitude != null
              ? `Pin set (${form.venue_latitude.toFixed(4)}, ${form.venue_longitude.toFixed(4)}) — adjust by hand`
              : "Enter the pin by hand"}
          </summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Latitude"
            type="number"
            step="any"
            required
            value={form.venue_latitude ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                venue_latitude: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
          <Field
            label="Longitude"
            type="number"
            step="any"
            required
            value={form.venue_longitude ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                venue_longitude: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>
        </details>
        {matched ? (
          <p className="rounded-lg bg-green/10 px-3 py-2 text-xs text-ink-soft">
            Pinned to <strong className="font-semibold text-ink">{matched}</strong>. If
            that isn&apos;t the right door, adjust the coordinates above.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="md"
            disabled={locating}
            onClick={onLocate}
          >
            {locating ? "Looking up…" : "Find it from the address"}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onUseMyLocation}>
            I&apos;m standing there now
          </Button>
        </div>
        <p className="text-xs text-ink-faint">
          Address lookup by the{" "}
          <a
            href="https://geocoding.geo.census.gov"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink-soft"
          >
            US Census Bureau
          </a>
          . US addresses only.
        </p>
      </div>
    </div>
  );
}
