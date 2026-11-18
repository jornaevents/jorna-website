import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// Every contract starts from the client's inquiry form (backend DECISIONS
// #54): until a chat has one, the vendor's button sends the form instead of
// opening a contract, and the editor warns when it's opened anyway.

test.use({ viewport: { width: 1440, height: 900 } });

const now = new Date().toISOString();

function conv(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    conversation_id: id,
    name,
    subject_type: "enquiry",
    vendor_id: "vendor-1",
    member_count: 2,
    members: [
      { user_id: "user-1", name: "You" },
      { user_id: `client-${id}`, name },
    ],
    unread_count: 0,
    last_message: { content: `Hi from ${name}`, created_at: now },
    created_at: now,
    ...extra,
  };
}

function mockHub(api: ApiMock, conversations: unknown[], pipelineItems: unknown[] = []) {
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });
  api.get("/leads/pipeline", {
    items: pipelineItems,
    counts: { inquiries: pipelineItems.length, negotiations: 0, needs_you: 0, waiting: 0, archived: 0 },
  });
  api.get("/conversations", conversations);
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/conversations/:id/messages", { items: [], total: 0, limit: 100, offset: 0 });
}

function leadItem(conversationId: string, name: string) {
  return {
    id: "lead:l1", source: "lead", stage: "inquiry", booking_id: null, lead_id: "l1",
    conversation_id: conversationId, name, event_date: "2027-05-01", location: "Edison, NJ",
    service_name: null, estimated_value_cents: null, attention: "needs_you", attention_reason: "new_lead",
    archived: false, created_at: now, updated_at: now,
  };
}

test.describe("inquiry first", () => {
  test("a question chat sends the inquiry form instead of a contract", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api, [conv("c-q", "Meera Patel", { has_inquiry: false })]);
    api.post("/conversations/c-q/inquiry-request", {
      message_id: "m-r", conversation_id: "c-q", sender_id: "user-1", kind: "inquiry_request",
      content: "Priya Shah asked for your event details.", meta: { vendor_id: "vendor-1" }, created_at: now,
    });

    await page.goto("messages/?id=c-q");
    const details = page.getByRole("complementary", { name: "Details" });
    await expect(details.getByRole("link", { name: "Send contract" })).toHaveCount(0);

    await details.getByRole("button", { name: "Send inquiry form" }).click();

    await expect(page.getByText("Sent Meera the inquiry form.")).toBeVisible();
    await expect(details.getByRole("button", { name: "Inquiry form sent" })).toBeDisabled();
    expect(api.requestsTo("POST", "/conversations/c-q/inquiry-request")).toHaveLength(1);
  });

  test("a lead the vendor added isn't enough: the client still sends the form", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api, [conv("c-q", "Meera Patel", { has_inquiry: false })], [leadItem("c-q", "Meera Patel")]);

    await page.goto("messages/?id=c-q");
    const details = page.getByRole("complementary", { name: "Details" });

    await expect(details.getByRole("button", { name: "Send inquiry form" })).toBeVisible();
    await expect(details.getByRole("link", { name: "Send contract" })).toHaveCount(0);
  });

  test("once the client has sent the form, Send contract is back", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api, [conv("c-q", "Meera Patel", { has_inquiry: true })], [leadItem("c-q", "Meera Patel")]);

    await page.goto("messages/?id=c-q");
    const details = page.getByRole("complementary", { name: "Details" });

    await expect(details.getByRole("link", { name: "Send contract" })).toHaveAttribute(
      "href",
      /contracts\/new\/?\?conversation=c-q&lead=l1$/,
    );
    await expect(details.getByRole("button", { name: "Send inquiry form" })).toHaveCount(0);
  });

  test("the request shows in the chat as a card", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api, [conv("c-q", "Meera Patel", { has_inquiry: false })]);
    api.get("/conversations/c-q/messages", {
      items: [
        {
          message_id: "m-r", conversation_id: "c-q", sender_id: "user-1", sender_name: "Priya Shah",
          kind: "inquiry_request", content: "Priya Shah asked for your event details. Fill in the inquiry form…",
          meta: { vendor_id: "vendor-1" }, created_at: now,
        },
      ],
      total: 1, limit: 100, offset: 0,
    });

    await page.goto("messages/?id=c-q");

    await expect(page.getByText("You asked Meera Patel for their event details.")).toBeVisible();
    await expect(page.getByText("Once they fill in the inquiry form, you can send a contract.")).toBeVisible();
  });

  test("the editor opened without an inquiry warns, and can send the form", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    // A package, or the vendor shell sends a vendor with none to setup (#162).
    api.get("/services", {
      items: [{ service_id: "svc-1", vendor_id: vendor.vendor_id, name: "Reception set", price: 1400, add_ons: [] }],
      total: 1, limit: 100, offset: 0,
    });
    api.get("/contract-templates", { items: [], total: 0 });
    api.get("/conversations/c-q", conv("c-q", "Meera Patel", { has_inquiry: false }));
    api.post("/conversations/c-q/inquiry-request", {
      message_id: "m-r", conversation_id: "c-q", sender_id: "user-1", kind: "inquiry_request",
      content: "…", meta: {}, created_at: now,
    });

    await page.goto("contracts/new/?conversation=c-q&scratch=1");

    await expect(page.getByText("Meera hasn't sent their event details yet.")).toBeVisible();
    await page.getByRole("button", { name: "Send inquiry form" }).click();
    await expect(page.getByRole("button", { name: "Inquiry form sent" })).toBeDisabled();
    expect(api.requestsTo("POST", "/conversations/c-q/inquiry-request")).toHaveLength(1);
  });
});
