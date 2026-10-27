"use client";

// Contract defaults, in one place on the Contracts page next to the templates
// that use them (plan 2.4). They used to be split between Vendor Profile
// (deposit, cancellation, overtime, two fixed clause boxes) and Settings (how
// long a sent contract holds the date) — neither of which is where a vendor
// thinks about contracts. The fields themselves didn't move on the backend;
// only where they're edited.

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError } from "@jorna/shared/lib/api";
import { Button, Field } from "@jorna/shared/components/ui";
import { updateMyVendor } from "@/lib/jorna";
import { newKey } from "@jorna/shared/lib/contractDraft";
import type { PaymentPlan, VendorDetail } from "@/lib/types";
import { Drawer } from "@/components/vendor/ui";

const DEFAULT_HOLD_DAYS = 7;

type LockGroup = "prices" | "event" | "policies" | "clauses";

// What a client can't ask to change once negotiation is field by field
// (backend DECISIONS #26). Copied onto each contract when it's first sent.
const LOCKS: { value: LockGroup; label: string; hint: string }[] = [
  { value: "prices", label: "Prices", hint: "Line prices and the discount. Quantities stay open." },
  { value: "event", label: "Event details", hint: "Date, times, venue and guest count." },
  { value: "policies", label: "Policies", hint: "Cancellation window and overtime rate." },
  { value: "clauses", label: "Sections", hint: "Clients can't ask to leave a section out." },
];

type Preset = PaymentPlan["preset"] | "";

const PRESETS: { value: Preset; label: string; hint: string }[] = [
  { value: "", label: "No usual schedule", hint: "Deposit + balance if you take a deposit, otherwise pay in full." },
  { value: "full", label: "Pay in full", hint: "One payment when they sign." },
  { value: "deposit_balance", label: "Deposit + balance", hint: "Your deposit when they sign, the rest before the event." },
  { value: "three", label: "Three payments", hint: "A third on signing, a third later, the rest before the event." },
];

interface ClauseRow {
  key: string;
  title: string;
  body: string;
}

/** The vendor's default clauses as one list. The two fixed boxes
 *  (equipment & power, travel) become ordinary rows; everything saves to
 *  default_contract_terms.custom. */
function clausesOf(vendor: VendorDetail): ClauseRow[] {
  const t = vendor.default_contract_terms;
  const rows: ClauseRow[] = [];
  if (t?.equipment_power) rows.push({ key: newKey(), title: "Equipment & power", body: t.equipment_power });
  if (t?.travel) rows.push({ key: newKey(), title: "Travel", body: t.travel });
  for (const c of t?.custom ?? []) rows.push({ key: newKey(), title: c.label, body: c.value });
  return rows;
}

const inputClass =
  "w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";

