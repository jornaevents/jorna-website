import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// A client's signature turns a lead into a booking with nothing for the
// vendor to do, so the Bookings tab carries a badge until they open it
// (backend DECISIONS #30).
test.describe("new bookings badge", () => {
  test("a signed booking is new until it's opened, then the badge goes", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    let seen = false;
    api.get("/bookings/vendor/new-count", () => ({ count: seen ? 0 : 1 }));
    api.post("/bookings/new-1/seen", () => {
      seen = true;
      return { booking_id: "new-1", vendor_seen_at: "2030-05-02T13:00:00Z" };
    });
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "old-1", event_name: "Riya & Kabir", status: "approved", contract_token: "tok-old",
          signed_at: "2030-04-01T00:00:00Z", vendor_seen_at: "2030-04-01T01:00:00Z", amount_cents: 180000,
          payment_method: "manual", date_iso: "2030-07-01",
        }),
        mockVendorBooking({
          booking_id: "new-1", event_name: "Meera & Arjun", status: "approved", contract_token: "tok-new",
          signed_at: "2030-05-02T12:00:00Z", vendor_seen_at: null, amount_cents: 250000,
          payment_method: "manual", date_iso: "2030-08-01",
        }),
      ],
      total: 2, limit: 100, offset: 0,
    });

    await page.goto("overview/");
    const nav = page.getByRole("navigation", { name: "Vendor" });
    await expect(nav.getByRole("link", { name: /Bookings\s*,\s*1 new/ })).toBeVisible();

    await nav.getByRole("link", { name: /Bookings/ }).click();
    const list = page.getByRole("region", { name: "Booking list" });
    // New comes first, even though its event is later.
    const rows = list.getByRole("button", { expanded: false });
    await expect(rows.first()).toContainText("Meera & Arjun");
    await expect(rows.first().getByText("New", { exact: true })).toBeVisible();
    await expect(list.getByText("New", { exact: true })).toHaveCount(1);

    await rows.first().click();
    await expect(list.getByText("New", { exact: true })).toHaveCount(0);
    await expect.poll(() => api.requestsTo("POST", "/bookings/new-1/seen").length).toBe(1);
    await expect(nav.getByRole("link", { name: "Bookings" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /new/ })).toHaveCount(0);

    // Opening one that was already seen doesn't ask again.
    await list.getByRole("button", { name: /Riya & Kabir/ }).click();
    expect(api.requestsTo("POST", "/bookings/old-1/seen")).toHaveLength(0);
  });

  test("a link straight to a new booking opens it, so it's seen", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get("/bookings/vendor/new-count", { count: 1 });
    api.post("/bookings/new-1/seen", { booking_id: "new-1", vendor_seen_at: "2030-05-02T13:00:00Z" });
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "new-1", event_name: "Meera & Arjun", status: "approved", contract_token: "tok-new",
          signed_at: "2030-05-02T12:00:00Z", vendor_seen_at: null, amount_cents: 250000,
          payment_method: "manual", date_iso: "2030-08-01",
        }),
      ],
      total: 1, limit: 100, offset: 0,
    });

    await page.goto("my-bookings/?id=new-1");
    await expect.poll(() => api.requestsTo("POST", "/bookings/new-1/seen").length).toBe(1);
  });
});
