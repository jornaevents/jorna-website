"use client";

// Which service a package is (backend DECISIONS #35). Most vendors sell one
// to three services, so those are the choices, as chips; "Something else…"
// opens the full picker for the rare package outside them (saving it adds
// that service to the vendor's own, server-side).

import { useState } from "react";
import { Chip } from "@jorna/shared/components/ui";
import { ServicePicker } from "@jorna/shared/components/ServicePicker";
import { taxonomyLabel, type Taxonomy } from "@jorna/shared/lib/taxonomy";

export function PackageServiceField({
  taxonomy,
  specialties,
  value,
  onChange,
}: {
  taxonomy: Taxonomy | null;
  /** The vendor's services, in their order. */
  specialties: string[];
  value: string;
  onChange: (key: string) => void;
}) {
  const choices = value && !specialties.includes(value) ? [...specialties, value] : specialties;
  const [elsewhere, setElsewhere] = useState(choices.length === 0);

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">What is this package?</span>
      {choices.length ? (
        <div role="radiogroup" aria-label="What is this package?" className="flex flex-wrap gap-2">
          {choices.map((key) => (
            <Chip key={key} active={value === key} onClick={() => onChange(key)}>
              {taxonomyLabel(taxonomy, key)}
            </Chip>
          ))}
          {!elsewhere ? (
            <button
              type="button"
              onClick={() => setElsewhere(true)}
              className="px-2 text-sm font-semibold text-gold hover:underline"
            >
              Something else…
            </button>
          ) : null}
        </div>
      ) : null}
      {elsewhere ? (
        <div className={choices.length ? "mt-3" : ""}>
          <ServicePicker
            taxonomy={taxonomy}
            multiple={false}
            value={value ? [value] : []}
            onChange={(next) => {
              if (next[0]) onChange(next[0]);
            }}
            label={choices.length ? "Another service" : "Find the service"}
            hint="Saving adds it to the services you offer."
          />
        </div>
      ) : null}
    </div>
  );
}
