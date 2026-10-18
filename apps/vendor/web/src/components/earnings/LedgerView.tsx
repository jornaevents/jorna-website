"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { Button } from "@jorna/shared/components/ui";
import { confirmInstallment, getLedger, remindPayment } from "@/lib/jorna";
import {
  STATUS,
  TABS,
  byBooking,
  byMonth,
  inTab,
  matchesSearch,
  money,
  shortDate,
  toCsv,
  type LedgerTab,
} from "@/lib/ledger";
import type { Ledger, LedgerRow } from "@/lib/types";
import { FilterTabs, PageHeader, StatusPill } from "@/components/vendor/ui";
import { Icon } from "@/components/vendor/Icon";
import { PaymentDrawer } from "@/components/earnings/PaymentDrawer";

// The Earnings ledger (DECISIONS 2026-10-17): every booking and every
// payment on it, as the signed contracts set them. One row per payment,
// grouped by the month it's due or by booking; each opens a drawer with its
// history and the contract as proof.

type Period = "this" | "last" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "this", label: "This year" },
  { value: "last", label: "Last year" },
  { value: "all", label: "All time" },
];

function isTab(v: string | null): v is LedgerTab {
  return TABS.some((t) => t.value === v);
}

export function LedgerView() {
  const params = useSearchParams();
  const initialTab = params.get("tab");
  const [period, setPeriod] = useState<Period>("this");
  const [tab, setTab] = useState<LedgerTab>(isTab(initialTab) ? initialTab : "all");
  const [view, setView] = useState<"date" | "booking">("date");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<{ id: string; proof: boolean } | null>(null);
  // Kept with the period it was loaded for, so switching reads as loading.
  const [loaded, setLoaded] = useState<{ period: Period; ledger: Ledger | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const thisYear = new Date().getUTCFullYear();
  useEffect(() => {
    let cancelled = false;
    getLedger(period === "all" ? undefined : period === "this" ? thisYear : thisYear - 1)
      .then((ledger) => !cancelled && setLoaded({ period, ledger, error: null }))
      .catch((err) => !cancelled && setLoaded({ period, ledger: null, error: err instanceof ApiError ? err.message : "Couldn't load your earnings." }));
    return () => {
      cancelled = true;
    };
  }, [period, thisYear, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  const current = loaded && loaded.period === period ? loaded : null;
  const ledger = current?.ledger ?? null;
  const shown = useMemo(
    () => (ledger ? ledger.rows.filter((r) => inTab(r, tab) && matchesSearch(r, search)) : []),
    [ledger, tab, search],
  );
  const every = useMemo(() => (ledger ? [...ledger.rows, ...ledger.other_rows] : []), [ledger]);
  const openRow = open ? every.find((r) => r.row_id === open.id) ?? null : null;

  const year = period === "this" ? thisYear : period === "last" ? thisYear - 1 : null;
  const receivedLabel = year ? `Received in ${year}` : "Received, all time";

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(shown)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `jorna-earnings-${year ?? "all-time"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function rowAction(row: LedgerRow, kind: "confirm" | "remind") {
    if (!row.installment_id) return;
    setBusy(`${kind}:${row.row_id}`);
    setRowError(null);
    try {
      if (kind === "confirm") await confirmInstallment(row.booking_id, row.installment_id);
      else await remindPayment(row.booking_id, row.installment_id);
      reload();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const methods = ledger?.payment_methods;
  const ways = methods
    ? [methods.zelle ? `Zelle (${methods.zelle})` : null, methods.venmo ? `Venmo (${methods.venmo})` : null].filter(Boolean)
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Earnings"
        subtitle="Every booking and every payment, as your contracts set them."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Period" className="flex gap-0.5 rounded-[9px] bg-panel p-[3px]">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={period === p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`rounded-[7px] px-3 py-1.5 text-xs font-semibold ${
                    period === p.value ? "bg-card text-ink shadow-[0_2px_7px_rgba(45,40,35,0.07)] ring-1 ring-card-edge" : "text-ink-faint hover:text-ink-soft"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="md" disabled={!shown.length} onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        }
      />

      {methods ? (
        <p className={`-mt-4 mb-6 text-sm ${ways.length ? "text-ink-soft" : "text-maroon dark:text-gold"}`}>
          {ways.length ? `Clients pay you by ${ways.join(" or ")}` : "Clients don't know how to pay you yet — add Venmo or Zelle"} ·{" "}
          <Link href="/settings" className="font-semibold text-gold hover:underline">
            Edit
          </Link>
        </p>
      ) : null}

      {!current ? (
        <p className="py-20 text-center text-ink-soft">Loading…</p>
      ) : current.error || !ledger ? (
        <div className="py-20 text-center">
          <p className="text-ink-soft">{current.error}</p>
          <Button variant="ghost" className="mt-4" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-card-edge bg-card lg:grid-cols-4">
            {(
              [
                { tab: "received", label: receivedLabel, cents: ledger.totals.received_cents, note: null, tone: "text-green" },
                { tab: "to_come", label: "Still to come", cents: ledger.totals.to_come_cents, note: null, tone: "text-ink" },
                {
                  tab: "overdue",
                  label: "Overdue",
                  cents: ledger.totals.overdue_cents,
                  note: `${ledger.totals.overdue_count} payment${ledger.totals.overdue_count === 1 ? "" : "s"}`,
                  tone: ledger.totals.overdue_cents > 0 ? "text-maroon dark:text-gold" : "text-ink",
                },
                {
                  tab: "waiting",
                  label: "Waiting on you",
                  cents: ledger.totals.waiting_cents,
                  note: `${ledger.totals.waiting_count} payment${ledger.totals.waiting_count === 1 ? "" : "s"} to confirm`,
                  tone: "text-ink",
                },
              ] as const
            ).map((f) => (
              <button
                key={f.tab}
                type="button"
                aria-pressed={tab === f.tab}
                onClick={() => {
                  setTab(f.tab);
                  setView("date");
                }}
                className={`border-card-edge p-4 text-left transition hover:bg-ground-2 [&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0 [&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r ${
                  tab === f.tab ? "bg-ground-2" : ""
                }`}
              >
                <span className="block text-xs font-semibold text-ink-faint">{f.label}</span>
                <span className={`serif mt-1 block text-xl tabular-nums ${f.tone}`}>{money(f.cents)}</span>
                {f.note ? <span className="mt-0.5 block text-xs text-ink-faint">{f.note}</span> : null}
              </button>
            ))}
          </section>

          <section aria-label="Ledger" className="mt-4 rounded-2xl border border-card-edge bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="flex flex-wrap items-center gap-3 pb-4">
              <FilterTabs<LedgerTab> label="Payments" value={tab} onChange={setTab} options={TABS} />
              <label className="relative min-w-[12rem] flex-1">
                <span className="sr-only">Search by client or event</span>
                <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Client or event"
                  className="w-full rounded-xl border border-card-edge bg-ground-2 py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-gold"
                />
              </label>
              <div role="group" aria-label="View" className="flex gap-0.5 rounded-[9px] bg-panel p-[3px]">
                {(["date", "booking"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`rounded-[7px] px-3 py-1.5 text-xs font-semibold ${
                      view === v ? "bg-card text-ink ring-1 ring-card-edge" : "text-ink-faint hover:text-ink-soft"
                    }`}
                  >
                    {v === "date" ? "By date" : "By booking"}
                  </button>
                ))}
              </div>
            </div>

            {rowError ? (
              <p role="alert" className="mb-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                {rowError}
              </p>
            ) : null}

            {shown.length === 0 ? (
              <Empty
                kind={ledger.rows.length === 0 ? (period === "all" ? "new" : "year") : "filters"}
                year={year}
                onClear={() => {
                  setTab("all");
                  setSearch("");
                }}
                onAllTime={() => setPeriod("all")}
              />
            ) : view === "date" ? (
              <ByDate rows={shown} busy={busy} onOpen={(id, proof) => setOpen({ id, proof })} onAction={rowAction} />
            ) : (
              <ByBooking rows={shown} every={every} onOpen={(id) => setOpen({ id, proof: false })} />
            )}
          </section>
        </>
      )}

      <PaymentDrawer
        key={open?.id ?? "none"}
        row={openRow}
        showProof={open?.proof ?? false}
        onClose={() => setOpen(null)}
        onChanged={reload}
      />
    </div>
  );
}

function Empty({
  kind,
  year,
  onClear,
  onAllTime,
}: {
  kind: "new" | "year" | "filters";
  year: number | null;
  onClear: () => void;
  onAllTime: () => void;
}) {
  return (
    <div className="grid justify-items-center gap-2 py-14 text-center">
      <Icon name="contract" size={26} className="text-ink-faint" />
      {kind === "new" ? (
        <>
          <p className="font-semibold text-ink">No bookings yet.</p>
          <p className="max-w-[40ch] text-sm text-ink-soft">When a client signs your contract, every payment on it shows up here.</p>
        </>
      ) : kind === "year" ? (
        <>
          <p className="font-semibold text-ink">Nothing due in {year}.</p>
          <Button variant="ghost" size="md" onClick={onAllTime}>
            See all time
          </Button>
        </>
      ) : (
        <>
          <p className="font-semibold text-ink">Nothing matches these filters.</p>
          <Button variant="ghost" size="md" onClick={onClear}>
            Clear filters
          </Button>
        </>
      )}
    </div>
  );
}

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 md:grid-cols-[4.5rem_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(9rem,1fr)_6.5rem_6.5rem_8rem] md:items-center";

function ByDate({
  rows,
  busy,
  onOpen,
  onAction,
}: {
  rows: LedgerRow[];
  busy: string | null;
  onOpen: (id: string, proof: boolean) => void;
  onAction: (row: LedgerRow, kind: "confirm" | "remind") => void;
}) {
  return (
    <div className="-mx-4 sm:-mx-5">
      <div className={`${ROW_GRID} hidden border-y border-line-soft bg-ground-2 px-5 py-2 text-xs font-semibold text-ink-faint md:grid`}>
        <span>Due</span>
        <span>Client &amp; event</span>
        <span>Payment</span>
        <span>Status</span>
        <span className="text-right">Expected</span>
        <span className="text-right">Received</span>
        <span>Contract</span>
      </div>
      {byMonth(rows).map((month) => (
        <section key={month.key} aria-label={month.label}>
          <h3 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft bg-panel px-5 py-2 text-sm font-semibold text-ink">
            {month.label}
            <span className="text-xs font-normal text-ink-faint">
              Expected this month <b className="font-semibold text-ink tabular-nums">{money(month.expectedCents)}</b>
            </span>
          </h3>
          {month.rows.map((row) => (
            <LedgerLine key={row.row_id} row={row} busy={busy} onOpen={onOpen} onAction={onAction} />
          ))}
        </section>
      ))}
    </div>
  );
}

function LedgerLine({
  row,
  busy,
  onOpen,
  onAction,
}: {
  row: LedgerRow;
  busy: string | null;
  onOpen: (id: string, proof: boolean) => void;
  onAction: (row: LedgerRow, kind: "confirm" | "remind") => void;
}) {
  const s = STATUS[row.status];
  const b = row.booking;
  const cancelled = row.status === "cancelled";
  const reminded = row.reminded_at ? shortDate(row.reminded_at) : null;
  return (
    <div
      data-status={row.status}
      className={`${ROW_GRID} relative border-b border-line-soft px-5 py-3 text-sm transition hover:bg-ground-2 ${
        row.status === "overdue" ? "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-maroon dark:before:bg-gold" : ""
      } ${cancelled ? "text-ink-faint" : "text-ink"}`}
    >
      <span className="order-5 text-xs text-ink-faint md:order-none md:text-sm md:text-ink">
        <span className="md:hidden">Due </span>
        {row.due_on ? shortDate(row.due_on) : "—"}
        {row.status === "received" && row.confirmed_at ? (
          <span className="block text-xs text-green">Received {shortDate(row.confirmed_at)}</span>
        ) : null}
      </span>
      {/* The row's one big target: everything else in the row is its own button. */}
      <button
        type="button"
        onClick={() => onOpen(row.row_id, false)}
        className="order-1 min-w-0 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-gold md:order-none"
      >
        <span className="block truncate font-semibold">{b.client_name}</span>
        <span className="block truncate text-xs text-ink-faint">{[b.event_name, b.location].filter(Boolean).join(" · ")}</span>
      </button>
      <span className="order-3 min-w-0 md:order-none">
        <span className="block truncate">{row.label}</span>
        <span className="block text-xs text-ink-faint">{row.installment_id ? `${row.sequence} of ${row.count}` : "no schedule"}</span>
      </span>
      <span className="relative z-10 order-4 flex max-w-[9.5rem] flex-wrap items-center justify-end gap-1.5 justify-self-end md:order-none md:max-w-none md:justify-start md:justify-self-start">
        <StatusPill tone={s.tone} dot={!cancelled}>
          {s.label}
        </StatusPill>
        {row.status === "client_says_sent" && row.installment_id ? (
          <button
            type="button"
            disabled={busy != null}
            onClick={() => onAction(row, "confirm")}
            className="rounded-full border border-gold px-2.5 py-0.5 text-xs font-semibold text-gold hover:bg-gold/10"
          >
            {busy === `confirm:${row.row_id}` ? "Confirming…" : "Confirm received"}
          </button>
        ) : null}
        {row.status === "overdue" && row.installment_id ? (
          row.can_remind ? (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => onAction(row, "remind")}
              className="rounded-full border border-maroon px-2.5 py-0.5 text-xs font-semibold text-maroon hover:bg-maroon/10 dark:border-gold dark:text-gold"
            >
              {busy === `remind:${row.row_id}` ? "Sending…" : "Remind client"}
            </button>
          ) : reminded ? (
            <span className="text-xs text-ink-faint">Reminded {reminded}</span>
          ) : null
        ) : null}
      </span>
      <span className={`order-2 text-right font-semibold tabular-nums md:order-none md:font-normal ${cancelled ? "line-through" : ""}`}>{money(row.amount_cents)}</span>
      <span className="hidden text-right tabular-nums text-green md:block">{row.status === "received" ? money(row.amount_cents) : <span className="text-ink-faint">—</span>}</span>
      <span className="relative z-10 order-6 justify-self-end md:order-none md:justify-self-start">
        {b.has_contract ? (
          <button type="button" onClick={() => onOpen(row.row_id, true)} className="inline-flex items-center gap-1.5 text-left text-xs font-semibold text-gold hover:underline">
            <Icon name="contract" size={14} />
            <span>
              Contract
              {b.signed_at ? <span className="block font-normal text-ink-faint">signed {shortDate(b.signed_at.slice(0, 10))}</span> : null}
            </span>
          </button>
        ) : (
          <span className="text-xs text-ink-faint">Booking · no contract</span>
        )}
      </span>
    </div>
  );
}

