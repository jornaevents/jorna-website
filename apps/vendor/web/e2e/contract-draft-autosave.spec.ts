import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";
import type { ApiMock, HandlerArgs } from "./support/api-mock";
import type { Page } from "@playwright/test";

// A contract draft saves itself (2026-11-14, backend DECISIONS #49): the
// first pause creates it, later ones update it, the address moves to
// ?edit=<id> so it reopens, and Send sends that draft — never a second one.
// The chat's panel reaches an open draft even when the client is booked.

const services = (vendorId: string) => ({
  items: [{ service_id: "svc-1", vendor_id: vendorId, name: "Reception set", price: 1400, add_ons: [] }],
  total: 1,
  limit: 100,
  offset: 0,
});

const draftContract = (over: Record<string, unknown> = {}) => ({
  booking_id: "d-1",
  vendor_id: "vendor-1",
  service_id: "svc-1",
  service_name: "Reception set",
  date_iso: "TBD",
  date_end: null,
  time_start: "TBD",
  time_end: "TBD",
  location: "TBD",
  guest_count: null,
  amount_cents: 140000,
  subtotal_cents: 140000,
  discount_cents: null,
  line_items: [
    { id: "pkg", kind: "package", service_id: "svc-1", addon_id: null, name: "Reception set", description: null, unit: "event", unit_price_cents: 140000, quantity: 1, total_cents: 140000 },
  ],
  payment_schedule: [
    { id: "full", label: "Payment in full", amount_cents: 140000, due_type: "on_signing", due_date: null, due_days: null, marked_paid_at: null, confirmed_at: null },
  ],
  terms_clauses: [],
  document_title: "Meera Iyer — Reception set agreement",
  document_layout: null,
  revision: 1,
  deposit_percent: null,
  deposit_amount_cents: null,
  cancellation_window_hours: null,
  overtime_rate_cents: null,
  addon_rate_cents: null,
  contract_terms: null,
  guest_name: "Meera Iyer",
  guest_email: "meera@example.com",
  guest_phone: null,
  signed_at: null,
  status: "approved",
  payment_status: "unpaid",
  contract_status: "draft",
  sent_at: null,
  viewed_at: null,
  hold_expires_at: null,
  contract_token: "tok-d1",
  vendor_display_name: "Sound Studio",
  proposal_status: null,
  timeline: [],
  ...over,
});

function mockEditor(api: ApiMock) {
  const vendor = mockVendorDetail({ f_name: "Sound", l_name: "Studio" });
  api.get("/vendors/me", vendor);
  api.get("/services", services(vendor.vendor_id));
  api.get("/contract-templates", { items: [], total: 0 });
  return vendor;
}

const doc = (page: Page) => page.getByRole("article", { name: "Contract document" });

