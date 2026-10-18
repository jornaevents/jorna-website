import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { ApiMock, HandlerArgs } from "./support/api-mock";
import type { LedgerBooking } from "../src/lib/types";

// The Earnings ledger with escrow off, as production runs (DECISIONS
// 2026-10-17): one row per payment, each tied to its contract. Runs against
// the escrow-off dev server (playwright.config.ts).

const YEAR = new Date().getUTCFullYear();
const Y = String(YEAR);

const PRIYA: LedgerBooking = {
  booking_id: "b-priya",
  client_name: "Priya Shah",
  event_name: "Sangeet",
  event_date: `${Y}-12-24`,
  event_date_end: null,
  location: "Edison, NJ",
  state: "upcoming",
  total_cents: 480_000,
  has_contract: true,
  contract_title: "Sangeet Photography Agreement",
  signed_at: `${Y}-09-14T15:00:00+00:00`,
  signed_by: "Priya Shah",
  addenda_count: 1,
  cancellation_document_id: null,
};
const ROHAN: LedgerBooking = { ...PRIYA, booking_id: "b-rohan", client_name: "Rohan Gupta", event_name: "Reception", location: "Newark, NJ", event_date: `${Y}-10-01`, state: "done", total_cents: 300_000, addenda_count: 0, contract_title: "Reception Agreement" };
const SANA: LedgerBooking = { ...PRIYA, booking_id: "b-sana", client_name: "Sana Iqbal", event_name: "Engagement", location: "Hoboken, NJ", event_date: `${Y}-12-12`, state: "cancelled", total_cents: 240_000, addenda_count: 0, cancellation_document_id: "doc-cancel", contract_title: "Engagement Agreement" };
const KAVYA: LedgerBooking = { ...PRIYA, booking_id: "b-kavya", client_name: "Kavya Menon", event_name: "Haldi", location: "Montclair, NJ", event_date: `${Y}-08-16`, state: "done", total_cents: 160_000, has_contract: false, contract_title: null, signed_at: null, signed_by: null, addenda_count: 0 };

function row(booking: LedgerBooking, o: Record<string, unknown>) {
  const installment = (o.installment_id as string | null | undefined) ?? "i1";
  return {
    row_id: `${booking.booking_id}:${installment ?? "full"}`,
    booking_id: booking.booking_id,
    installment_id: installment,
    label: "Deposit",
    sequence: 1,
    count: 3,
    amount_cents: 120_000,
    due_on: `${Y}-09-14`,
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
    booking,
    ...o,
  };
}

function rows() {
  return [
    row(PRIYA, { status: "received", confirmed_at: `${Y}-09-16T12:00:00+00:00`, marked_by_client: true, paid_via: "zelle", can_undo: true,
      events: [{ at: `${Y}-09-15T13:12:00+00:00`, kind: "payment_marked", actor: "client", paid_via: "zelle" }, { at: `${Y}-09-16T12:00:00+00:00`, kind: "payment_confirmed", actor: "vendor" }] }),
    row(PRIYA, { installment_id: "i2", label: "Second payment", sequence: 2, amount_cents: 180_000, due_on: `${Y}-10-10`, due_type: "before_event", due_days: 14,
      status: "client_says_sent", marked_paid_at: `${Y}-10-10T20:46:00+00:00`, marked_by_client: true, paid_via: "zelle", can_undo: true,
      events: [{ at: `${Y}-10-10T20:46:00+00:00`, kind: "payment_marked", actor: "client", paid_via: "zelle" }] }),
    row(PRIYA, { installment_id: "i3", label: "Balance", sequence: 3, amount_cents: 180_000, due_on: `${Y}-12-17`, due_type: "before_event", due_days: 7 }),
    row(ROHAN, { installment_id: "r2", label: "Balance", sequence: 2, count: 2, amount_cents: 150_000, due_on: `${Y}-09-24`, status: "overdue", can_remind: true }),
    row(SANA, { installment_id: "s1", count: 2, amount_cents: 60_000, due_on: `${Y}-05-05`, status: "received", confirmed_at: `${Y}-05-06T12:00:00+00:00` }),
    row(SANA, { installment_id: "s2", label: "Balance", sequence: 2, count: 2, amount_cents: 180_000, due_on: `${Y}-11-28`, status: "cancelled" }),
    row(KAVYA, { installment_id: null, label: "Full amount", count: 1, amount_cents: 160_000, due_on: `${Y}-08-16`, due_type: "date", status: "received", confirmed_at: `${Y}-08-09T12:00:00+00:00` }),
  ];
}

