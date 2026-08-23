"use client";

// The vendor-identity form fields, shared between /vendor-onboarding (where
// they're asked once, in order) and /vendor-profile's ongoing edit form
// (where they're all just settings). One copy so wording and validation can't
// drift between the two.

import { useState } from "react";
import type { TaxonomyCategory, VendorSpecialization } from "@/lib/types";
import { Chip, Field } from "./ui";

function specKey(s: VendorSpecialization): string {
  return `${s.category}:${s.subcategory ?? ""}`;
}

function specLabel(s: VendorSpecialization, categories: TaxonomyCategory[]): string {
  const cat = categories.find((c) => c.value === s.category);
  const sub = cat?.subcategories.find((o) => o.value === s.subcategory);
  return sub ? `${cat?.label ?? s.category} · ${sub.label}` : cat?.label ?? s.category;
}

export function VendorIdentityFields({
  categories,
  specializations,
  bio,
  onSpecializationsChange,
  onBioChange,
}: {
  categories: TaxonomyCategory[];
  specializations: VendorSpecialization[];
  bio: string;
  onSpecializationsChange: (next: VendorSpecialization[]) => void;
  onBioChange: (value: string) => void;
}) {
  // Which category's options are on screen — a picker, not part of the
  // selection itself. Starts on the first thing already picked so reopening
  // this form (settings) doesn't land on an empty picker.
  const [pickerCategory, setPickerCategory] = useState(specializations[0]?.category ?? "");
  const pickerCat = categories.find((c) => c.value === pickerCategory);
  const subOptions = pickerCat?.subcategories ?? [];

  function has(category: string, subcategory: string | null) {
    return specializations.some(
      (s) => s.category === category && (s.subcategory ?? null) === subcategory,
    );
  }

  function toggle(category: string, subcategory: string | null) {
    if (has(category, subcategory)) {
      onSpecializationsChange(
        specializations.filter(
          (s) => !(s.category === category && (s.subcategory ?? null) === subcategory),
        ),
      );
    } else {
      onSpecializationsChange([...specializations, { category, subcategory }]);
    }
  }

  function remove(target: VendorSpecialization) {
    onSpecializationsChange(specializations.filter((s) => specKey(s) !== specKey(target)));
  }

  return (
    <>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">
          Add a category
        </span>
        <select
          value={pickerCategory}
          onChange={(e) => setPickerCategory(e.target.value)}
          className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
        >
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-faint">
          Pick every category you sell in, then any specialities within it —
          each package you add still gets its own, starting from these.
        </span>
      </label>

      {pickerCat ? (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">
            What you offer in {pickerCat.label}
          </span>
          <div className="flex flex-wrap gap-2">
            <Chip
              active={has(pickerCat.value, null)}
              onClick={() => toggle(pickerCat.value, null)}
            >
              {pickerCat.label}
            </Chip>
            {subOptions.map((s) => (
              <Chip
                key={s.value}
                active={has(pickerCat.value, s.value)}
                onClick={() => toggle(pickerCat.value, s.value)}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">
          Your specializations
        </span>
        {specializations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {specializations.map((s) => (
              <span
                key={specKey(s)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold/12 py-1 pl-3 pr-1.5 text-xs font-semibold text-maroon dark:text-gold"
              >
                {specLabel(s, categories)}
                <button
                  type="button"
                  onClick={() => remove(s)}
                  aria-label={`Remove ${specLabel(s, categories)}`}
                  className="relative grid size-4 place-items-center rounded-full after:absolute after:-inset-3 after:content-[''] hover:bg-maroon/15 dark:hover:bg-gold/20"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-faint">
            Pick at least one category above — clients filter by this.
          </p>
        )}
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">About you</span>
        <textarea
          required
          rows={4}
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder="What you offer, your style, and what makes your work yours."
          className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
        />
      </label>
    </>
  );
}

export function VendorReachFields({
  radius,
  longDistance,
  locationNegotiable,
  instagram,
  onRadiusChange,
  onLongDistanceChange,
  onLocationNegotiableChange,
  onInstagramChange,
}: {
  radius: string;
  longDistance: boolean;
  locationNegotiable: boolean;
  instagram: string;
  onRadiusChange: (value: string) => void;
  onLongDistanceChange: (value: boolean) => void;
  onLocationNegotiableChange: (value: boolean) => void;
  onInstagramChange: (value: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Travel radius (miles)"
          type="number"
          min={0}
          value={radius}
          onChange={(e) => onRadiusChange(e.target.value)}
        />
        <Field
          label="Instagram (optional)"
          placeholder="yourhandle"
          value={instagram}
          onChange={(e) => onInstagramChange(e.target.value)}
        />
      </div>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={longDistance}
          onChange={(e) => onLongDistanceChange(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm text-ink-soft">
          I&apos;ll travel beyond my radius for the right event
        </span>
      </label>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={locationNegotiable}
          onChange={(e) => onLocationNegotiableChange(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm text-ink-soft">
          I&apos;m open to discussing price
          <span className="block text-xs text-ink-faint">
            Whether a client can actually make an offer is set per package.
          </span>
        </span>
      </label>
    </>
  );
}