function ByBooking({ rows, every, onOpen }: { rows: LedgerRow[]; every: LedgerRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid gap-3">
      {byBooking(rows, every).map((card) => {
        const b = card.booking;
        const cancelled = b.state === "cancelled";
        return (
          <article key={b.booking_id} aria-label={`${b.client_name}, ${b.event_name ?? "booking"}`} className="rounded-xl border border-card-edge">
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line-soft px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{b.client_name}</p>
                <p className="text-xs text-ink-faint">{[b.event_name, shortDate(b.event_date), b.location].filter(Boolean).join(" · ")}</p>
              </div>
              <StatusPill tone={cancelled ? "grey" : b.state === "done" ? "green" : "amber"}>
                {cancelled ? "Cancelled" : b.state === "done" ? "Done" : "Upcoming"}
              </StatusPill>
            </header>
            <ul>
              {card.rows.map((row) => (
                <li key={row.row_id}>
                  <button
                    type="button"
                    onClick={() => onOpen(row.row_id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line-soft px-4 py-2.5 text-left text-sm hover:bg-ground-2 sm:grid-cols-[minmax(0,1fr)_5rem_9rem_6.5rem]"
                  >
                    <span className="min-w-0 truncate text-ink">
                      {row.label} <span className="text-xs text-ink-faint">{row.installment_id ? `${row.sequence} of ${row.count}` : ""}</span>
                    </span>
                    <span className="text-xs text-ink-faint sm:text-sm">{row.due_on ? shortDate(row.due_on) : "—"}</span>
                    <span>
                      <StatusPill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusPill>
                    </span>
                    <span className={`text-right tabular-nums ${row.status === "cancelled" ? "line-through text-ink-faint" : "text-ink"}`}>
                      {money(row.amount_cents)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-ink-soft">
              <span className="tabular-nums">
                {b.total_cents != null ? <>Contract total <b className="text-ink">{money(b.total_cents)}</b> · </> : null}
                Received <b className="text-green">{money(card.receivedCents)}</b>
                {cancelled ? (
                  <> · Cancelled <b className="text-ink">{money(card.cancelledCents)}</b></>
                ) : (
                  <>
                    {card.overdueCents > 0 ? <> · Overdue <b className="text-maroon dark:text-gold">{money(card.overdueCents)}</b></> : null}
                    {" "}· Still to come <b className="text-ink">{money(card.toComeCents)}</b>
                  </>
                )}
              </span>
              {b.has_contract ? (
                <Link href={`/contracts/view?id=${b.booking_id}`} className="font-semibold text-gold hover:underline">
                  View signed contract
                  {b.addenda_count > 0 ? ` · ${b.addenda_count === 1 ? "1 addendum" : `${b.addenda_count} addenda`}` : ""}
                </Link>
              ) : (
                <span>Booked before contracts</span>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

