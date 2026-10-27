"use client";

// The contract as a page, for the negotiation workspace: the document's own
// block order (backend 0067), with each negotiable value marked — rose where
// the other side changed it, gold where you're changing it now. Read-only;
// the editing happens in the revision panel beside it.

import type { ReactNode } from "react";
import { cancellationClause, describeDue, layoutOf, lineTotalCents, money, totalCents, toCents, type Draft } from "../../lib/contractDraft";
import { lineId, showValue, type ValueKind } from "../../lib/negotiation";

export type Mark = "other" | "yours" | null;

export const MARK_CLASS: Record<Exclude<Mark, null>, string> = {
  other: "rounded bg-rose-500/15 px-1 text-rose-800 ring-1 ring-rose-500/30 dark:text-rose-200",
  yours: "rounded bg-gold/20 px-1 text-ink ring-1 ring-gold/50",
};

function V({ mark, children }: { mark: Mark; children: ReactNode }) {
  return mark ? <span className={MARK_CLASS[mark]}>{children}</span> : <>{children}</>;
}

function Term({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-[0.95rem] font-semibold text-ink">
        {n}. {title}
      </h3>
      <div className="mt-1.5 text-[0.92rem] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export function ContractPaper({
  draft,
  markOf,
  vendorName,
  clientName,
  title,
}: {
  draft: Draft;
  /** How to mark a value, by its id in lib/negotiation. */
  markOf: (id: string) => Mark;
  vendorName: string;
  clientName: string;
  title: string;
}) {
  const show = (id: string, kind: ValueKind, raw: string) => <V mark={markOf(id)}>{showValue(kind, raw)}</V>;
  // The window prints inside the Cancellation section when there is one —
  // one place says what cancelling costs (2026-10-26 test). Without one it
  // stays with the policies, as before.
  const cancelling = cancellationClause(draft);
  const windowLine = draft.cancellationDays ? (
    <p>
      Cancelling within {show("policy.cancellation", "days", draft.cancellationDays)} of the event may forfeit what&apos;s been paid.
    </p>
  ) : null;
  let n = 0;

  const blocks = layoutOf(draft).map((b) => {
    switch (b.type) {
      case "parties":
        return (
          <p key={b.id} className="mt-4 text-[0.92rem] leading-relaxed text-ink-soft">
            This agreement is between <b className="text-ink">{vendorName}</b> (“Vendor”) and{" "}
            <b className="text-ink">{clientName}</b> (“Client”).
          </p>
        );
      case "event":
        return (
          <Term key={b.id} n={++n} title="The event">
            <p>
              On {show("event.date", "date", draft.dateIso)}
              {draft.multiDay ? <> through {show("event.dateEnd", "date", draft.dateEnd)}</> : null}, from{" "}
              {show("event.start", "time", draft.timeStart)} to {show("event.end", "time", draft.timeEnd)}, at{" "}
              {show("event.venue", "text", draft.location || "a venue to be confirmed")}
              {draft.guestCount ? <>, for {show("event.guests", "count", draft.guestCount)} guests</> : null}.
            </p>
          </Term>
        );
      case "items":
        return (
          <Term key={b.id} n={++n} title="What's included">
            <ul className="grid gap-1">
              {draft.lines.map((l) => {
                const id = lineId(l);
                return (
                  <li key={l.key} className="flex items-baseline justify-between gap-3">
                    <span>
                      <V mark={markOf(`line:${id}`) ?? markOf(`line:${id}.name`)}>{l.name || "New item"}</V> ·{" "}
                      {show(`line:${id}.quantity`, "count", l.quantity)} × {show(`line:${id}.price`, "money", l.price)}
                      {l.description ? <span className="block text-xs text-ink-faint">{l.description}</span> : null}
                    </span>
                    <span className="shrink-0 text-ink">{money(lineTotalCents(l))}</span>
                  </li>
                );
              })}
              {toCents(draft.discount || "0") > 0 ? (
                <li className="flex justify-between gap-3">
                  <span>Discount</span>
                  <span className="text-ink">−{show("discount", "money", draft.discount)}</span>
                </li>
              ) : null}
              <li className="mt-1 flex justify-between gap-3 border-t border-line-soft pt-1.5 font-semibold text-ink">
                <span>Total</span>
                <span>{money(totalCents(draft))}</span>
              </li>
            </ul>
          </Term>
        );
      case "schedule": {
        const windowHere = Boolean(draft.cancellationDays) && !cancelling;
        const policies = windowHere || draft.overtimeRate;
        return (
          <div key={b.id}>
            {draft.schedule.length ? (
              <Term n={++n} title="Payment schedule">
                <ul className="grid gap-1">
                  {draft.schedule.map((i) => {
                    const id = i.id ?? i.key;
                    return (
                      <li key={i.key} className="flex items-baseline justify-between gap-3">
                        <span>
                          {i.label} —{" "}
                          {i.dueType === "before_event" ? (
                            <>{show(`pay:${id}.dueDays`, "days", i.dueDays)} before the event</>
                          ) : i.dueType === "date" ? (
                            <>due {show(`pay:${id}.dueDate`, "date", i.dueDate)}</>
                          ) : (
                            describeDue({ due_type: i.dueType, due_date: i.dueDate || null, due_days: null }).toLowerCase()
                          )}
                        </span>
                        <span className="shrink-0 text-ink">{show(`pay:${id}.amount`, "money", i.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Term>
            ) : null}
            {policies ? (
              <Term n={++n} title={windowHere ? (draft.overtimeRate ? "Cancellation and overtime" : "Cancellation") : "Overtime"}>
                {windowHere ? windowLine : null}
                {draft.overtimeRate ? (
                  <p>Additional time is billed at {show("policy.overtime", "money", draft.overtimeRate)} per hour.</p>
                ) : null}
              </Term>
            ) : null}
          </div>
        );
      }
      case "terms": {
        const c = draft.clauses.find((x) => x.key === b.id);
        if (!c) return null;
        return (
          <Term key={b.id} n={++n} title={c.title || "Untitled clause"}>
            {c === cancelling ? windowLine : null}
            {c.body || c !== cancelling ? (
              <p className="whitespace-pre-line">
                <V mark={markOf(`clause:${c.key}`)}>{c.body || "—"}</V>
              </p>
            ) : null}
          </Term>
        );
      }
      case "signature":
        return (
          <div key={b.id} className="mt-8 grid grid-cols-2 gap-6 text-xs text-ink-faint">
            <span className="border-t border-line pt-2">Client signature</span>
            <span className="border-t border-line pt-2">Vendor signature</span>
          </div>
        );
      default:
        return null;
    }
  });

  return (
    <article className="rounded-xl border border-card-edge bg-card px-6 py-7 shadow-[var(--shadow-card)] sm:px-9 sm:py-9">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-faint">{vendorName}</p>
      <h2 className="serif mt-2 text-2xl leading-tight text-ink">{title}</h2>
      {blocks}
    </article>
  );
}
