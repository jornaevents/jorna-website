"use client";

// An event's Budget tab (Jorna-Client design; client redesign PR 10): the
// budget against what's signed, paid and still to pay, then every payment on
// the signed contracts by month. Signed contracts only — one that's been sent
// and not signed is named underneath and counted once it is. A payment opens
// its vendor, where it's paid and marked sent.

import { centsMoney, shortDate } from "@/lib/contract";
import { overviewTotals, paymentsByMonth, pendingContracts, signedCents, type VendorRow } from "@/lib/eventOverview";
import type { Celebration } from "@/lib/myEvents";
import { Badge, type Tone } from "@/components/kit";

const STATE: Record<string, { text: string; tone: Tone }> = {
  received: { text: "Paid", tone: "green" },
  sent: { text: "Sent", tone: "gold" },
  overdue: { text: "Overdue", tone: "maroon" },
  due: { text: "Due today", tone: "gold" },
  upcoming: { text: "Upcoming", tone: "neutral" },
};

function monthName(key: string): string {
  if (!key) return "No date yet";
  const d = new Date(`${key}-01T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function BudgetTab({ celebration, rows, onOpen }: { celebration: Celebration; rows: VendorRow[]; onOpen: (bookingId: string) => void }) {
  const totals = overviewTotals(rows);
  const signed = signedCents(rows);
  const months = paymentsByMonth(rows);
  const pending = pendingContracts(rows);
  const budgetCents = celebration.budget != null ? Math.round(celebration.budget * 100) : null;
  const over = budgetCents != null && signed > budgetCents;

  const figures: [string, string][] = [
    ["Event budget", budgetCents != null ? centsMoney(budgetCents) : "Not set"],
    ["Signed contracts", centsMoney(signed)],
    ["Paid", centsMoney(totals.paidCents)],
    ["Still to pay", centsMoney(totals.owedCents)],
  ];

  return (
    <>
      <p className="eyebrow">Budget</p>
      <h2 className="mt-2 font-serif text-xl font-bold tracking-[-0.02em] text-ink">Where the money stands</h2>
      <p className="mt-1 text-sm text-ink-soft">Payments go straight to each vendor. Jorna keeps track of them.</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label} className="rounded-[14px] border border-line bg-card p-4">
            <dt className="text-[0.75rem] font-semibold text-ink-soft">{label}</dt>
            <dd className="font-serif text-[1.45rem] font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {over ? (
        <p className="mt-3 text-sm text-maroon">
          Signed contracts are {centsMoney(signed - budgetCents!)} over your budget.
        </p>
      ) : null}
      {pending.vendors.length > 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          Pending contracts: {centsMoney(pending.cents)} from {pending.vendors.join(" and ")} — not counted until signed.
        </p>
      ) : null}

      <section aria-label="Payments" className="mt-6">
        <h3 className="font-serif text-base font-bold text-ink">Payments</h3>
        {months.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-card px-4 py-5 text-center text-sm text-ink-soft">
            No payments yet. They appear here once a contract is signed.
          </p>
        ) : (
          months.map(({ month, rows: list }) => (
            <div key={month || "undated"} className="mt-4">
              <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-[0.1em] text-ink-faint">{monthName(month)}</p>
              <ul className="grid gap-2">
                {list.map((row) => (
                  <li key={`${row.bookingId}-${row.label}`}>
                    <button
                      type="button"
                      onClick={() => onOpen(row.bookingId)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-left text-sm hover:border-gold"
                    >
                      <span className="grid min-w-0">
                        <strong className="truncate text-ink">{row.vendor}</strong>
                        <span className="text-xs text-ink-soft">
                          {row.label}
                          {row.due ? ` · ${shortDate(row.due)}` : ""}
                        </span>
                      </span>
                      <strong className="text-ink">{centsMoney(row.amountCents)}</strong>
                      <Badge tone={STATE[row.state].tone}>{STATE[row.state].text}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  );
}