function totals(list: ReturnType<typeof rows>) {
  const sum = (s: string[]) => list.filter((r) => s.includes(r.status as string));
  const t = (s: string[]) => [sum(s).reduce((a, r) => a + (r.amount_cents as number), 0), sum(s).length];
  const [received_cents, received_count] = t(["received"]);
  const [to_come_cents, to_come_count] = t(["scheduled", "due_soon"]);
  const [overdue_cents, overdue_count] = t(["overdue"]);
  const [waiting_cents, waiting_count] = t(["client_says_sent"]);
  return { received_cents, received_count, to_come_cents, to_come_count, overdue_cents, overdue_count, waiting_cents, waiting_count };
}

/** The ledger, kept as state so actions show up on the reload. */
function mockLedger(api: ApiMock, list = rows()) {
  api.get("/vendors/me", mockVendorDetail());
  api.get("/vendors/me/ledger", ({ url }: HandlerArgs) => {
    const year = url.searchParams.get("year");
    const shown = list.filter((r) => !year || (r.due_on as string).startsWith(year));
    return {
      year: year ? Number(year) : null,
      today: `${Y}-10-17`,
      rows: shown,
      other_rows: [],
      totals: totals(shown),
      payment_methods: { venmo: "@priyaphoto", zelle: "priya.photo@gmail.com" },
    };
  });
  return list;
}

