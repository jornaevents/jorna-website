import { test, expect, loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Moving between vendor pages reuses what was just read (lib/dataCache), and
// any write makes the next page read afresh — so nothing shown can predate
// the vendor's own action.
test.describe("remembered reads between vendor pages", () => {
  const vendor = mockVendorDetail();
  const bookingsPath = `/bookings/vendor/${vendor.vendor_id}`;

  function mockShell(api: import("./support/api-mock").ApiMock) {
    api.get("/vendors/me", vendor);
    api.get("/bookings/vendor/new-count", { count: 0 });
    api.get(bookingsPath, {
      items: [
        mockVendorBooking({
          booking_id: "new-1", event_name: "Meera & Arjun", status: "approved", contract_token: "tok-new",
          signed_at: "2030-05-02T12:00:00Z", vendor_seen_at: null, amount_cents: 250000,
          payment_method: "manual", date_iso: "2030-08-01",
        }),
      ],
      total: 1, limit: 100, offset: 0,
    });
    api.post("/bookings/new-1/seen", { booking_id: "new-1", vendor_seen_at: "2030-05-02T13:00:00Z" });
  }

  test("going back to a page doesn't ask for the vendor or the bookings again", async ({ page, api }) => {
    await loginAs(page, api);
    mockShell(api);
    const nav = page.getByRole("navigation", { name: "Vendor" });

    await page.goto("my-calendar/");
    await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
    // The sidebar, the role check and the page all asked; they shared one request.
    expect(api.requestsTo("GET", "/vendors/me")).toHaveLength(1);
    expect(api.requestsTo("GET", bookingsPath)).toHaveLength(1);

    await nav.getByRole("link", { name: /Bookings/ }).click();
    await expect(page.getByRole("region", { name: "Booking list" })).toContainText("Meera & Arjun");
    await nav.getByRole("link", { name: "Calendar" }).click();
    await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();

    expect(api.requestsTo("GET", "/vendors/me")).toHaveLength(1);
    expect(api.requestsTo("GET", bookingsPath)).toHaveLength(1);
  });

  test("after a write, the next page reads afresh", async ({ page, api }) => {
    await loginAs(page, api);
    mockShell(api);
    const nav = page.getByRole("navigation", { name: "Vendor" });

    await page.goto("my-bookings/");
    const list = page.getByRole("region", { name: "Booking list" });
    await list.getByRole("button", { name: /Meera & Arjun/ }).click();
    await expect.poll(() => api.requestsTo("POST", "/bookings/new-1/seen").length).toBe(1);
    const before = api.requestsTo("GET", bookingsPath).length;

    await nav.getByRole("link", { name: "Calendar" }).click();
    await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
    await expect.poll(() => api.requestsTo("GET", bookingsPath).length).toBe(before + 1);
  });
});
