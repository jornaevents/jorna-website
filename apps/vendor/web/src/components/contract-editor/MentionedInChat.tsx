"use client";

// "Mentioned in chat" beside the contract (Contract Builder from Chat, v1):
// what the messages since the client's inquiry said about the event, each
// with the words it was said in. Use puts a value on the contract; nothing
// changes until the vendor clicks it. Hours and amounts have no Use: which
// line an hour belongs to, or what a figure was for, is the vendor's call —
// unless the contract makes it clear (lib/mentionUse).

import { useState } from "react";
import type { Draft } from "@jorna/shared/lib/contractDraft";
import type { Mention } from "@/lib/chatMentions";
import { countUse } from "@/lib/jorna";

const KIND_LABEL: Record<Mention["kind"], string> = {
  date: "Date",
  times: "Time",
  start: "Start time",
  guests: "Guests",
  hours: "Hours",
  amount: "Amount",
  addon: "Add-on",
  discount: "Discount",
  price: "Price",
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MentionedInChat({
  mentions,
  patchFor,
  onUse,
}: {
  mentions: Mention[];
  /** What Use would change on the contract as it stands (lib/mentionUse);
   *  null leaves the mention without a Use button. */
  patchFor: (m: Mention) => Partial<Draft> | null;
  onUse: (patch: Partial<Draft>) => void;
}) {
  const [used, setUsed] = useState<Set<string>>(() => new Set());
  if (mentions.length === 0) return null;
  const count = mentions.length;
  return (
    <details
      className="mt-3 rounded-lg border border-card-edge bg-card text-sm"
      onToggle={(e) => {
        if (e.currentTarget.open) countUse({ name: "mention_panel_opened", props: { count } });
      }}
    >
      <summary className="cursor-pointer px-3 py-2.5 font-semibold text-ink">
        {count === 1 ? "1 detail mentioned in chat" : `${count} details mentioned in chat`}
      </summary>
      <ul aria-label="Mentioned in chat" className="grid gap-2 border-t border-line-soft px-3 py-3">
        {mentions.map((m) => {
          const done = used.has(m.id);
          const patch = done ? null : patchFor(m);
          return (
            <li key={m.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-ink">
                  <span className="text-ink-faint">{KIND_LABEL[m.kind]}:</span> {m.label}
                  {m.agreed ? (
                    <span className="ml-2 rounded-full bg-green/10 px-2 py-0.5 text-[0.68rem] font-bold text-green">Agreed in chat</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {/* An agreed detail has no words to quote, and its badge
                      already says it was agreed. */}
                  {m.agreed ? `Proposed by ${m.sender}, ${when(m.at)}` : <>&ldquo;{m.quote}&rdquo; — {m.sender}, {when(m.at)}</>}
                </p>
              </div>
              {patch || done ? (
                <button
                  type="button"
                  disabled={done}
                  aria-label={`Use ${m.label}`}
                  onClick={() => {
                    if (!patch) return;
                    onUse(patch);
                    setUsed((s) => new Set(s).add(m.id));
                    countUse({ name: "mention_used", props: { kind: m.kind } });
                  }}
                  className="shrink-0 rounded-full border border-card-edge px-3 py-1 text-xs font-semibold text-ink hover:border-gold disabled:opacity-60"
                >
                  {done ? "Used" : "Use"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
