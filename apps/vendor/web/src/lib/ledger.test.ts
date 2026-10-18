import { describe, expect, it } from "vitest";
import { byBooking, byMonth, dueRule, history, inTab, matchesSearch, money, toCsv } from "./ledger";
import type { LedgerBooking, LedgerRow } from "./types";

const PRIYA: LedgerBooking = {
  booking_id: "b-priya",
  client_name: "Priya Shah",
  event_name: "Sangeet",
  event_date: "2026-10-24",
  event_date_end: null,
  location: "Edison, NJ",
  state: "upcoming",
  total_cents: 480_000,
  has_contract: true,
  contract_title: "Sangeet Photography Agreement",
  signed_at: "2026-09-14T15:00:00+00:00",
  signed_by: "Priya Shah",
  addenda_count: 0,
  cancellation_document_id: null,
};

function row(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    row_id: `b-priya:${overrides.installment_id ?? "i1"}`,
    booking_id: "b-priya",
    installment_id: "i1",
    label: "Deposit",
    sequence: 1,
    count: 3,
    amount_cents: 120_000,
    due_on: "2026-09-14",
    due_type: "on_signing",
    due_days: null,
    status: "scheduled",
    marked_paid_at: null,
    marked_by_client: false,
    paid_via: null,
    confirmed_at: null,
    reminded_at: null,
    can_remind: false,
    can_undo: false,
    events: [],
    booking: PRIYA,
    ...overrides,
  };
}

describe("ledger rows", () => {
  it("formats money to the cent", () => {
    expect(money(180_050)).toBe("$1,800.50");
  });

  it("puts waiting payments in their own tab and both kinds of upcoming in To come", () => {
    expect(inTab(row({ status: "client_says_sent" }), "waiting")).toBe(true);
    expect(inTab(row({ status: "due_soon" }), "to_come")).toBe(true);
    expect(inTab(row({ status: "scheduled" }), "to_come")).toBe(true);
    expect(inTab(row({ status: "overdue" }), "to_come")).toBe(false);
  });

  it("searches the client, the event and the place", () => {
    expect(matchesSearch(row(), "sangeet")).toBe(true);
    expect(matchesSearch(row(), "edison")).toBe(true);
    expect(matchesSearch(row(), "mehndi")).toBe(false);
  });
});

describe("by month", () => {
  it("groups by the month due, oldest first, and leaves cancelled payments out of the subtotal", () => {
    const groups = byMonth([
      row({ installment_id: "i3", due_on: "2026-11-28", amount_cents: 180_000, status: "cancelled" }),
      row({ installment_id: "i2", due_on: "2026-10-17", amount_cents: 180_000 }),
      row({ installment_id: "i1", due_on: "2026-10-10", amount_cents: 180_000, status: "received" }),
    ]);
    expect(groups.map((g) => [g.label, g.expectedCents])).toEqual([
      ["October 2026", 360_000],
      ["November 2026", 0],
    ]);
    expect(groups[0].rows.map((r) => r.installment_id)).toEqual(["i1", "i2"]);
  });
});

describe("by booking", () => {
  it("shows a booking's whole schedule and splits its footer", () => {
    const shown = [row({ installment_id: "i2", sequence: 2, status: "overdue", amount_cents: 180_000 })];
    const every = [
      ...shown,
      row({ installment_id: "i1", sequence: 1, status: "received", amount_cents: 120_000 }),
      row({ installment_id: "i3", sequence: 3, status: "scheduled", amount_cents: 180_000 }),
    ];
    const [card] = byBooking(shown, every);
    expect(card.rows.map((r) => r.sequence)).toEqual([1, 2, 3]);
    expect([card.receivedCents, card.overdueCents, card.toComeCents]).toEqual([120_000, 180_000, 180_000]);
  });
});

describe("a payment's history", () => {
  it("reads in date order, with how they paid", () => {
    const lines = history(
      row({
        due_on: "2026-10-10",
        due_type: "before_event",
        due_days: 14,
        events: [
          { at: "2026-10-12T14:00:00Z", kind: "payment_reminder", actor: "vendor", reminder: "manual" },
          { at: "2026-10-11T01:46:00Z", kind: "payment_marked", actor: "client", paid_via: "zelle" },
        ],
      }),
    ).map((l) => l.text);
    expect(lines[0]).toBe("Due Oct 10 — 14 days before the event");
    expect(lines[1]).toMatch(/^Priya says it's sent by Zelle · /);
    expect(lines[2]).toMatch(/^We reminded Priya by email · /);
  });

  it("says what each undo did", () => {
    const lines = history(
      row({
        events: [
          { at: "2026-10-12T14:00:00Z", kind: "payment_not_received", actor: "vendor", step: "unmarked" },
          { at: "2026-10-13T14:00:00Z", kind: "payment_not_received", actor: "vendor", step: "unconfirmed" },
        ],
      }),
    ).map((l) => l.text);
    expect(lines[1]).toMatch(/^You told Priya it hasn't arrived/);
    expect(lines[2]).toMatch(/^You took back your confirmation/);
  });

  it("names a booking from before contracts' due date as the event", () => {
    expect(dueRule(row({ installment_id: null }))).toBe("the event date");
  });
});

describe("CSV", () => {
  it("quotes what needs quoting and fills received only when received", () => {
    const csv = toCsv([
      row({ status: "received", confirmed_at: "2026-09-16T12:00:00Z", paid_via: "zelle" }),
      row({ installment_id: "i2", label: 'Second, "big" payment', status: "overdue" }),
    ]).split("\n");
    expect(csv[0]).toBe("Due date,Client,Event,Payment,Status,Expected,Received,Received on,Paid by,Contract");
    expect(csv[1]).toBe("2026-09-14,Priya Shah,Sangeet,Deposit,Received,1200.00,1200.00,2026-09-16,Zelle,Sangeet Photography Agreement");
    expect(csv[2]).toContain('"Second, ""big"" payment",Overdue,1200.00,,,');
  });
});