test.describe("contract drafts save themselves", () => {
  test("a pause saves the draft once, later ones update it, and Send sends that draft", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    api.post("/contracts", ({ route }: HandlerArgs) => draftContract({ document_title: route.request().postDataJSON().document_title }));
    api.patch("/contracts/d-1", ({ route }: HandlerArgs) => draftContract(route.request().postDataJSON()));
    api.post("/contracts/d-1/send", draftContract({ contract_status: "sent", sent_at: "2030-05-01T12:00:00", hold_expires_at: "2030-05-08T12:00:00", email_sent: true }));

    await page.goto("contracts/new/?conversation=c1&scratch=1");
    // Nothing is saved for just opening it.
    await expect(page.getByText("This saves as a draft as you go.")).toBeVisible();
    // A draft needs a package before the server keeps it.
    await doc(page).getByLabel("Client name").fill("Meera Iyer");
    await expect(page.getByText("Add a package and this draft saves itself.")).toBeVisible();
    expect(api.requestsTo("POST", "/contracts")).toHaveLength(0);

    await doc(page).getByLabel("Add a package").selectOption("svc-1");
    await expect(page.getByText(/^Draft saved ·/)).toBeVisible();
    const [created] = api.requestsTo("POST", "/contracts");
    expect(created.body).toMatchObject({ draft: true, conversation_id: "c1", date_iso: "" });
    // The address is the draft's now, so a reload or coming back reopens it.
    await expect(page).toHaveURL(/contracts\/new\/?\?edit=d-1$/);

    // Later changes update the same draft.
    await doc(page).getByLabel("Date", { exact: true }).fill("2030-06-01");
    await expect.poll(() => api.requestsTo("PATCH", "/contracts/d-1").length).toBeGreaterThan(0);
    const patches = api.requestsTo("PATCH", "/contracts/d-1");
    expect(patches.at(-1)!.body).toMatchObject({ date_iso: "2030-06-01" });
    expect(api.requestsTo("POST", "/contracts")).toHaveLength(1);
    await expect(page.getByRole("heading", { name: "New contract" })).toBeVisible();

    // Send goes out as that draft.
    await doc(page).getByLabel("Start time — hour").selectOption("6");
    await doc(page).getByLabel("End time — hour").selectOption("10");
    await page.getByRole("button", { name: "Send in chat" }).click();
    await expect(page.getByRole("heading", { name: "Sent in your chat" })).toBeVisible();
    expect(api.requestsTo("POST", "/contracts/d-1/send")).toHaveLength(1);
    expect(api.requestsTo("POST", "/contracts")).toHaveLength(1);
  });

  test("a reopened draft with no date yet edits as a draft and can be sent", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockEditor(api);
    api.get("/contracts/d-1", draftContract());
    api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });

    await page.goto("contracts/new/?edit=d-1");

    await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
    await expect(doc(page).getByLabel("Date", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Send in chat" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save and close" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  });

  test("Messages offers Edit draft for a booked client's next contract", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "bk1", user_id: "client-1", status: "approved", contract_token: "tok",
          contract_status: "signed", signed_at: "2026-09-01T00:00:00Z", amount_cents: 250000,
        }),
        mockVendorBooking({ booking_id: "d-1", user_id: "client-1", status: "approved", contract_token: "tok-d1", contract_status: "draft" }),
      ],
      total: 2, limit: 100, offset: 0,
    });
    const now = new Date().toISOString();
    api.get("/leads/pipeline", {
      items: [{
        id: "booking:d-1", source: "contract", stage: "negotiation", booking_id: "d-1", lead_id: null,
        conversation_id: "c-1", name: "Meera Iyer", email: null, phone: null, event_name: null,
        event_date: "TBD", event_date_end: null, location: null, service_name: "Reception set",
        estimated_value_cents: 140000, contract_status: "draft", hold_expires_at: null, attention: "needs_you",
        attention_reason: "draft", archived: false, outcome: null, created_at: now, updated_at: now,
      }],
      counts: { inquiries: 0, negotiations: 1, needs_you: 1, waiting: 0, archived: 0 },
    });
    api.get("/conversations", [{
      conversation_id: "c-1", name: "Meera Iyer", subject_type: "enquiry", member_count: 2,
      members: [{ user_id: "user-1", name: "You" }, { user_id: "client-1", name: "Meera Iyer" }],
      unread_count: 0, last_message: { content: "Hi!", created_at: now }, created_at: now,
    }]);
    api.get("/conversations/unread-count", { unread_count: 0 });
    api.get("/conversations/:id/messages", { items: [], total: 0, limit: 100, offset: 0 });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("messages/?id=c-1");

    await expect(page.getByRole("link", { name: "View booking" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit draft" })).toHaveAttribute("href", /contracts\/new\/?\?edit=d-1$/);
    await expect(page.getByRole("link", { name: "Send contract" })).toHaveCount(0);
  });

  test("Messages offers Send contract to a booked client with nothing open", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [mockVendorBooking({
        booking_id: "bk1", user_id: "client-1", status: "approved", contract_token: "tok",
        contract_status: "signed", signed_at: "2026-09-01T00:00:00Z", amount_cents: 250000,
      })],
      total: 1, limit: 100, offset: 0,
    });
    api.get("/leads/pipeline", { items: [], counts: { inquiries: 0, negotiations: 0, needs_you: 0, waiting: 0, archived: 0 } });
    const now = new Date().toISOString();
    api.get("/conversations", [{
      conversation_id: "c-1", name: "Meera Iyer", subject_type: "enquiry", member_count: 2,
      members: [{ user_id: "user-1", name: "You" }, { user_id: "client-1", name: "Meera Iyer" }],
      unread_count: 0, last_message: { content: "Hi!", created_at: now }, created_at: now,
    }]);
    api.get("/conversations/unread-count", { unread_count: 0 });
    api.get("/conversations/:id/messages", { items: [], total: 0, limit: 100, offset: 0 });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("messages/?id=c-1");

    await expect(page.getByRole("link", { name: "View booking" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Send contract" })).toHaveAttribute("href", /contracts\/new\/?\?conversation=c-1$/);
  });
});
