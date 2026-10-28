import { test, expect, loginAs } from "./support/fixtures";

// "Answer on the booking" on a price offer lands on that booking's card. An
// offer can sit in the client's question thread, which has no booking of its
// own, so the offer says which booking (and plan) it's about.

const now = new Date().toISOString();

function thread(id: string, extra: Record<string, unknown> = {}) {
  return {
    conversation_id: id,
    subject_type: "enquiry",
    booking_id: null,
    bundle_id: null,
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

function offer(meta: Record<string, unknown>) {
  return {
    items: [
      {
        message_id: "o1", conversation_id: "c1", sender_id: "vendor-user", sender_name: "Lens and Light Studio",
        content: "Lens and Light offered $2,200.", created_at: now, kind: "offer",
        meta: { amount_cents: 220000, action: "offer", ...meta },
      },
    ],
    total: 1, limit: 100, offset: 0,
  };
}

function mockThread(api: import("./support/api-mock").ApiMock, conv: Record<string, unknown>, meta: Record<string, unknown>) {
  api.get("/conversations/c1", conv);
  api.get("/conversations/c1/messages", offer(meta));
  api.get("/conversations", [conv]);
  api.get("/conversations/unread-count", { unread_count: 0 });
}

test.describe("price offers in a conversation (/conversation)", () => {
  test("an offer in a question thread links to the booking it carries", async ({ page, api }) => {
    await loginAs(page, api);
    mockThread(api, thread("c1"), { booking_id: "b2", bundle_id: "plan2" });

    await page.goto("conversation/?id=c1");

    await expect(page.getByText("Their offer")).toBeVisible();
    await expect(page.getByRole("link", { name: /Answer on the booking/ })).toHaveAttribute(
      "href",
      /bundle\/?\?id=plan2#booking-b2/,
    );
  });

  test("an older offer without a booking still uses its booking thread", async ({ page, api }) => {
    await loginAs(page, api);
    mockThread(api, thread("c1", { subject_type: "booking", booking_id: "b1", bundle_id: "plan1" }), {});

    await page.goto("conversation/?id=c1");

    await expect(page.getByRole("link", { name: /Answer on the booking/ })).toHaveAttribute(
      "href",
      /bundle\/?\?id=plan1#booking-b1/,
    );
  });

  test("an offer with no plan to land on goes to the plans list", async ({ page, api }) => {
    await loginAs(page, api);
    mockThread(api, thread("c1"), { booking_id: "b2", bundle_id: null });

    await page.goto("conversation/?id=c1");

    await expect(page.getByRole("link", { name: /Answer on the booking/ })).toHaveAttribute("href", /\/bundles\/?$/);
  });
});
