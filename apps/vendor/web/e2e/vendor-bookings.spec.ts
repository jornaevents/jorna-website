import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Bookings (redesign step 3): agreed bookings only, by tab, each expanding to
// its progress, money and the vendor's move. Requests live on Leads.

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mockBookings(api: import("./support/api-mock").ApiMock) {
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  api.get(`/bookings/vendor/${vendor.vendor_id}`, {
    items: [
      // Signed; the couple says the deposit is sent.
      mockVendorBooking({
        booking_id: "dep",
        event_name: "Meera & Arjun",
        status: "approved",
        contract_token: "tok",
        signed_at: "2026-09-01T00:00:00Z",
        amount_cents: 250000,
        deposit_percent: 30,
        deposit_amount_cents: 75000,
        deposit_marked_paid_at: "2026-09-02T00:00:00Z",
        payment_method: "manual",
        date_iso: isoInDays(20),
      }),
      // Signed, nothing owed until after the event.
      mockVendorBooking({
        booking_id: "conf",
        event_name: "Riya & Kabir",
        status: "approved",
        contract_token: "tok2",
        signed_at: "2026-09-01T00:00:00Z",
        amount_cents: 180000,
        payment_method: "manual",
        date_iso: isoInDays(45),
      }),
      // A request: not a booking yet.
      mockVendorBooking({ booking_id: "req", event_name: "Priya's Wedding", status: "pending" }),
    ],
    total: 3,
    limit: 100,
    offset: 0,
  });
  return vendor;
}

test.describe("vendor bookings (/my-bookings)", () => {
  test("lists only agreed bookings, by tab", async ({ page, api }) => {
    await loginAs(page, api);
    mockBookings(api);

    await page.goto("my-bookings/");

    const list = page.getByRole("region", { name: "Booking list" });
    await expect(list.getByText("Meera & Arjun")).toBeVisible();
    await expect(list.getByText("Riya & Kabir")).toBeVisible();
    await expect(list.getByText("Priya's Wedding")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Deposit due/ })).toContainText("1");

    await page.getByRole("tab", { name: /Upcoming/ }).click();
    await expect(list.getByText("Riya & Kabir")).toBeVisible();
    await expect(list.getByText("Meera & Arjun")).toHaveCount(0);
  });

  test("Done keeps every past event, paid or not, and says which", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    const past = {
      status: "approved",
      signed_at: "2026-06-01T00:00:00Z",
      amount_cents: 200000,
      payment_method: "manual",
      date_iso: isoInDays(-10),
    };
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({ ...past, booking_id: "owed", event_name: "Asha & Dev", contract_token: "t1" }),
        mockVendorBooking({
          ...past,
          booking_id: "paid",
          event_name: "Nisha & Rahul",
          contract_token: "t2",
          payment_status: "confirmed_paid",
        }),
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    await page.goto("my-bookings/");

    await expect(page.getByRole("tab", { name: /Done/ })).toContainText("2");
    await expect(page.getByText("1 with a balance due")).toBeVisible();
    await page.getByRole("tab", { name: /Done/ }).click();
    const list = page.getByRole("region", { name: "Booking list" });
    const owed = list.getByRole("button", { name: /Asha & Dev/ });
    const paid = list.getByRole("button", { name: /Nisha & Rahul/ });
    await expect(owed).toContainText("Balance due");
    // Fully paid used to drop out of every tab.
    await expect(paid).toContainText("Paid");
  });

  test("expanding shows progress and money, and confirms a deposit the couple sent", async ({ page, api }) => {
    await loginAs(page, api);
    mockBookings(api);
    api.post("/payments/bookings/dep/confirm-deposit-received", { deposit_confirmed_received_at: "now" });

    await page.goto("my-bookings/");
    // The vendor's move sorts first and says so.
    const row = page.getByRole("button", { name: /Meera & Arjun/ });
    await expect(row).toContainText("Your move");
    await row.click();

    await expect(page.getByText("Booking stage")).toBeVisible();
    await expect(page.getByText("Contract signed").first()).toBeVisible();
    await expect(page.getByText("$750").first()).toBeVisible();
    await expect(page.getByText("Not yet paid")).toBeVisible();
    await expect(page.getByRole("link", { name: "Signed contract" })).toHaveAttribute("href", /contracts\/view\/?\?id=dep/);

    await expect(page.getByText(/says they've sent the deposit/)).toBeVisible();
    await page.getByRole("button", { name: "I received it" }).click();
    await expect(page.getByText("Confirmed — they can see you've got it.")).toBeVisible();
    expect(api.requestsTo("POST", "/payments/bookings/dep/confirm-deposit-received")).toHaveLength(1);
  });

  test("cancelling asks first", async ({ page, api }) => {
    await loginAs(page, api);
    mockBookings(api);
    api.put("/bookings/:id/status", {});

    await page.goto("my-bookings/?id=conf");

    await page.getByRole("button", { name: "Cancel booking" }).click();
    expect(api.requestsTo("PUT", "/bookings/conf/status")).toHaveLength(0);
    // A signed contract: its terms still apply, and the client is told why.
    await expect(page.getByText(/You both signed it, so its cancellation terms still apply/)).toBeVisible();
    await expect(page.getByRole("link", { name: "cancellation agreement" })).toBeVisible();
    const yes = page.getByRole("button", { name: "Yes, cancel it" });
    await expect(yes).toBeDisabled();
    await page.getByLabel(/Why you're cancelling/).fill("Family emergency");
    await yes.click();
    await expect(page.getByText("Cancelled. Your client has been told.")).toBeVisible();
    expect(api.requestsTo("PUT", "/bookings/conf/status")[0].body).toMatchObject({ status: "rejected", note: "Family emergency" });
  });
});
