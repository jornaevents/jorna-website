import { test, expect, loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Whose move it is, said the same way everywhere (#151, #165, #167, #170,
// #150): a contract with the client's changes waiting is the vendor's turn;
// money that's late or waiting to be confirmed reaches Overview; closed
// leads stay under Archived with how they ended.

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const waiting = { turn: "vendor", round: 2, waiting_vendor: 2, waiting_client: 0 };

test.describe("whose move", () => {
  test("Contracts: your turn, every row counted, who signed", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get("/contract-templates", { items: [], total: 0 });
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "asks", guest_name: "Asha Mehta", status: "approved", contract_token: "t1",
          contract_status: "viewed", negotiation: waiting, date_iso: isoInDays(200),
        }),
        mockVendorBooking({
          booking_id: "signed", guest_name: "Asha Mehta", status: "approved", contract_token: "t2",
          contract_status: "signed", signed_at: "2030-05-03T12:00:00Z", signer_name: "Bob Smith", date_iso: isoInDays(220),
        }),
        mockVendorBooking({
          booking_id: "no", guest_name: "Ravi Iyer", status: "rejected", contract_token: "t3",
          contract_status: "declined", date_iso: isoInDays(230),
        }),
      ],
      total: 3,
      limit: 100,
      offset: 0,
    });

    await page.goto("contracts/");
    const library = page.getByRole("region", { name: "Document library" });
    await expect(library.getByRole("tab", { name: /All/ })).toContainText("3");
    const asks = library.getByRole("listitem").filter({ hasText: "Asha Mehta asked for 2 changes" });
    await expect(asks.getByText("Your turn")).toBeVisible();
    await expect(asks.getByRole("link", { name: "Answer", exact: true })).toBeVisible();
    await expect(library.getByText(/Signed by Bob Smith .* — the contract is for Asha Mehta/)).toBeVisible();
    const declined = library.getByRole("listitem").filter({ hasText: "Ravi Iyer" });
    await expect(declined.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  });

  test("the contract page puts the client's changes first, and a negotiation reads as one", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    const at = "2030-05-02T12:00:00";
    api.get("/contracts/c-1", {
      booking_id: "c-1", vendor_id: "v", service_name: "Coverage", date_iso: "2030-06-25", date_end: null,
      time_start: "18:00", time_end: "23:00", location: "Pines Manor", guest_count: 150, amount_cents: 250000,
      line_items: [], payment_schedule: [], terms_clauses: [], guest_name: "Asha Mehta", guest_email: "a@example.com",
      signed_at: null, status: "approved", contract_status: "viewed", contract_token: "tok", negotiation: waiting,
      timeline: [
        { at, kind: "negotiation_sent", actor: "client", detail: { round: 2, keys: ["event.guests", "line:p.price"], settled: [] } },
        { at: "2030-05-03T12:00:00", kind: "negotiation_sent", actor: "vendor", detail: { round: 3, keys: ["event.guests", "line:p.price"], settled: ["event.guests"] } },
        { at: "2030-05-03T12:00:01", kind: "edited", actor: "vendor", detail: { revision: 2 } },
        { at: "2030-05-03T12:00:01", kind: "resent", actor: "vendor", detail: {} },
      ],
    });
    await page.goto("contracts/view/?id=c-1");
    await expect(page.getByText("Asha Mehta asked for 2 changes — your turn")).toBeVisible();
    await expect(page.getByRole("link", { name: "Answer them" })).toBeVisible();
    await expect(page.getByText("Your client asked for 2 changes")).toBeVisible();
    await expect(page.getByText("You accepted 1 and answered 1 other change")).toBeVisible();
    await expect(page.getByText(/You edited it/)).toHaveCount(0);
    await expect(page.getByText(/^Resent/)).toHaveCount(0);
    await expect(page.getByText("negotiation_sent")).toHaveCount(0);
  });

  test("Overview counts money that needs the vendor, and a three-day event once", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    const start = isoInDays(20);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "b1", status: "approved", contract_token: "t", signed_at: "2026-01-01T00:00:00Z",
          date_iso: start, date_end: isoInDays(22), amount_cents: 300000,
          payment_schedule: [
            { id: "d", label: "Deposit", amount_cents: 100000, due_type: "on_signing", due_date: null, due_days: null, due_on: "2026-01-01", marked_paid_at: "2026-01-02T00:00:00Z", confirmed_at: null },
            { id: "b", label: "Balance", amount_cents: 200000, due_type: "date", due_date: isoInDays(-3), due_days: null, due_on: isoInDays(-3), marked_paid_at: null, confirmed_at: null },
          ],
        }),
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.get("/leads", { items: [], total: 0 });
    api.get("/conversations", []);
    api.get("/leads/pipeline", { items: [], counts: { inquiries: 0, negotiations: 0, needs_you: 0, waiting: 0, archived: 0 } });

    await page.goto("overview/");
    await expect(page.getByText("1 payment to confirm and 1 payment is overdue.")).toBeVisible();
    await expect(page.getByText(/^1 event$/)).toBeVisible();
  });

  test("Leads: a request shows what the client sent; a decline can say why and lands in Archived", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    const base = {
      source: "request", stage: "inquiry", lead_id: null, conversation_id: null, email: null, phone: null,
      event_date: isoInDays(90), event_date_end: null, service_name: "Sangeet Night Coverage",
      estimated_value_cents: 250000, contract_status: null, hold_expires_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    api.get("/leads/pipeline", {
      items: [
        {
          ...base, id: "booking:r1", booking_id: "r1", name: "Asha Mehta", event_name: "QA Event 4 Mehndi",
          location: "Royal Albert's Palace, 1050 King Georges Post Rd, Fords, NJ 08863",
          time_start: "18:00", time_end: "23:00", guest_count: 150, client_note: "Mostly candid please.",
          attention: "needs_you", attention_reason: "new_request", archived: false,
        },
        {
          ...base, id: "booking:r2", booking_id: "r2", name: "Ravi Iyer", event_name: "Ravi's Sangeet", location: "Edison",
          attention: null, attention_reason: null, archived: true, outcome: "declined", outcome_note: "Booked that weekend.",
        },
      ],
      counts: { inquiries: 1, negotiations: 0, needs_you: 1, waiting: 0, archived: 1 },
    });
    api.put("/bookings/r1/status", { booking_id: "r1", status: "rejected" });

    await page.goto("leads/");
    await expect(page.getByText("QA Event 4 Mehndi · Sangeet Night Coverage")).toBeVisible();
    await page.getByRole("button", { name: /Asha Mehta/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("6:00 PM – 11:00 PM")).toBeVisible();
    await expect(drawer.getByText("150")).toBeVisible();
    await expect(drawer.getByText("“Mostly candid please.”")).toBeVisible();
    await expect(drawer.getByText(/1050 King Georges Post Rd, Fords, NJ 08863/)).toBeVisible();

    await drawer.getByRole("button", { name: "Decline", exact: true }).click();
    await drawer.getByLabel("A note to them (optional)").fill("Booked that weekend, sorry!");
    await drawer.getByRole("button", { name: "Decline request" }).click();
    await expect(drawer.getByText("Declined.")).toBeVisible();
    expect(api.requestsTo("PUT", "/bookings/r1/status")[0].body).toMatchObject({
      status: "rejected",
      note: "Booked that weekend, sorry!",
    });
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: /Archived/ }).click();
    await expect(page.getByText("You declined")).toBeVisible();
    await page.getByRole("button", { name: /Ravi Iyer/ }).click();
    await expect(page.getByRole("dialog").getByText("You told them: “Booked that weekend.”")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Unarchive" })).toHaveCount(0);
  });
});
