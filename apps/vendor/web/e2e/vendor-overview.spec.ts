import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockLead, mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Overview (vendor redesign step 1): a summary of the other pages. These pin
// the parts with logic — which bookings count as what, and where old links go.

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Each of Overview's reads on its own route, and all five together on
 *  GET /vendors/me/overview — the same data, as the backend promises. */
function mockOverview(api: import("./support/api-mock").ApiMock, { combined = true } = {}) {
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  const bookings = {
    items: [
      // Signed, deposit not in yet: the next event, and "Deposit due".
      mockVendorBooking({
        booking_id: "signed",
        event_name: "Meera & Arjun",
        status: "approved",
        contract_token: "tok",
        signed_at: "2026-09-01T00:00:00Z",
        deposit_percent: 30,
        deposit_amount_cents: 75000,
        date_iso: isoInDays(12),
      }),
      // A marketplace request: a lead waiting on the vendor, not a booking.
      mockVendorBooking({ booking_id: "request", event_name: "Priya's Wedding", status: "pending", date_iso: isoInDays(40) }),
      // Happened, not paid off: stays under Done.
      mockVendorBooking({
        booking_id: "past",
        event_name: "Sana & Omar",
        status: "approved",
        date_iso: isoInDays(-6),
        payment_status: "unpaid",
      }),
    ],
    total: 3,
    limit: 100,
    offset: 0,
  };
  api.get(`/bookings/vendor/${vendor.vendor_id}`, bookings);
  const leads = { items: [mockLead()], total: 1 };
  api.get("/leads", leads);
  const conversations = [
    {
      conversation_id: "c1",
      name: "Meera Kapoor",
      unread_count: 2,
      last_message: { content: "Can we add a second shooter?", created_at: new Date().toISOString() },
    },
  ];
  api.get("/conversations", conversations);
  api.get("/conversations/unread-count", { unread_count: 2 });
  const now = new Date().toISOString();
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const pipeline = {
    items: [
      { id: "booking:request", source: "request", booking_id: "request", lead_id: null, name: "Priya Shah", stage: "inquiry", attention: "needs_you", attention_reason: "new_request", archived: false, created_at: hoursAgo(5), updated_at: now },
      { id: "lead:lead-1", source: "lead", booking_id: null, lead_id: "lead-1", name: "Anjali Rao", stage: "inquiry", attention: "needs_you", attention_reason: "new_lead", archived: false, created_at: "2026-08-01T00:00:00Z", updated_at: now },
    ],
    counts: { inquiries: 2, negotiations: 0, needs_you: 2, waiting: 0, archived: 0 },
  };
  api.get("/leads/pipeline", pipeline);
  if (combined) {
    api.get("/vendors/me/overview", { vendor, bookings, leads, conversations, pipeline, timings: {} });
  }
  return vendor;
}

/** Overview's own reads, each on its own route. */
function separateReads(api: import("./support/api-mock").ApiMock, vendorId: string) {
  return [`/bookings/vendor/${vendorId}`, "/leads", "/conversations", "/leads/pipeline"].map(
    (path) => api.requestsTo("GET", path).length,
  );
}

test.describe("vendor overview (/overview)", () => {
  test("everything comes in one request, and the next pages find it", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockOverview(api);

    await page.goto("overview/");
    await expect(page.getByText("2 need your reply")).toBeVisible();
    expect(api.requestsTo("GET", "/vendors/me/overview")).toHaveLength(1);
    // Not even the sidebar's pipeline: it waited on the combined read.
    expect(separateReads(api, vendor.vendor_id)).toEqual([0, 0, 0, 0]);

    const nav = page.getByRole("navigation", { name: "Vendor" });
    await nav.getByRole("link", { name: /Bookings/ }).click();
    await expect(page.getByRole("region", { name: "Booking list" })).toContainText("Meera & Arjun");
    await nav.getByRole("link", { name: /Leads/ }).click();
    await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();
    await expect(page.getByText("Priya Shah").first()).toBeVisible();
    expect(separateReads(api, vendor.vendor_id)).toEqual([0, 0, 0, 0]);
  });

  test("when the combined read fails, the separate reads still fill the page", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockOverview(api, { combined: false });
    api.error("GET", "/vendors/me/overview", 500, "Internal Server Error");

    await page.goto("overview/");
    await expect(page.getByText("2 need your reply")).toBeVisible();
    await expect(page.getByText("In 12 days")).toBeVisible();
    await expect(page.getByRole("link", { name: /Meera Kapoor/ })).toBeVisible();
    expect(separateReads(api, vendor.vendor_id).every((n) => n >= 1)).toBe(true);
  });

  test("summarises leads, the next event, bookings and the inbox", async ({ page, api }) => {
    await loginAs(page, api);
    mockOverview(api);

    await page.goto("overview/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Priya");
    // One "New" button; on Overview the contract comes first.
    await page.getByRole("button", { name: "New", exact: true }).click();
    const first = page.getByRole("menu", { name: "New" }).getByRole("menuitem").first();
    await expect(first).toContainText("Send a contract");
    await expect(first).toHaveAttribute("href", /\/contracts\/new\/?$/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "New" })).toHaveCount(0);

    // The request and the informal lead are both open; both wait on a reply,
    // and the header says so in words.
    await expect(page.getByText("2 clients are waiting on you.")).toBeVisible();
    await expect(page.getByText("2 need your reply")).toBeVisible();
    // Only the request came in this week; the lead has waited longest.
    await expect(page.getByText("+1 this week")).toBeVisible();
    await expect(page.getByText(/Oldest has waited \d+d/)).toBeVisible();

    await expect(page.getByText("Next event")).toBeVisible();
    await expect(page.getByText("In 12 days")).toBeVisible();

    const bookings = page.getByRole("region", { name: "Bookings" });
    await expect(page.getByRole("tab", { name: /Deposit due/ })).toContainText("1");
    await expect(page.getByText("$750")).toBeVisible();
    await expect(bookings.getByText("waiting to be paid")).toBeVisible();
    // The request isn't a booking yet.
    await expect(bookings.getByText("Priya's Wedding")).toHaveCount(0);

    await page.getByRole("tab", { name: /Done/ }).click();
    await expect(bookings.getByText("Sana & Omar")).toBeVisible();
    await expect(bookings.getByText("Meera & Arjun")).toHaveCount(0);

    await expect(page.getByRole("link", { name: /Meera Kapoor/ })).toHaveAttribute("href", /conversation\/?\?id=c1/);
  });

  test("the sidebar lights Overview", async ({ page, api }) => {
    await loginAs(page, api);
    mockOverview(api);

    await page.goto("overview/");

    await expect(
      page.getByRole("navigation", { name: "Vendor" }).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("an old ?view=leads link lands on /leads", async ({ page, api }) => {
    await loginAs(page, api);
    mockOverview(api);

    await page.goto("overview/?view=leads");

    await expect(page).toHaveURL(/\/leads\/?$/);
    await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();
  });
});
