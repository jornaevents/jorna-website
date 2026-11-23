import { test, expect, loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// Every contract starts from the inquiry form (backend DECISIONS #54): a
// chat that began with a question offers the form until it's sent, and a
// vendor's request for it shows as a card that opens it.

test.use({ viewport: { width: 1280, height: 900 } });

const now = new Date().toISOString();

function thread(extra: Record<string, unknown> = {}) {
  return {
    conversation_id: "c1",
    subject_type: "enquiry",
    booking_id: null,
    bundle_id: null,
    vendor_id: "vendor-1",
    name: "Lens and Light Studio",
    type: "direct",
    member_count: 2,
    members: [
      { user_id: "user-1", name: "Priya Shah" },
      { user_id: "vendor-user", name: "Lens and Light Studio" },
    ],
    unread_count: 0,
    last_message: null,
    created_at: now,
    ...extra,
  };
}

const REQUEST = {
  message_id: "m-r", conversation_id: "c1", sender_id: "vendor-user", sender_name: "Lens and Light Studio",
  kind: "inquiry_request", meta: { vendor_id: "vendor-1" }, created_at: now,
  content: "Lens and Light Studio asked for your event details. Fill in the inquiry form…",
};

function mockChat(api: ApiMock, conv: Record<string, unknown>, messages: unknown[]) {
  api.get("/conversations/c1", conv);
  api.get("/conversations", [conv]);
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/conversations/c1/messages", { items: messages, total: messages.length, limit: 100, offset: 0 });
  api.get("/vendors/vendor-1", mockVendorDetail({ business_name: "Lens and Light Studio" }));
}

test.describe("inquiry first, in the client's chat", () => {
  test("a question chat offers the inquiry form", async ({ page, api }) => {
    await loginAs(page, api);
    mockChat(api, thread({ has_inquiry: false }), []);

    await page.goto("conversation/?id=c1");

    await expect(page.getByText("Ready to book? Send Lens and Light Studio your event details")).toBeVisible();
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByRole("dialog", { name: "Send Lens and Light Studio an inquiry" })).toBeVisible();
  });

  test("the vendor's request is a card that opens the form", async ({ page, api }) => {
    await loginAs(page, api);
    mockChat(api, thread({ has_inquiry: false }), [REQUEST]);

    await page.goto("conversation/?id=c1");

    await expect(page.getByText("Lens and Light Studio asked for your event details.")).toBeVisible();
    await page.getByRole("button", { name: "Fill in inquiry" }).click();
    await expect(page.getByRole("dialog", { name: "Send Lens and Light Studio an inquiry" })).toBeVisible();
  });

  test("once it's sent, the card says so and nothing asks again", async ({ page, api }) => {
    await loginAs(page, api);
    mockChat(api, thread({ has_inquiry: true }), [REQUEST]);

    await page.goto("conversation/?id=c1");

    await expect(page.getByText("You've sent them.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Fill in inquiry" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send inquiry" })).toHaveCount(0);
  });

  test("an older backend with no has_inquiry shows no prompt", async ({ page, api }) => {
    await loginAs(page, api);
    mockChat(api, thread(), []);

    await page.goto("conversation/?id=c1");

    await expect(page.getByRole("heading", { name: "Lens and Light Studio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send inquiry" })).toHaveCount(0);
  });

  test("the form starts from what was agreed in chat", async ({ page, api }) => {
    await loginAs(page, api);
    const agreed = (id: string, field: string, value: string, label: string, status = "agreed") => ({
      message_id: id, conversation_id: "c1", sender_id: "vendor-user", sender_name: "Lens and Light Studio",
      kind: "detail_proposal", created_at: now, content: `Lens and Light Studio proposed ${label}.`,
      meta: { field, value, label, status, proposed_by: "vendor-user" },
    });
    mockChat(api, thread({ has_inquiry: false }), [
      agreed("p1", "guests", "150", "150 guests"),
      agreed("p2", "times", "16:00-22:30", "4:00 PM – 10:30 PM"),
      agreed("p3", "guests", "90", "90 guests", "declined"),
    ]);

    await page.goto("conversation/?id=c1");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    const sheet = page.getByRole("dialog", { name: "Send Lens and Light Studio an inquiry" });
    await expect(sheet.getByText("What you and Lens and Light Studio agreed in chat is filled in below.")).toBeVisible();
    await expect(sheet.locator('input[type="number"]')).toHaveValue("150");
    await expect(sheet.getByLabel("Guest count slider")).toHaveValue("150");
  });
});

