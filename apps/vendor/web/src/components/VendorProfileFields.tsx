"use client";

// The vendor-identity form fields, shared between /vendor-onboarding (where
// they're asked once, in order) and /vendor-profile's ongoing edit form
// (where they're all just settings). One copy so wording and validation can't
// drift between the two.

import { ESCROW_ENABLED } from "@jorna/shared/lib/flags";
import { taxonomyLabel, type Taxonomy } from "@jorna/shared/lib/taxonomy";
import { ServicePicker } from "@jorna/shared/components/ServicePicker";
import type { ServicePickNeeded } from "@/lib/types";
import { Chip, Field } from "@jorna/shared/components/ui";

export function VendorIdentityFields({
  taxonomy,
  specialties,
  picksNeeded = [],
  bio,
  yearsExperience,
  onSpecialtiesChange,
  onBioChange,
  onYearsExperienceChange,
}: {
  taxonomy: Taxonomy | null;
  /** Service keys (backend DECISIONS #35). */
  specialties: string[];
  /** Old categories saved without saying which service (backend
   *  service_picks_needed); each is answered by picking one of its choices. */
  picksNeeded?: ServicePickNeeded[];
  bio: string;
  /** Asked once, here, rather than on every package (backend 0063). */
  yearsExperience: string;
  onSpecialtiesChange: (next: string[]) => void;
  onBioChange: (value: string) => void;
  onYearsExperienceChange: (value: string) => void;
}) {
  // Answered once one of its choices is picked; the backend agrees on save.
  const open = picksNeeded.filter((p) => !p.choices.some((c) => specialties.includes(c)));

  return (
    <>
      {open.map((p) => (
        <div key={p.category} className="rounded-xl border border-gold/40 bg-gold/10 p-3.5">
          <p className="text-sm text-ink">
            <strong>Your listing says “{p.category.replace(/_/g, " ")}”. Which of these do you offer?</strong>{" "}
            <span className="text-ink-soft">Clients search for each one on its own.</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.choices.map((key) => (
              <Chip key={key} active={specialties.includes(key)} onClick={() => onSpecialtiesChange([...specialties, key])}>
                {taxonomyLabel(taxonomy, key)}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      <ServicePicker
        taxonomy={taxonomy}
        value={specialties}
        onChange={onSpecialtiesChange}
        label="Services you offer"
        hint="Add each one you're booked for. Clients search for each on its own."
      />

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

      <Field
        label="Years in business (optional)"
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        step={1}
        placeholder="e.g. 5"
        value={yearsExperience}
        onChange={(e) => onYearsExperienceChange(e.target.value)}
      />
    </>
  );
}

export function VendorReachFields({
  radius,
  longDistance,
  instagram,
  onRadiusChange,
  onLongDistanceChange,
  onInstagramChange,
}: {
  radius: string;
  longDistance: boolean;
  instagram: string;
  onRadiusChange: (value: string) => void;
  onLongDistanceChange: (value: boolean) => void;
  onInstagramChange: (value: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Travel radius in miles (optional)"
          type="number"
          min={1}
          max={500}
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

    </>
  );
}

/** How this vendor gets paid. With escrow disabled (the MVP default — see
 *  lib/flags.ts) this is just the Venmo/Zelle fields, no choice to make;
 *  callers always pass "manual" in that case. Stripe Connect's own
 *  onboarding status is a separate, live-fetched thing (see /my-earnings),
 *  not part of this form. */
export function VendorPaymentFields({
  paymentMethod,
  venmoHandle,
  zelleContact,
  onPaymentMethodChange,
  onVenmoHandleChange,
  onZelleContactChange,
}: {
  paymentMethod: "stripe" | "manual";
  venmoHandle: string;
  zelleContact: string;
  onPaymentMethodChange: (value: "stripe" | "manual") => void;
  onVenmoHandleChange: (value: string) => void;
  onZelleContactChange: (value: string) => void;
}) {
  // With escrow disabled, manual is the only option — treated as such here
  // regardless of what a not-yet-updated vendor row still has stored, so a
  // legacy "stripe" vendor still sees (and can fill in) the Venmo/Zelle
  // fields rather than being shown nothing with no way to switch.
  const effectivePaymentMethod = ESCROW_ENABLED ? paymentMethod : "manual";

  return (
    <>
      {ESCROW_ENABLED ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3.5 transition ${
              paymentMethod === "stripe" ? "border-gold bg-gold/8" : "border-card-edge bg-ground-2"
            }`}
          >
            <input
              type="radio"
              name="payment_method"
              checked={paymentMethod === "stripe"}
              onChange={() => onPaymentMethodChange("stripe")}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Protected — through Jorna</span>
              <span className="mt-0.5 block text-xs text-ink-faint">
                Clients pay by card. Jorna holds the funds and covers cancellations under
                Jorna&apos;s policy.
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3.5 transition ${
              paymentMethod === "manual" ? "border-gold bg-gold/8" : "border-card-edge bg-ground-2"
            }`}
          >
            <input
              type="radio"
              name="payment_method"
              checked={paymentMethod === "manual"}
              onChange={() => onPaymentMethodChange("manual")}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Direct — Venmo or Zelle</span>
              <span className="mt-0.5 block text-xs text-ink-faint">
                Clients pay you directly, no card fees — but Jorna can&apos;t hold, refund, or
                mediate this payment.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {effectivePaymentMethod === "manual" ? (
        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Venmo handle"
              placeholder="@your-business"
              value={venmoHandle}
              onChange={(e) => onVenmoHandleChange(e.target.value)}
            />
            <Field
              label="Zelle contact"
              placeholder="Email or phone"
              value={zelleContact}
              onChange={(e) => onZelleContactChange(e.target.value)}
            />
          </div>
          {!ESCROW_ENABLED ? (
            <p className="mt-1.5 text-xs text-ink-faint">
              Add at least one so clients know how to pay you.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
