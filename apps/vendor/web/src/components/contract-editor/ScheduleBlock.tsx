"use client";

import {
  balanceLastPayment,
  money,
  newKey,
  scheduledCents,
  type Draft,
  type InstallmentDraft,
  type SchedulePreset,
} from "@jorna/shared/lib/contractDraft";
import type { DueType } from "@/lib/types";
import { openPicker } from "@jorna/shared/components/ui";
import { inputClass, smallButton, todayIso } from "./shared";

/** How it's paid: a preset to start from, then each payment's amount and
 *  when it's due, checked against the total. */
export function ScheduleBlock({
  draft,
  total,
  setPlan,
  onPreset,
}: {
  draft: Draft;
  total: number;
  /** An edit to the plan itself — it stops following the total from here. */
  setPlan: (schedule: InstallmentDraft[]) => void;
  onPreset: (preset: SchedulePreset) => void;
}) {
  const scheduled = scheduledCents(draft);

  function updateInstallment(key: string, patch: Partial<InstallmentDraft>) {
    setPlan(draft.schedule.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["full", "Pay in full"],
            ["deposit_balance", "Deposit + balance"],
            ["three", "Three payments"],
          ] as const
        ).map(([preset, label]) => (
          <button key={preset} type="button" onClick={() => onPreset(preset)} className={smallButton}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {draft.schedule.map((i, idx) => (
          <div
            key={i.key}
            className="grid grid-cols-2 items-end gap-2 rounded-lg border border-line-soft p-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_7.5rem_3.5rem]"
          >
            <label className="col-span-2 block min-w-0 sm:col-span-1">
              <span className="mb-1 block text-[0.68rem] text-ink-faint">Payment {idx + 1}</span>
              <input aria-label="Name" value={i.label} onChange={(e) => updateInstallment(i.key, { label: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.68rem] text-ink-faint">Amount ($)</span>
              <input
                aria-label="Amount ($)"
                type="number"
                min={0}
                step="0.01"
                value={i.amount}
                onChange={(e) => updateInstallment(i.key, { amount: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[0.68rem] text-ink-faint">Due</span>
              <select
                aria-label="Due"
                value={i.dueType}
                onChange={(e) => updateInstallment(i.key, { dueType: e.target.value as DueType })}
                className={inputClass}
              >
                <option value="on_signing">When they sign</option>
                <option value="before_event">Days before the event</option>
                <option value="date">On a specific date</option>
              </select>
            </label>
            {i.dueType === "date" ? (
              <label className="block">
                <span className="mb-1 block text-[0.68rem] text-ink-faint">Due date</span>
                <input
                  aria-label="Due date"
                  type="date"
                  min={todayIso()}
                  value={i.dueDate}
                  onClick={openPicker}
                  onChange={(e) => updateInstallment(i.key, { dueDate: e.target.value })}
                  className={inputClass}
                />
              </label>
            ) : i.dueType === "before_event" ? (
              <label className="block">
                <span className="mb-1 block text-[0.68rem] text-ink-faint">Days before</span>
                <input
                  aria-label="Days before the event"
                  type="number"
                  min={0}
                  value={i.dueDays}
                  onChange={(e) => updateInstallment(i.key, { dueDays: e.target.value })}
                  className={inputClass}
                />
              </label>
            ) : (
              <span />
            )}
            {draft.schedule.length > 1 ? (
              <button
                type="button"
                aria-label={`Remove ${i.label || "payment"}`}
                onClick={() => setPlan(draft.schedule.filter((x) => x.key !== i.key))}
                className="justify-self-end pb-2 text-xs text-ink-faint hover:text-maroon"
              >
                Remove
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          className={smallButton}
          onClick={() =>
            setPlan([
              ...draft.schedule,
              { key: newKey(), label: "", amount: "", dueType: "before_event", dueDate: "", dueDays: "30" },
            ])
          }
        >
          + Add a payment
        </button>
        <span className={scheduled === total ? "text-ink-soft" : "text-maroon dark:text-gold"}>
          Scheduled {money(scheduled)} of {money(total)}
          {scheduled !== total && draft.schedule.length ? (
            <button
              type="button"
              onClick={() => setPlan(balanceLastPayment(draft))}
              className="ml-2 font-semibold text-gold underline-offset-4 hover:underline"
            >
              Put the difference on the last payment
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
