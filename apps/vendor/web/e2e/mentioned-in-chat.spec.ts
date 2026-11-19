import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockLead, mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// "Mentioned in chat" (Contract Builder from Chat, version 1): what the chat
// said since the inquiry, beside the contract, each with its words. Nothing
// changes until the vendor clicks Use.

test.use({ viewport: { width: 1440, height: 900 } });

const now = Date.now();
const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

function mockEditor(api: ApiMock, messages: unknown[]) {
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  // A package, or the vendor shell sends a vendor with none to setup (#162).
  api.get("/services", {
    items: [{ service_id: "svc-1", vendor_id: vendor.vendor_id, name: "Reception set", price: 1400, add_ons: [] }],
    total: 1, limit: 100, offset: 0,
  });
  api.get("/contract-templates", { items: [], total: 0 });
  api.get("/conversations/c1/messages", { items: messages, total: messages.length, limit: 100, offset: 0 });
}

const msg = (id: string, content: string, at: string, extra: Record<string, unknown> = {}) => ({
  message_id: id, conversation_id: "c1", sender_id: "client-1", sender_name: "Meera Patel",
  kind: "text", content, created_at: at, ...extra,
});

test.describe("mentioned in chat", () => {
  test("lists what the chat said, and Use puts it on the contract", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, [
      msg("m1", "Inquiry: Reception set", ago(5), { meta: { inquiry: { lead_id: "l1", guest_count: 300 } } }),
      msg("m2", "Can we start at 4:30pm? We're now about 180 guests.", ago(2)),
      msg("m3", "Six hours is fine, and $1,800 works for us.", ago(1), { sender_name: "Arjun Kapoor", sender_id: "user-1" }),
    ]);

    await page.goto("contracts/new/?conversation=c1&scratch=1");

    const panel = page.getByText("3 details mentioned in chat");
    await expect(panel).toBeVisible();
    await panel.click();
    const list = page.getByRole("list", { name: "Mentioned in chat" });
    // Both the start time and the guest count came from this message.
    await expect(list.getByText("We're now about 180 guests.", { exact: false })).toHaveCount(2);
    // The inquiry is already on the contract; its 300 isn't repeated here.
    await expect(list.getByText("300 guests")).toHaveCount(0);
    // An amount is shown, not applied: what it was for is the vendor's call.
    await expect(list.getByText("Amount: $1,800")).toBeVisible();
    await expect(list.getByRole("button", { name: "Use $1,800" })).toHaveCount(0);

    await list.getByRole("button", { name: "Use 180 guests" }).click();
    await expect(page.getByLabel("Guest count (optional)")).toHaveValue("180");
    await expect(list.getByRole("button", { name: "Use 180 guests" })).toHaveText("Used");

    await list.getByRole("button", { name: "Use Starts 4:30 PM" }).click();
    await expect(page.getByLabel("Start time — hour")).toHaveValue("4");

    // Counted, never the words (backend DECISIONS #57).
    await expect.poll(() => api.requestsTo("POST", "/usage-events").map((r) => r.body)).toEqual([
      { name: "mention_panel_opened", props: { count: 3 } },
      { name: "mention_used", props: { kind: "guests" } },
      { name: "mention_used", props: { kind: "start" } },
    ]);
  });

  test("a chat with nothing to use shows no panel", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, [msg("m1", "Thanks, talk soon!", ago(1))]);

    await page.goto("contracts/new/?conversation=c1&scratch=1");

    await expect(page.getByRole("heading", { name: "New contract" })).toBeVisible();
    await expect(page.getByText(/mentioned in chat/)).toHaveCount(0);
  });

  test("a draft reopened from Contracts finds its chat through its lead", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, [msg("m2", "We're now about 180 guests.", ago(1))]);
    api.get("/leads", {
      items: [mockLead({ lead_id: "l1", name: "Meera Patel", converted_booking_id: "d-1", conversation_id: "c1" })],
      total: 1,
    });
    api.get("/contracts/d-1", {
      booking_id: "d-1", vendor_id: "vendor-1", service_id: "svc-1", service_name: "Reception set",
      date_iso: "TBD", date_end: null, time_start: "TBD", time_end: "TBD", location: "TBD", guest_count: null,
      amount_cents: 140000, subtotal_cents: 140000, discount_cents: null,
      line_items: [{ id: "pkg", kind: "package", service_id: "svc-1", addon_id: null, name: "Reception set", description: null, unit: "event", unit_price_cents: 140000, quantity: 1, total_cents: 140000 }],
      payment_schedule: [{ id: "full", label: "Payment in full", amount_cents: 140000, due_type: "on_signing", due_date: null, due_days: null, marked_paid_at: null, confirmed_at: null }],
      terms_clauses: [], document_title: "Meera Patel — Reception set agreement", document_layout: null, revision: 1,
      deposit_percent: null, deposit_amount_cents: null, cancellation_window_hours: null, overtime_rate_cents: null,
      addon_rate_cents: null, contract_terms: null, guest_name: "Meera Patel", guest_email: "meera@example.com",
      guest_phone: null, signed_at: null, status: "approved", payment_status: "unpaid", contract_status: "draft",
      sent_at: null, viewed_at: null, hold_expires_at: null, contract_token: "tok-d1", vendor_display_name: "Priya Shah",
      proposal_status: null, timeline: [],
    });
    api.get("/bookings/vendor/vendor-1", { items: [], total: 0, limit: 100, offset: 0 });

    await page.goto("contracts/new/?edit=d-1");

    await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
    await expect(page.getByText("1 detail mentioned in chat")).toBeVisible();
  });

  test("an add-on named in chat and a discount are added with Use", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, [msg("m1", "Could you add drone coverage? I can do $200 off if we book this week.", ago(1))]);
    api.get("/services", {
      items: [{ service_id: "svc-1", vendor_id: "vendor-1", name: "Reception set", price: 1400, add_ons: [{ id: "ao-drone", name: "Drone coverage", price: 400, price_unit: "event" }] }],
      total: 1, limit: 100, offset: 0,
    });

    await page.goto("contracts/new/?conversation=c1&scratch=1");
    await page.getByText("2 details mentioned in chat").click();
    const list = page.getByRole("list", { name: "Mentioned in chat" });

    await list.getByRole("button", { name: "Use Drone coverage" }).click();
    await expect(page.getByRole("button", { name: "Remove Drone coverage" })).toBeVisible();
    await list.getByRole("button", { name: "Use $200 off" }).click();
    await expect(list.getByRole("button", { name: "Use $200 off" })).toHaveText("Used");
  });
});

