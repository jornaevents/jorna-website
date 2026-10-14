"use client";

import { cancellationSentence, type ClauseDraft, type Draft } from "@jorna/shared/lib/contractDraft";
import { inputClass, type SetDraft } from "./shared";
import { TermsBlock } from "./TermsBlock";

/**
 * The Cancellation section, with the window inside it (web #166): one place
 * that says what cancelling costs. The first sentence is written from the
 * days, in the words every copy of the contract uses; the vendor's own
 * wording follows. With no wording of their own, the window alone is the
 * section (contractDraft.toDocument).
 */
export function CancellationBlock({
  clause,
  draft,
  set,
  onChange,
}: {
  clause: ClauseDraft;
  draft: Draft;
  set: SetDraft;
  onChange: (patch: Partial<ClauseDraft>) => void;
}) {
  const days = draft.cancellationDays.trim();
  return (
    <div className="grid gap-3">
      <label className="block max-w-[14rem]">
        <span className="mb-1 block text-xs text-ink-faint">Cancellation window (days before the event)</span>
        <input
          type="number"
          min={0}
          placeholder="e.g. 30"
          value={draft.cancellationDays}
          onChange={(e) => set({ cancellationDays: e.target.value })}
          className={inputClass}
        />
      </label>
      <p className="text-[0.95rem] leading-relaxed text-ink-soft">
        {days ? cancellationSentence(days) : <span className="text-ink-faint">Set the days, and the contract says what cancelling inside them costs.</span>}
      </p>
      <TermsBlock clause={clause} onChange={onChange} placeholder="Anything else about cancelling, in your words (optional)." />
    </div>
  );
}
