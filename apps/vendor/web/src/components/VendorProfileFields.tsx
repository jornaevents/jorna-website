"use client";

// The vendor-profile form fields, shared between /vendor-onboarding, the Edit
// profile popup and Settings. One copy so wording and validation can't drift.

import { useState } from "react";
import { ESCROW_ENABLED } from "@jorna/shared/lib/flags";
import { taxonomyLabel, type Taxonomy } from "@jorna/shared/lib/taxonomy";
import { ServicePicker } from "@jorna/shared/components/ServicePicker";
import type { ServicePickNeeded } from "@/lib/types";
import { Chip, Field } from "@jorna/shared/components/ui";

/** Old categories saved without saying which service (backend
 *  service_picks_needed) that the vendor hasn't answered yet — answered by
 *  picking one of its choices; the backend agrees on save. */
export function openPicks(picksNeeded: ServicePickNeeded[], specialties: string[]): ServicePickNeeded[] {
  return picksNeeded.filter((p) => !p.choices.some((c) => specialties.includes(c)));
}

/** Which services a vendor sells (backend DECISIONS #35): a "which of these
 *  do you offer?" prompt per unanswered old category, then the picker. */
export function VendorServicesFields({
  taxonomy,
  specialties,
  picksNeeded = [],
  onChange,
}: {
  taxonomy: Taxonomy | null;
  /** Service keys. */
  specialties: string[];
  picksNeeded?: ServicePickNeeded[];
  onChange: (next: string[]) => void;
}) {
  return (
    <>
      {openPicks(picksNeeded, specialties).map((p) => (
        <div key={p.category} className="rounded-xl border border-gold/40 bg-gold/10 p-3.5">
          <p className="text-sm text-ink">
            <strong>Your listing says “{p.category.replace(/_/g, " ")}”. Which of these do you offer?</strong>{" "}
            <span className="text-ink-soft">Clients search for each one on its own.</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.choices.map((key) => (
              <Chip key={key} active={specialties.includes(key)} onClick={() => onChange([...specialties, key])}>
                {taxonomyLabel(taxonomy, key)}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      <ServicePicker
        taxonomy={taxonomy}
        value={specialties}
        onChange={onChange}
        label="Services you offer"
        hint="Add each one you're booked for. Clients search for each on its own."
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