export function ContractDefaultsDrawer({
  open,
  onClose,
  vendor,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  vendor: VendorDetail;
  onSaved: (v: VendorDetail) => void;
}) {
  // Keyed by the drawer's opening in the parent, so each open starts from
  // the vendor as saved.
  const [deposit, setDeposit] = useState(vendor.default_deposit_percent?.toString() ?? "");
  const [cancelDays, setCancelDays] = useState(
    vendor.default_cancellation_window_hours != null ? String(Math.round(vendor.default_cancellation_window_hours / 24)) : "",
  );
  const [overtime, setOvertime] = useState(
    vendor.default_overtime_rate_cents != null ? String(vendor.default_overtime_rate_cents / 100) : "",
  );
  const [holdDays, setHoldDays] = useState(vendor.contract_hold_days?.toString() ?? "");
  const [preset, setPreset] = useState<Preset>(vendor.default_payment_plan?.preset ?? "");
  const [balanceDays, setBalanceDays] = useState(String(vendor.default_payment_plan?.balance_days_before ?? 14));
  const [clauses, setClauses] = useState<ClauseRow[]>(() => clausesOf(vendor));
  const [locks, setLocks] = useState<LockGroup[]>(vendor.negotiation_locks ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateClause = (key: string, patch: Partial<ClauseRow>) =>
    setClauses((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const moveClause = (idx: number, delta: -1 | 1) =>
    setClauses((cs) => {
      const next = [...cs];
      const [row] = next.splice(idx, 1);
      next.splice(idx + delta, 0, row);
      return next;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const pct = deposit.trim() ? Number(deposit) : null;
    if (pct !== null && !(Number.isInteger(pct) && pct >= 0 && pct <= 100)) return setError("A deposit is between 0 and 100%.");
    const hold = holdDays.trim() ? Number(holdDays) : null;
    if (hold !== null && !(Number.isInteger(hold) && hold >= 1 && hold <= 60)) return setError("Hold a date for between 1 and 60 days.");
    const balance = Number(balanceDays);
    if (preset && preset !== "full" && !(Number.isInteger(balance) && balance >= 0 && balance <= 365)) {
      return setError("The balance is due between 0 and 365 days before the event.");
    }
    const kept = clauses.filter((c) => c.title.trim() || c.body.trim());
    if (kept.some((c) => !c.title.trim() || !c.body.trim())) return setError("Every clause needs a title and some text.");

    setBusy(true);
    setError(null);
    try {
      const updated = await updateMyVendor({
        default_deposit_percent: pct,
        default_cancellation_window_hours: cancelDays.trim() ? Number(cancelDays) * 24 : null,
        default_overtime_rate_cents: overtime.trim() ? Math.round(Number(overtime) * 100) : null,
        contract_hold_days: hold,
        default_payment_plan: preset ? { preset, balance_days_before: preset === "full" ? 14 : balance } : null,
        negotiation_locks: locks,
        default_contract_terms: kept.length
          ? { custom: kept.map((c) => ({ label: c.title.trim(), value: c.body.trim() })) }
          : null,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your defaults.");
    } finally {
      setBusy(false);
    }
  }

  const paidBy = [vendor.venmo_handle && `Venmo ${vendor.venmo_handle}`, vendor.zelle_contact && `Zelle ${vendor.zelle_contact}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Contract defaults"
      // Which wins, said where it's set: a vendor whose template ignored a
      // new default couldn't tell why (2026-10-26).
      subtitle="A contract starts from its template, then the package's own terms, then these for anything left. You can still change them on each one."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="contract-defaults" disabled={busy}>
            {busy ? "Saving…" : "Save defaults"}
          </Button>
        </div>
      }
    >
      <form id="contract-defaults" onSubmit={submit} className="grid gap-6" noValidate>
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold text-ink">Payments</h3>
          <Field
            label="Deposit (%)"
            type="number"
            min={0}
            max={100}
            placeholder="e.g. 50"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
          />
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium text-ink-soft">Usual payment schedule</legend>
            {PRESETS.map((p) => (
              <label key={p.value || "none"} className="flex items-start gap-2.5 rounded-lg border border-card-edge px-3 py-2">
                <input
                  type="radio"
                  name="preset"
                  value={p.value}
                  checked={preset === p.value}
                  onChange={() => setPreset(p.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm text-ink">{p.label}</span>
                  <span className="block text-xs text-ink-faint">{p.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {preset === "deposit_balance" || preset === "three" ? (
            <Field
              label="Balance due (days before the event)"
              type="number"
              min={0}
              max={365}
              value={balanceDays}
              onChange={(e) => setBalanceDays(e.target.value)}
            />
          ) : null}
          <p className="text-xs text-ink-faint">
            {paidBy ? `Clients pay you by ${paidBy}. ` : "You haven't said how clients pay you yet. "}
            <Link href="/settings" className="font-semibold text-gold hover:underline">
              Change in Settings
            </Link>
          </p>
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold text-ink">Policies</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Cancellation window (days)"
              type="number"
              min={0}
              placeholder="e.g. 30"
              value={cancelDays}
              onChange={(e) => setCancelDays(e.target.value)}
            />
            <Field
              label="Overtime rate ($/hr)"
              type="number"
              min={0}
              step="0.01"
              value={overtime}
              onChange={(e) => setOvertime(e.target.value)}
            />
          </div>
          <Field
            label="Hold the date for (days)"
            type="number"
            min={1}
            max={60}
            placeholder={String(DEFAULT_HOLD_DAYS)}
            value={holdDays}
            onChange={(e) => setHoldDays(e.target.value)}
            hint="How long a sent contract holds the date before it opens up again."
          />
        </section>

        <section className="grid gap-2">
          <h3 className="text-sm font-semibold text-ink">Not negotiable</h3>
          <p className="-mt-1 text-xs text-ink-faint">
            Clients can still see these, but can&apos;t ask to change them. Applies to contracts you send from now on.
          </p>
          {LOCKS.map((l) => (
            <label key={l.value} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={locks.includes(l.value)}
                onChange={(e) =>
                  setLocks((cur) => (e.target.checked ? [...cur, l.value] : cur.filter((x) => x !== l.value)))
                }
              />
              <span>
                <span className="block text-ink">{l.label}</span>
                <span className="block text-xs text-ink-faint">{l.hint}</span>
              </span>
            </label>
          ))}
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-semibold text-ink">Default clauses</h3>
          <p className="-mt-2 text-xs text-ink-faint">Added to every new contract, in this order.</p>
          {clauses.map((c, idx) => (
            <div key={c.key} className="grid gap-2 rounded-lg border border-card-edge p-3">
              <div className="flex items-center gap-2">
                <input
                  aria-label="Clause title"
                  value={c.title}
                  placeholder="Title, e.g. Travel"
                  onChange={(e) => updateClause(c.key, { title: e.target.value })}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  aria-label={`Move ${c.title || "clause"} up`}
                  disabled={idx === 0}
                  onClick={() => moveClause(idx, -1)}
                  className="grid size-8 place-items-center rounded text-ink-faint hover:text-ink disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${c.title || "clause"} down`}
                  disabled={idx === clauses.length - 1}
                  onClick={() => moveClause(idx, 1)}
                  className="grid size-8 place-items-center rounded text-ink-faint hover:text-ink disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${c.title || "clause"}`}
                  onClick={() => setClauses((cs) => cs.filter((x) => x.key !== c.key))}
                  className="text-xs text-ink-faint hover:text-maroon"
                >
                  Remove
                </button>
              </div>
              <textarea
                aria-label="Clause text"
                value={c.body}
                rows={3}
                placeholder="What you're agreeing to, in plain words."
                onChange={(e) => updateClause(c.key, { body: e.target.value })}
                className={inputClass}
              />
            </div>
          ))}
          <div>
            <button
              type="button"
              onClick={() => setClauses((cs) => [...cs, { key: newKey(), title: "", body: "" }])}
              className="rounded-full border border-card-edge px-3 py-1 text-xs font-semibold text-ink-soft transition hover:border-gold hover:text-ink"
            >
              + Add a clause
            </button>
          </div>
        </section>

        {error ? (
          <p role="alert" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {error}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}
