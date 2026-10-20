"use client";

// A package's details that clients filter by (backend DECISIONS #35):
// cuisine for a caterer, venue type and capacity for a venue, and so on —
// whatever the taxonomy lists for the package's service, each drawn by its
// type. All optional: a package without them still lists, it's just found
// by fewer filters.

import { Chip } from "@jorna/shared/components/ui";
import { findService, type Taxonomy } from "@jorna/shared/lib/taxonomy";
import type { PackageAttributeValue } from "@/lib/types";

export function AttributeFields({
  taxonomy,
  serviceKey,
  value,
  onChange,
}: {
  taxonomy: Taxonomy | null;
  serviceKey: string;
  value: Record<string, PackageAttributeValue>;
  onChange: (next: Record<string, PackageAttributeValue>) => void;
}) {
  const service = taxonomy && serviceKey ? findService(taxonomy, serviceKey) : null;
  const attributes = service?.attributes.map((k) => taxonomy!.attributes[k]).filter(Boolean) ?? [];
  if (!attributes.length) return null;

  function set(key: string, next: PackageAttributeValue | null) {
    const copy = { ...value };
    if (next === null || (Array.isArray(next) && next.length === 0)) delete copy[key];
    else copy[key] = next;
    onChange(copy);
  }

  return (
    <fieldset className="grid gap-4 rounded-xl border border-card-edge p-4">
      <legend className="px-1 text-sm font-medium text-ink-soft">Details clients filter by (optional)</legend>
      {attributes.map((a) => {
        const current = value[a.key];
        if (a.type === "bool") {
          return (
            <label key={a.key} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={current === true} onChange={(e) => set(a.key, e.target.checked ? true : null)} />
              {a.label}
            </label>
          );
        }
        if (a.type === "number") {
          return (
            <label key={a.key} className="block">
              <span className="mb-1.5 block text-sm text-ink-soft">
                {a.label}
                {a.unit ? ` (${a.unit})` : ""}
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={typeof current === "number" ? current : ""}
                onChange={(e) => set(a.key, e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
                className="w-40 rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
              />
            </label>
          );
        }
        const picked = a.type === "multi" ? (Array.isArray(current) ? current : []) : typeof current === "string" ? [current] : [];
        return (
          <div key={a.key} role="group" aria-label={a.label}>
            <span className="mb-1.5 block text-sm text-ink-soft">
              {a.label}
              {a.type === "multi" ? <span className="text-ink-faint"> · pick any</span> : null}
            </span>
            <div className="flex flex-wrap gap-2">
              {(a.options ?? []).map((o) => (
                <Chip
                  key={o.key}
                  active={picked.includes(o.key)}
                  onClick={() =>
                    a.type === "multi"
                      ? set(a.key, picked.includes(o.key) ? picked.filter((k) => k !== o.key) : [...picked, o.key])
                      : set(a.key, picked.includes(o.key) ? null : o.key)
                  }
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
