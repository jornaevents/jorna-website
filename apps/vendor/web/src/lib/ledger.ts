import type { Tone } from "@/components/vendor/ui";
import type { LedgerBooking, LedgerRow, LedgerStatus, PaidVia } from "@/lib/types";

// The Earnings ledger's reading of the backend's rows (DECISIONS #33 there):
// which tab a row is in, how rows group by month and by booking, what a
// payment's history says, and the CSV. The backend decides each row's
// status; nothing here second-guesses it.

export type LedgerTab = "all" | "to_come" | "overdue" | "waiting" | "received" | "cancelled";

export const TABS: { value: LedgerTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "to_come", label: "To come" },
  { value: "overdue", label: "Overdue" },
  { value: "waiting", label: "Waiting on you" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

export const STATUS: Record<LedgerStatus, { label: string; tone: Tone }> = {
  overdue: { label: "Overdue", tone: "red" },
  client_says_sent: { label: "Client says sent", tone: "amber" },
  due_soon: { label: "Due soon", tone: "amber" },
  scheduled: { label: "Scheduled", tone: "grey" },
  received: { label: "Received", tone: "green" },
  cancelled: { label: "Cancelled", tone: "grey" },
};

export const PAID_VIA_LABEL: Record<PaidVia, string> = { venmo: "Venmo", zelle: "Zelle", other: "another way" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Cents as dollars and cents: a ledger shows what the contract says, to the cent. */
export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

/** "2026-10-10" → "Oct 10". Calendar dates, read without a time zone. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

/** An event's moment in the reader's own time: "Oct 10, 8:46 PM". */
export function momentLabel(iso: string): string {
  const at = new Date(iso);
  const date = at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function inTab(row: LedgerRow, tab: LedgerTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "to_come":
      return row.status === "scheduled" || row.status === "due_soon";
    case "waiting":
      return row.status === "client_says_sent";
    default:
      return row.status === tab;
  }
}

export function matchesSearch(row: LedgerRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const b = row.booking;
  return [b.client_name, b.event_name, b.location].some((v) => v?.toLowerCase().includes(q));
}

export interface MonthGroup {
  key: string;
  label: string;
  rows: LedgerRow[];
  /** What the month's payments add up to, leaving out cancelled ones. */
  expectedCents: number;
}

/** Rows by the month they're due — a received payment stays where it was
 *  due, so confirming one never moves it. */
export function byMonth(rows: LedgerRow[]): MonthGroup[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const key = row.due_on ? row.due_on.slice(0, 7) : "none";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "none" ? 1 : b === "none" ? -1 : a.localeCompare(b)))
    .map(([key, list]) => ({
      key,
      label: key === "none" ? "No date" : `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
      rows: [...list].sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? "") || a.sequence - b.sequence),
      expectedCents: list.filter((r) => r.status !== "cancelled").reduce((sum, r) => sum + r.amount_cents, 0),
    }));
}

export interface BookingGroup {
  booking: LedgerBooking;
  /** The booking's whole schedule, whatever the filters, so it adds up. */
  rows: LedgerRow[];
  receivedCents: number;
  overdueCents: number;
  toComeCents: number;
  cancelledCents: number;
}

/** One card per booking that has a shown row, newest event first. */
export function byBooking(shown: LedgerRow[], every: LedgerRow[]): BookingGroup[] {
  const ids = new Set(shown.map((r) => r.booking_id));
  const groups = new Map<string, LedgerRow[]>();
  for (const row of every) {
    if (ids.has(row.booking_id)) groups.set(row.booking_id, [...(groups.get(row.booking_id) ?? []), row]);
  }
  const sum = (rows: LedgerRow[], statuses: LedgerStatus[]) =>
    rows.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.amount_cents, 0);
  return [...groups.values()]
    .map((rows) => {
      const sorted = [...rows].sort((a, b) => a.sequence - b.sequence);
      return {
        booking: sorted[0].booking,
        rows: sorted,
        receivedCents: sum(sorted, ["received"]),
        overdueCents: sum(sorted, ["overdue"]),
        toComeCents: sum(sorted, ["scheduled", "due_soon", "client_says_sent"]),
        cancelledCents: sum(sorted, ["cancelled"]),
      };
    })
    .sort((a, b) => b.booking.event_date.localeCompare(a.booking.event_date));
}

/** When a payment is due, as the contract put it. */
export function dueRule(row: LedgerRow): string {
  if (row.installment_id === null) return "the event date";
  if (row.due_type === "on_signing") return "on signing";
  if (row.due_type === "before_event" && row.due_days != null) {
    return row.due_days === 0 ? "the day of the event" : `${row.due_days} day${row.due_days === 1 ? "" : "s"} before the event`;
  }
  return "a date set in the contract";
}

export interface HistoryLine {
  /** For ordering: an ISO date or moment. */
  at: string;
  text: string;
  done?: boolean;
}

/** A payment's history in date order: when it was due, then everything
 *  that happened to it. */
export function history(row: LedgerRow): HistoryLine[] {
  const who = firstName(row.booking.client_name);
  const lines: HistoryLine[] = [];
  if (row.due_on) lines.push({ at: row.due_on, text: `Due ${shortDate(row.due_on)} — ${dueRule(row)}` });
  for (const e of row.events) {
    const when = momentLabel(e.at);
    if (e.kind === "payment_marked") {
      const by = e.paid_via ? ` by ${PAID_VIA_LABEL[e.paid_via]}` : "";
      lines.push({ at: e.at, text: `${who} says it's sent${by} · ${when}` });
    } else if (e.kind === "payment_confirmed") {
      lines.push({ at: e.at, text: `You confirmed it · ${when}`, done: true });
    } else if (e.kind === "payment_reminder") {
      const text =
        e.reminder === "manual"
          ? `We reminded ${who} by email · ${when}`
          : e.reminder === "overdue"
            ? `We let you know it was overdue · ${when}`
            : `We emailed ${who} a reminder · ${when}`;
      lines.push({ at: e.at, text });
    } else if (e.kind === "payment_not_received") {
      const text =
        e.step === "unmarked" ? `You told ${who} it hasn't arrived · ${when}` : `You took back your confirmation · ${when}`;
      lines.push({ at: e.at, text });
    }
  }
  // A booking from before contracts has no events, only its own stamps.
  if (row.installment_id === null && row.confirmed_at) {
    lines.push({ at: row.confirmed_at, text: `You confirmed it · ${momentLabel(row.confirmed_at)}`, done: true });
  }
  return lines.sort((a, b) => a.at.localeCompare(b.at));
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Exactly the rows shown, one line each. */
export function toCsv(rows: LedgerRow[]): string {
  const header = ["Due date", "Client", "Event", "Payment", "Status", "Expected", "Received", "Received on", "Paid by", "Contract"];
  const lines = rows.map((r) =>
    [
      r.due_on,
      r.booking.client_name,
      r.booking.event_name,
      r.label,
      STATUS[r.status].label,
      (r.amount_cents / 100).toFixed(2),
      r.status === "received" ? (r.amount_cents / 100).toFixed(2) : "",
      r.status === "received" && r.confirmed_at ? r.confirmed_at.slice(0, 10) : "",
      r.paid_via ? PAID_VIA_LABEL[r.paid_via] : "",
      r.booking.contract_title ?? "No contract",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
