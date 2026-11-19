import { test, expect, loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// Propose a detail in chat (backend DECISIONS #59): the vendor's proposal is a
// card the client agrees to or declines, and the client can propose too.

test.use({ viewport: { width: 1280, height: 900 } });

const now = new Date().toISOString();
const THREAD = {
  conversation_id: "c1", subject_type: "enquiry", booking_id: null, bundle_id: null, vendor_id: "vendor-1",
  name: "Lens and Light Studio", type: "direct", member_count: 2, has_inquiry: true,
  members: [{ user_id: "user-1", name: "Priya Shah" }, { user_id: "vendor-user", name: "Lens and Light Studio" }],
  unread_count: 0, last_message: null, created_at: now,
};
const PROPOSAL = {
  message_id: "p1", conversation_id: "c1", sender_id: "vendor-user", sender_name: "Lens and Light Studio",
  kind: "detail_proposal", created_at: now, content: "Lens and Light Studio proposed the times: 4:00 PM – 10:00 PM.",
  meta: { field: "times", value: "16:00-22:00", label: "4:00 PM – 10:00 PM", status: "open", proposed_by: "vendor-user" },
};

function mockChat(api: import("./support/api-mock").ApiMock, messages: unknown[]) {
  api.get("/conversations/c1", THREAD);
  api.get("/conversations", [THREAD]);
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/conversations/c1/messages", { items: messages, total: messages.length, limit: 100, offset: 0 });
  api.get("/vendors/vendor-1", mockVendorDetail({ business_name: "Lens and Light Studio" }));
}

test.describe("detail proposals, client side", () => {
  test("the vendor's proposal is agreed to from its card", async ({ page, api }) => {
    await loginAs(page, api);
    mockChat(api, [PROPOSAL]);
    api.post("/conversations/c1/details/p1/agree", { ...PROPOSAL, meta: { ...PROPOSAL.meta, status: "agreed" } });

    await page.goto("conversation/?id=c1");

    await expect(page.getByText("Lens and Light Studio proposed", { exact: true })).toBeVisible();
    await expect(page.getByText("4:00 PM – 10:00 PM")).toBeVisible();
    await page.getByRole("button", { name: "Agree" }).click();
    await expect(page.getByText("Agreed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agree" })).toHaveCount(0);
    expect(api.requestsTo("POST", "/conversations/c1/details/p1/agree")).toHaveLength(1);
  });

  test("the client proposes a guest count", async ({ page, api }) => {
    await loginAs(page, api);
    mockChat(api, []);
    api.get("/services", { items: [], total: 0, limit: 50, offset: 0 });
    api.post("/conversations/c1/details", {
      message_id: "p2", conversation_id: "c1", sender_id: "user-1", sender_name: "Priya Shah", kind: "detail_proposal",
      created_at: now, content: "Priya proposed a guest count: 150 guests.",
      meta: { field: "guests", value: "150", label: "150 guests", status: "open", proposed_by: "user-1" },
    });

    await page.goto("conversation/?id=c1");
    await page.getByRole("button", { name: "Propose a detail" }).click();
    const form = page.getByRole("form", { name: "Propose a detail" });
    await form.getByRole("radio", { name: "Guests" }).click();
    await form.getByLabel("Guest count").fill("150");
    await form.getByRole("button", { name: "Propose" }).click();

    await expect(page.getByText("You proposed")).toBeVisible();
    await expect(page.getByText("Waiting for an answer")).toBeVisible();
    expect(api.requestsTo("POST", "/conversations/c1/details")[0].body).toEqual({ field: "guests", value: "150" });
  });
});
