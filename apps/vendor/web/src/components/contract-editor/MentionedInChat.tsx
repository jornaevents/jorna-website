"use client";

// "Mentioned in chat" beside the contract (Contract Builder from Chat, v1):
// what the messages since the client's inquiry said about the event, each
// with the words it was said in. Use puts a value on the contract; nothing
// changes until the vendor clicks it. Hours and amounts have no Use: which
// line an hour belongs to, or what a figure was for, is the vendor's call.

import { useState } from "react";
import type { Draft } from "@jorna/shared/lib/contractDraft";
import type { Mention } from "@/lib/chatMentions";

const KIND_LABEL: Record<Mention["kind"], string> = {
  date: "Date",
  times: "Time",
  start: "Start time",
  guests: "Guests",
  hours: "Hours",
  amount: "Amount",
};

function patchFor(m: Mention): Partial<Draft> | null {
  switch (m.kind) {
    case "date":
      return { dateIso: m.value };
    case "times": {
      const [timeStart, timeEnd] = m.value.split("-");
      return { timeStart, timeEnd };
    }
    case "start":
      return { timeStart: m.value };
    case "guests":
      return { guestCount: m.value };
    default:
      return null;
  }
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MentionedInChat({ mentions, onUse }: { mentions: Mention[]; onUse: (patch: Partial<Draft>) => void }) {
  const [used, setUsed] = useState<Set<string>>(() => new Set());
  if (mentions.length === 0) return null;
  const count = mentions.length;
  return (
    <details className="mt-3 rounded-lg border border-card-edge bg-card text-sm">
      <summary className="cursor-pointer px-3 py-2.5 font-semibold text-ink">
        {count === 1 ? "1 detail mentioned in chat" : `${count} details mentioned in chat`}
      </summary>
      <ul aria-label="Mentioned in chat" className="grid gap-2 border-t border-line-soft px-3 py-3">
        {mentions.map((m) => {
          const patch = m.usable ? patchFor(m) : null;
          const done = used.has(m.id);
          return (
            <li key={m.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-ink">
                  <span className="text-ink-faint">{KIND_LABEL[m.kind]}:</span> {m.label}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  &ldquo;{m.quote}&rdquo; — {m.sender}, {when(m.at)}
                </p>
              </div>
              {patch ? (
                <button
                  type="button"
                  disabled={done}
                  aria-label={`Use ${m.label}`}
                  onClick={() => {
                    onUse(patch);
                    setUsed((s) => new Set(s).add(m.id));
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
