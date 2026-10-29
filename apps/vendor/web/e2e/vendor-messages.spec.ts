import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Messages for a vendor (redesign step 4): list, thread and a side panel that
// says what this couple is to them. Conversation only — offers point to Leads.

test.use({ viewport: { width: 1440, height: 900 } });

const now = new Date().toISOString();

function conv(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    conversation_id: id,
    name,
    subject_type: "enquiry",
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

function mockHub(api: import("./support/api-mock").ApiMock) {
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  api.get(`/bookings/vendor/${vendor.vendor_id}`, {
    items: [
      mockVendorBooking({
        booking_id: "bk1",
        event_name: "Meera & Arjun",
        status: "approved",
        contract_token: "tok",
        signed_at: "2026-09-01T00:00:00Z",
        amount_cents: 250000,
      }),
    ],
    total: 1,
    limit: 100,
    offset: 0,
  });
  api.get("/leads/pipeline", {
    items: [
      {
        id: "lead:l1", source: "lead", stage: "inquiry", booking_id: null, lead_id: "l1",
        conversation_id: "c-lead", name: "Riya Kapoor", event_date: "2027-05-01", location: "Pines Manor",
        service_name: null, estimated_value_cents: null, attention: "needs_you", attention_reason: "new_lead",
        archived: false, created_at: now, updated_at: now,
      },
    ],
    counts: { inquiries: 1, negotiations: 0, needs_you: 1, waiting: 0, archived: 0 },
  });
  api.get("/conversations", [
    conv("c-booked", "Meera Shah", { subject_type: "booking", booking_id: "bk1", unread_count: 2 }),
    conv("c-lead", "Riya Kapoor"),
    conv("c-new", "Sana Omar"),
  ]);
  api.get("/conversations/unread-count", { unread_count: 2 });
  api.get("/conversations/:id/messages", { items: [], total: 0, limit: 100, offset: 0 });
}

test.describe("vendor messages hub (/messages)", () => {
  test("lists threads, filters unread, and opens one with its booking alongside", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api);
    api.post("/conversations/c-booked/messages", {
      message_id: "m1", conversation_id: "c-booked", sender_id: "user-1", content: "See you on the day!", created_at: now, kind: "text",
    });

    await page.goto("messages/");
    const list = page.getByRole("complementary", { name: "Conversations" });
    await expect(list.getByText("Riya Kapoor", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Unread/ }).click();
    await expect(list.getByText("Riya Kapoor", { exact: true })).toHaveCount(0);
    await list.getByRole("button", { name: /Meera Shah/ }).click();

    await expect(page).toHaveURL(/messages\/?\?id=c-booked/);
    const details = page.getByRole("complementary", { name: "Details" });
    await expect(details.getByRole("link", { name: "View booking" })).toHaveAttribute("href", /my-bookings\/?\?id=bk1/);
    await expect(details.getByRole("link", { name: /Service agreement/ })).toBeVisible();

    await page.getByLabel("Write a message").fill("See you on the day!");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("See you on the day!")).toBeVisible();
    expect(api.requestsTo("POST", "/conversations/c-booked/messages")).toHaveLength(1);
  });

  test("a thread that's a lead links to it; one that's neither can be added", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api);
    api.post("/conversations/c-new/lead", { lead_id: "l9", name: "Sana Omar", status: "new" });

    await page.goto("messages/?id=c-lead");
    const details = page.getByRole("complementary", { name: "Details" });
    await expect(details.getByRole("link", { name: "View lead" })).toHaveAttribute("href", /leads\/?\?open=lead%3Al1/);

    await page.getByRole("complementary", { name: "Conversations" }).getByRole("button", { name: /Sana Omar/ }).click();
    await details.getByRole("button", { name: "Add to leads" }).click();
    await expect(page.getByText("Added to your leads.")).toBeVisible();
    expect(api.requestsTo("POST", "/conversations/c-new/lead")).toHaveLength(1);
  });

  test("mark as unread closes the thread", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api);
    api.post("/conversations/c-lead/unread", { conversation_id: "c-lead", unread_count: 1 });

    await page.goto("messages/?id=c-lead");
    await page.getByRole("complementary", { name: "Details" }).getByRole("button", { name: "Mark as unread" }).click();

    await expect(page).toHaveURL(/\/messages\/?$/);
    expect(api.requestsTo("POST", "/conversations/c-lead/unread")).toHaveLength(1);
  });

  test("an old /conversation link opens in the hub", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api);

    await page.goto("conversation/?id=c-lead");

    await expect(page).toHaveURL(/messages\/?\?id=c-lead/);
  });

  test("New message starts a thread with a couple you have a booking with", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api);
    api.post("/conversations/booking/bk1", conv("c-booked", "Meera Shah", { booking_id: "bk1" }));

    await page.goto("messages/");
    await page.getByRole("button", { name: "New message" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Priya Shah/ }).click();

    await expect(page).toHaveURL(/messages\/?\?id=c-booked/);
    expect(api.requestsTo("POST", "/conversations/booking/bk1")).toHaveLength(1);
  });

  test("a price offer points to Leads, not a button in the chat", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api);
    api.get("/conversations/c-booked/messages", {
      items: [
        {
          message_id: "o1", conversation_id: "c-booked", sender_id: "client-c-booked", sender_name: "Meera Shah",
          content: "Meera offered $2,200.", created_at: now, kind: "offer", meta: { amount_cents: 220000 },
        },
      ],
      total: 1, limit: 100, offset: 0,
    });

    await page.goto("messages/?id=c-booked");

    await expect(page.getByText("Their offer")).toBeVisible();
    await expect(page.getByRole("link", { name: /Answer in Leads/ })).toHaveAttribute("href", /leads\/?\?open=booking%3Abk1/);
  });

  test("a client reading in this app is sent to the booking the offer carries", async ({ page, api }) => {
    await loginAs(page, api);
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    const thread = conv("c-q", "Lens and Light Studio");
    api.get("/conversations/c-q", thread);
    api.get("/conversations", [thread]);
    api.get("/conversations/unread-count", { unread_count: 0 });
    api.get("/conversations/c-q/messages", {
      items: [
        {
          message_id: "o3", conversation_id: "c-q", sender_id: "client-c-q", sender_name: "Lens and Light Studio",
          content: "Lens and Light offered $2,200.", created_at: now, kind: "offer",
          meta: { amount_cents: 220000, action: "offer", booking_id: "b2", bundle_id: "plan2" },
        },
      ],
      total: 1, limit: 100, offset: 0,
    });

    await page.goto("conversation/?id=c-q");

    await expect(page.getByRole("link", { name: /Answer on the booking/ })).toHaveAttribute(
      "href",
      /bundle\/?\?id=plan2#booking-b2/,
    );
  });

  test("a price offer in a question thread points to the booking it carries", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api);
    api.get("/conversations/c-new/messages", {
      items: [
        {
          message_id: "o2", conversation_id: "c-new", sender_id: "client-c-new", sender_name: "Sana Omar",
          content: "Sana offered $1,800.", created_at: now, kind: "offer",
          meta: { amount_cents: 180000, action: "counter", booking_id: "bk-sana", bundle_id: null },
        },
      ],
      total: 1, limit: 100, offset: 0,
    });

    await page.goto("messages/?id=c-new");

    await expect(page.getByText("Their offer")).toBeVisible();
    await expect(page.getByRole("link", { name: /Answer in Leads/ })).toHaveAttribute("href", /leads\/?\?open=booking%3Abk-sana/);
  });
});
