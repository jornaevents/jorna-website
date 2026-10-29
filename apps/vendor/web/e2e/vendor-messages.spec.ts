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
});

// Each thread's label (proposal: Messages V1). The words are the ones Leads
// and Bookings already use, worked out from the same pipeline and bookings
// the side panel reads; plan chats are left out of the list.
test.describe("vendor messages labels and tabs", () => {
  function mockLabelled(api: import("./support/api-mock").ApiMock) {
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "bk1", user_id: "client-c-booked", service_name: "Gold Photography", status: "approved",
          contract_token: "tok", signed_at: "2026-09-01T00:00:00Z", amount_cents: 250000,
        }),
        // A request from the client who first asked in c-question; the
        // pipeline links it to another thread, so only the client ties them.
        mockVendorBooking({ booking_id: "bk-q", user_id: "client-c-question", service_name: "Bridal Party Add-on" }),
      ],
      total: 2, limit: 100, offset: 0,
    });
    const item = (extra: Record<string, unknown>) => ({
      source: "request", stage: "inquiry", lead_id: null, booking_id: null, conversation_id: null, name: "Client",
      email: null, phone: null, event_name: null, event_date: "2027-05-01", event_date_end: null, location: "Pines Manor",
      service_name: null, estimated_value_cents: null, contract_status: null, hold_expires_at: null,
      attention: null, attention_reason: null, archived: false, outcome: null, created_at: now, updated_at: now,
      ...extra,
    });
    const pipeline = (leadStage: "inquiry" | "negotiation") => ({
      items: [
        item({ id: "lead:l1", source: "lead", lead_id: "l1", conversation_id: "c-lead", stage: leadStage }),
        item({ id: "booking:bk-n", source: "contract", booking_id: "bk-n", conversation_id: "c-nego", stage: "negotiation", contract_status: "sent", service_name: "Mehndi Deluxe" }),
        item({ id: "booking:bk-x", booking_id: "bk-x", conversation_id: "c-closed", archived: true, outcome: "declined" }),
        item({ id: "booking:bk-q", booking_id: "bk-q", conversation_id: "c-somewhere-else", service_name: "Bridal Party Add-on" }),
      ],
      counts: { inquiries: 2, negotiations: 1, needs_you: 0, waiting: 0, archived: 1 },
    });
    api.get("/leads/pipeline", pipeline("inquiry"));
    api.get("/conversations", [
      conv("c-booked", "Meera Shah", { subject_type: "booking", booking_id: "bk1" }),
      conv("c-lead", "Riya Kapoor"),
      conv("c-new", "Sana Omar"),
      conv("c-nego", "Kiran Rao"),
      conv("c-closed", "Dev Mehta"),
      conv("c-question", "Anika Bose"),
      conv("c-plan", "Sharma Wedding — All Parties", {
        subject_type: "bundle", type: "all_parties", member_count: 4,
        members: [{ user_id: "user-1" }, { user_id: "client-c-booked" }, { user_id: "v2" }, { user_id: "v3" }],
      }),
    ]);
    api.get("/conversations/unread-count", { unread_count: 0 });
    api.get("/conversations/:id/messages", { items: [], total: 0, limit: 100, offset: 0 });
    return { pipeline };
  }

  const row = (page: import("@playwright/test").Page, name: string) =>
    page.getByRole("complementary", { name: "Conversations" }).getByRole("button", { name: new RegExp(name) });

  test("each thread shows its Leads or Bookings label, and plan chats aren't listed", async ({ page, api }) => {
    await loginAs(page, api);
    mockLabelled(api);
    await page.goto("messages/");

    await expect(row(page, "Meera Shah")).toContainText("Booked");
    await expect(row(page, "Meera Shah")).toContainText("Gold Photography");
    await expect(row(page, "Riya Kapoor")).toContainText("Inquiry");
    await expect(row(page, "Kiran Rao")).toContainText("Negotiation");
    await expect(row(page, "Kiran Rao")).toContainText("Mehndi Deluxe");
    await expect(row(page, "Dev Mehta")).toContainText("Closed");
    // The request Leads filed under another thread still labels the client's question.
    await expect(row(page, "Anika Bose")).toContainText("Inquiry");
    await expect(row(page, "Anika Bose")).toContainText("Bridal Party Add-on");
    for (const label of ["Inquiry", "Negotiation", "Booked", "Closed"]) {
      await expect(row(page, "Sana Omar")).not.toContainText(label);
    }
    await expect(row(page, "Sharma Wedding")).toHaveCount(0);
  });

  test("Questions holds threads with no lead or booking; Leads & bookings holds the rest", async ({ page, api }) => {
    await loginAs(page, api);
    mockLabelled(api);
    await page.goto("messages/");

    await expect(page.getByRole("tab", { name: /Questions/ })).toContainText("1");
    await expect(page.getByRole("tab", { name: /Leads & bookings/ })).toContainText("5");

    await page.getByRole("tab", { name: /Questions/ }).click();
    await expect(row(page, "Sana Omar")).toBeVisible();
    for (const name of ["Meera Shah", "Riya Kapoor", "Kiran Rao", "Dev Mehta", "Anika Bose"]) {
      await expect(row(page, name)).toHaveCount(0);
    }

    await page.getByRole("tab", { name: /Leads & bookings/ }).click();
    await expect(row(page, "Sana Omar")).toHaveCount(0);
    for (const name of ["Meera Shah", "Riya Kapoor", "Kiran Rao", "Dev Mehta", "Anika Bose"]) {
      await expect(row(page, name)).toBeVisible();
    }

    await page.getByRole("tab", { name: /^All/ }).click();
    await expect(row(page, "Sana Omar")).toBeVisible();
    await expect(row(page, "Meera Shah")).toBeVisible();
  });

  test("the open thread's header and side panel say the same thing as its row", async ({ page, api }) => {
    await loginAs(page, api);
    mockLabelled(api);
    await page.goto("messages/?id=c-nego");

    const details = page.getByRole("complementary", { name: "Details" });
    await expect(details.getByText("Negotiation", { exact: true })).toBeVisible();
    await expect(details.getByRole("link", { name: "View lead" })).toHaveAttribute("href", /leads\/?\?open=booking%3Abk-n/);
    await expect(page.getByText(/^Negotiation · /)).toBeVisible();
  });

  test("a plan chat isn't listed but still opens from a link", async ({ page, api }) => {
    await loginAs(page, api);
    mockLabelled(api);
    await page.goto("messages/?id=c-plan");

    await expect(page.getByLabel("Write a message")).toBeVisible();
    await expect(row(page, "Sharma Wedding")).toHaveCount(0);
  });

  test("labels follow the pipeline without a reload, and a failed refresh keeps them", async ({ page, api }) => {
    await page.clock.install();
    await loginAs(page, api);
    const { pipeline } = mockLabelled(api);
    await page.goto("messages/");
    await expect(row(page, "Riya Kapoor")).toContainText("Inquiry");

    // The vendor sent Riya a contract on the Leads page.
    api.get("/leads/pipeline", pipeline("negotiation"));
    await page.clock.fastForward(26_000);
    await expect(row(page, "Riya Kapoor")).toContainText("Negotiation");

    api.error("GET", "/leads/pipeline", 500, "Server error");
    api.error("GET", "/bookings/vendor/vendor-1", 500, "Server error");
    const failed = (path: string) => page.waitForResponse((r) => r.url().includes(path) && r.status() === 500);
    const failures = Promise.all([failed("/leads/pipeline"), failed("/bookings/vendor/vendor-1")]);
    await page.clock.fastForward(26_000);
    await failures;
    // Let the page act on both failures before checking nothing was wiped.
    await page.waitForTimeout(500);
    await expect(row(page, "Riya Kapoor")).toContainText("Negotiation");
    await expect(row(page, "Meera Shah")).toContainText("Booked");
  });
});
