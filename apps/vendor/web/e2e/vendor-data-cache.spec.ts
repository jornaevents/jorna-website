import { test, expect, loginAs } from "./support/fixtures";
import { mockEarnings, mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Moving between vendor pages reuses what was just read (lib/dataCache), and
// any write makes the next page read afresh — so nothing shown can predate
// the vendor's own action.
/** The Calendar's own content, not its heading: the heading shows at once,
 *  over the loading placeholders (PageSkeleton), before anything is read. */
async function calendarLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Loading your calendar…" })).toHaveCount(0);
}

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
    await calendarLoaded(page);
    // The sidebar, the role check and the page all asked; they shared one request.
    expect(api.requestsTo("GET", "/vendors/me")).toHaveLength(1);
    expect(api.requestsTo("GET", bookingsPath)).toHaveLength(1);

    await nav.getByRole("link", { name: /Bookings/ }).click();
    await expect(page.getByRole("region", { name: "Booking list" })).toContainText("Meera & Arjun");
    await nav.getByRole("link", { name: "Calendar" }).click();
    await calendarLoaded(page);

    expect(api.requestsTo("GET", "/vendors/me")).toHaveLength(1);
    expect(api.requestsTo("GET", bookingsPath)).toHaveLength(1);
  });

  test("a reload shows the pages without asking again", async ({ page, api }) => {
    await loginAs(page, api);
    mockShell(api);

    await page.goto("my-calendar/");
    await calendarLoaded(page);
    expect(api.requestsTo("GET", "/vendors/me")).toHaveLength(1);

    await page.reload();
    await calendarLoaded(page);
    // The session is checked again; the vendor and the bookings come from the tab.
    expect(api.requestsTo("GET", "/me").length).toBeGreaterThan(1);
    expect(api.requestsTo("GET", "/vendors/me")).toHaveLength(1);
    expect(api.requestsTo("GET", bookingsPath)).toHaveLength(1);
  });

  test("pointing at a sidebar link reads that page's data ahead", async ({ page, api }) => {
    await loginAs(page, api);
    mockShell(api);
    api.get(`/payments/vendors/${vendor.vendor_id}/earnings`, mockEarnings());
    const nav = page.getByRole("navigation", { name: "Vendor" });

    await page.goto("my-calendar/");
    await calendarLoaded(page);
    expect(api.requestsTo("GET", `/payments/vendors/${vendor.vendor_id}/earnings`)).toHaveLength(0);

    await nav.getByRole("link", { name: "Earnings" }).hover();
    await expect.poll(() => api.requestsTo("GET", `/payments/vendors/${vendor.vendor_id}/earnings`).length).toBe(1);
  });

  test("opening a contract again doesn't read it again; pointing at its row reads it ahead", async ({ page, api }) => {
    await loginAs(page, api);
    mockShell(api);
    api.get("/contract-templates", { items: [], total: 0 });
    api.get("/contracts/c-1/documents", { items: [], total: 0 });
    api.get("/contracts/c-1", {
      booking_id: "c-1", vendor_id: vendor.vendor_id, service_name: "Coverage", date_iso: "2030-06-25", date_end: null,
      time_start: "18:00", time_end: "23:00", location: "Pines Manor", guest_count: 150, amount_cents: 250000,
      line_items: [], payment_schedule: [], terms_clauses: [], guest_name: "Asha Mehta", guest_email: "a@example.com",
      signed_at: null, status: "approved", contract_status: "sent", contract_token: "tok-c1", timeline: [],
    });
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "c-1", event_name: "Asha & Dev", status: "approved", contract_token: "tok-c1",
          contract_status: "sent", guest_name: "Asha Mehta", date_iso: "2030-06-25",
        }),
      ],
      total: 1, limit: 100, offset: 0,
    });

    await page.goto("contracts/");
    const row = page.getByRole("link", { name: /Asha & Dev/ }).first();
    await expect(row).toBeVisible();
    await row.hover();
    await expect.poll(() => api.requestsTo("GET", "/contracts/c-1").length).toBe(1);

    await row.click();
    await expect(page.getByRole("heading", { name: "Asha Mehta", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "← All contracts" }).click();
    await expect(page.getByRole("link", { name: /Asha & Dev/ }).first()).toBeVisible();
    await page.getByRole("link", { name: /Asha & Dev/ }).first().click();
    await expect(page.getByRole("heading", { name: "Asha Mehta", level: 1 })).toBeVisible();

    expect(api.requestsTo("GET", "/contracts/c-1")).toHaveLength(1);
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
    await calendarLoaded(page);
    await expect.poll(() => api.requestsTo("GET", bookingsPath).length).toBe(before + 1);
  });
});