test.describe("earnings ledger (escrow off)", () => {
  test("a summary that filters, months by due date, and how clients pay", async ({ page, api }) => {
    await loginAs(page, api);
    mockLedger(api);
    await page.goto("my-earnings/");

    await expect(page.getByText("Clients pay you by Zelle (priya.photo@gmail.com) or Venmo (@priyaphoto)")).toBeVisible();
    const summary = page.getByRole("region", { name: "Summary" });
    await expect(summary.getByRole("button", { name: new RegExp(`Received in ${Y}`) })).toContainText("$3,400.00");
    await expect(summary.getByRole("button", { name: /Overdue/ })).toContainText("1 payment");
    await expect(summary.getByRole("button", { name: /Waiting on you/ })).toContainText("1 payment to confirm");

    const ledger = page.getByRole("region", { name: "Ledger" });
    const october = ledger.getByRole("region", { name: `October ${Y}` });
    await expect(october).toContainText("Expected this month $1,800.00");
    // Received stays where it was due, with when it arrived.
    await expect(ledger.getByRole("region", { name: `September ${Y}` })).toContainText("Received Sep 16");
    // A cancelled payment isn't expected.
    await expect(ledger.getByRole("region", { name: `November ${Y}` })).toContainText("Expected this month $0.00");

    await summary.getByRole("button", { name: /Overdue/ }).click();
    await expect(ledger.getByText("Rohan Gupta")).toBeVisible();
    await expect(ledger.getByText("Priya Shah")).toHaveCount(0);
  });

  test("confirming and reminding from the row", async ({ page, api }) => {
    await loginAs(page, api);
    const list = mockLedger(api);
    api.post("/contracts/b-priya/payments/i2/confirm", () => {
      Object.assign(list[1], { status: "received", confirmed_at: `${Y}-10-17T12:00:00+00:00` });
      return {};
    });
    api.post("/contracts/b-rohan/payments/r2/remind", () => {
      Object.assign(list[3], { can_remind: false, reminded_at: `${Y}-10-17T12:00:00+00:00` });
      return list[3];
    });
    await page.goto("my-earnings/");
    const ledger = page.getByRole("region", { name: "Ledger" });

    await ledger.getByRole("button", { name: "Confirm received" }).click();
    await expect(ledger.getByRole("button", { name: "Confirm received" })).toHaveCount(0);
    expect(api.requestsTo("POST", "/contracts/b-priya/payments/i2/confirm")).toHaveLength(1);

    await ledger.getByRole("button", { name: "Remind client" }).click();
    await expect(ledger.getByText("Reminded Oct 17")).toBeVisible();
    await expect(ledger.getByRole("button", { name: "Remind client" })).toHaveCount(0);
  });

  test("the drawer shows the history and the contract, and undoes one step after asking", async ({ page, api }) => {
    await loginAs(page, api);
    const list = mockLedger(api);
    api.post("/contracts/b-priya/payments/i2/not-received", () => {
      Object.assign(list[1], { status: "due_soon", marked_paid_at: null, paid_via: null, marked_by_client: false, can_undo: false });
      return list[1];
    });
    await page.goto("my-earnings/");
    const ledger = page.getByRole("region", { name: "Ledger" });

    await ledger.getByRole("button", { name: /Priya Shah/ }).nth(1).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Due Oct 10 — 14 days before the event")).toBeVisible();
    await expect(drawer.getByText(/Priya says it's sent by Zelle/)).toBeVisible();
    await expect(drawer.getByText("Sangeet Photography Agreement")).toBeVisible();
    await expect(drawer.getByText(/Second payment — \$1,800\.00, due Oct 10/)).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Open contract" })).toHaveAttribute("href", /contracts\/view\/?\?id=b-priya/);
    await expect(drawer.getByText(/1 addendum on this booking/)).toBeVisible();

    await drawer.getByRole("button", { name: "I haven't received it" }).click();
    await expect(drawer.getByText("Tell Priya you haven't received it? Their mark is cleared and we email them.")).toBeVisible();
    expect(api.requestsTo("POST", "/contracts/b-priya/payments/i2/not-received")).toHaveLength(0);
    await drawer.getByRole("button", { name: "Move it back" }).click();
    await expect(drawer.getByText("We've told Priya it hasn't arrived.")).toBeVisible();
    await expect(drawer.getByText("Due soon")).toBeVisible();
  });

  test("undoing a confirmation says where it goes back to", async ({ page, api }) => {
    await loginAs(page, api);
    mockLedger(api);
    await page.goto("my-earnings/");
    // Priya marked her deposit herself, so it goes back to waiting.
    await page.getByRole("region", { name: "Ledger" }).getByRole("button", { name: /Priya Shah/ }).first().click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Mark as not received" }).click();
    await expect(drawer.getByText("Undo your confirmation? It goes back to waiting for you, since Priya said it's sent.")).toBeVisible();
    await drawer.getByRole("button", { name: "Cancel" }).click();
    await expect(drawer.getByRole("button", { name: "Mark as not received" })).toBeVisible();
  });

  test("the Contract link opens the proof; a booking from before contracts says why there's none", async ({ page, api }) => {
    await loginAs(page, api);
    mockLedger(api);
    await page.goto("my-earnings/");
    const ledger = page.getByRole("region", { name: "Ledger" });
    await expect(ledger.getByText("Booking · no contract")).toBeVisible();
    await ledger.getByRole("button", { name: /Kavya Menon/ }).click();
    await expect(page.getByRole("dialog").getByText("Booked before Jorna had contracts, so there's no signed copy.")).toBeVisible();
    await page.keyboard.press("Escape");

    await ledger.getByRole("button", { name: /^Contract/ }).first().click();
    await expect(page.getByRole("dialog").getByRole("region", { name: "Proof" })).toBeInViewport();
  });

  test("by booking: whole schedules, overdue and cancelled footers", async ({ page, api }) => {
    await loginAs(page, api);
    mockLedger(api);
    await page.goto("my-earnings/");
    await page.getByRole("button", { name: "By booking" }).click();

    const priya = page.getByRole("article", { name: "Priya Shah, Sangeet" });
    await expect(priya.getByRole("listitem")).toHaveCount(3);
    await expect(priya).toContainText("Contract total $4,800.00 · Received $1,200.00 · Still to come $3,600.00");
    await expect(page.getByRole("article", { name: "Rohan Gupta, Reception" })).toContainText("Overdue $1,500.00");
    await expect(page.getByRole("article", { name: "Rohan Gupta, Reception" })).toContainText("Done");
    await expect(page.getByRole("article", { name: "Sana Iqbal, Engagement" })).toContainText("Received $600.00 · Cancelled $1,800.00");
  });

  test("search, empty states, other years and the CSV", async ({ page, api }) => {
    await loginAs(page, api);
    mockLedger(api);
    await page.goto("my-earnings/");
    const ledger = page.getByRole("region", { name: "Ledger" });

    await ledger.getByPlaceholder("Client or event").fill("haldi");
    await expect(ledger.getByText("Kavya Menon")).toBeVisible();
    await ledger.getByPlaceholder("Client or event").fill("nobody");
    await expect(ledger.getByText("Nothing matches these filters.")).toBeVisible();
    await ledger.getByRole("button", { name: "Clear filters" }).click();
    await expect(ledger.getByText("Priya Shah").first()).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`jorna-earnings-${YEAR}.csv`);
    const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
    expect(text.split("\n")[0]).toBe("Due date,Client,Event,Payment,Status,Expected,Received,Received on,Paid by,Contract");
    expect(text).toContain(`${Y}-09-14,Priya Shah,Sangeet,Deposit,Received,1200.00,1200.00,${Y}-09-16,Zelle,Sangeet Photography Agreement`);

    await page.getByRole("button", { name: "Last year" }).click();
    await expect(ledger.getByText(`Nothing due in ${YEAR - 1}.`)).toBeVisible();
    await ledger.getByRole("button", { name: "See all time" }).click();
    await expect(page.getByRole("region", { name: "Summary" })).toContainText("Received, all time");
  });

  test("a phone keeps the contract link on every row", async ({ page, api }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, api);
    mockLedger(api);
    await page.goto("my-earnings/");
    const ledger = page.getByRole("region", { name: "Ledger" });
    await expect(ledger.getByRole("button", { name: /^Contract/ }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
