"use client";

import type { Draft } from "@jorna/shared/lib/contractDraft";
import { inputClass, smallButton, type SetDraft } from "./shared";

/**
 * Overtime, edited where it prints: under the payment schedule, as the
 * client's copy shows it (ContractPaper's "Cancellation and overtime"). The
 * cancellation window lives in the Cancellation section instead
 * (CancellationBlock), so there's one place that says what cancelling costs.
 *
 * How long sending holds the date isn't a contract term, so it stays with
 * Send in the rail.
 */
export function PoliciesBlock({
  draft,
  set,
  hasCancellation,
  onAddCancellation,
}: {
  draft: Draft;
  set: SetDraft;
  /** The document already has a Cancellation section. */
  hasCancellation: boolean;
  onAddCancellation: () => void;
}) {
  return (
    <div className="mt-6 border-t border-dashed border-line-soft pt-4">
      <p className="text-sm font-semibold text-ink">Overtime</p>
      <label className="mt-2 block max-w-[14rem]">
        <span className="mb-1 block text-xs text-ink-faint">Overtime rate ($/hr)</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={draft.overtimeRate}
          onChange={(e) => set({ overtimeRate: e.target.value })}
          className={inputClass}
        />
      </label>
      <p className="mt-2 text-xs text-ink-faint">
        {draft.overtimeRate ? `Extra time is billed at $${draft.overtimeRate} an hour.` : "Leave it blank for no overtime rate."}
      </p>
      {hasCancellation ? null : (
        <button type="button" onClick={onAddCancellation} className={`${smallButton} mt-3`}>
          + Add a cancellation window
        </button>
      )}
    </div>
  );
}
