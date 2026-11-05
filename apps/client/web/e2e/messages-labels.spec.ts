import { test, expect, loginAs } from "./support/fixtures";
import type { ApiMock } from "./support/api-mock";

// Each chat with a vendor shows where things stand with them: Inquiry,
// Negotiation, Booked or Closed, with the package — the label that vendor
// sees on the same chat. The backend works it out and sends it as `label`.

const now = new Date().toISOString();

function chat(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    conversation_id: id,
    subject_type: "enquiry",
    booking_id: null,
    bundle_id: null,
    name,
    type: "direct",
    member_count: 2,
    members: [
      { user_id: "user-1", name: "Priya Shah" },
      { user_id: `vendor-${id}`, name },
    ],
    unread_count: 0,
    label: null,
    last_message: { content: "See you then", sender_id: `vendor-${id}`, kind: "text", created_at: now },
    created_at: now,
    ...extra,
  };
}

const label = (stage: string, service_name: string | null, booking_id = `b-${stage}`) => ({
  label: { stage, booking_id, service_name },
});

const INBOX = [
  chat("c-inq", "Lens and Light Studio", label("inquiry", "Gold Photography")),
  chat("c-neg", "Dhol Brothers", label("negotiation", "Baraat Dhol")),
  chat("c-book", "Spice Route Catering", { subject_type: "booking", booking_id: "b-booked", ...label("booked", "Dinner Buffet") }),
  chat("c-closed", "Mehndi by Asha", label("closed", null)),
  chat("c-none", "DJ Raj"),
  chat("c-future", "Floral Co", label("deposit_due", "Mandap Flowers")),
  {
    ...chat("c-plan", "Wedding weekend", { subject_type: "bundle", bundle_id: "plan1", type: "all_parties" }),
    member_count: 4,
  },
];

function row(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("link").filter({ hasText: name });
}

function messages(items: unknown[] = []) {
  return { items, total: items.length, limit: 100, offset: 0 };
}

function mockInbox(api: ApiMock) {
  api.get("/conversations", INBOX);
  api.get("/conversations/unread-count", { unread_count: 0 });
}

test.describe("labels on the client's chats (/messages)", () => {
  test("each vendor chat shows its label and package", async ({ page, api }) => {
    await loginAs(page, api);
    mockInbox(api);
    await page.goto("messages");

    for (const [name, text, pkg] of [
      ["Lens and Light Studio", "Inquiry", "Gold Photography"],
      ["Dhol Brothers", "Negotiation", "Baraat Dhol"],
      ["Spice Route Catering", "Booked", "Dinner Buffet"],
    ]) {
      await expect(row(page, name).getByText(text, { exact: true })).toBeVisible();
      await expect(row(page, name).getByText(pkg, { exact: true })).toBeVisible();
    }
    // A label with no package: just the pill.
    await expect(row(page, "Mehndi by Asha").getByText("Closed", { exact: true })).toBeVisible();
  });

  test("chats with nothing to label show no pill", async ({ page, api }) => {
    await loginAs(page, api);
    mockInbox(api);
    await page.goto("messages");

    await expect(row(page, "DJ Raj")).toBeVisible();
    for (const name of ["DJ Raj", "Wedding weekend"]) {
      for (const text of ["Inquiry", "Negotiation", "Booked", "Closed"]) {
        await expect(row(page, name).getByText(text, { exact: true })).toHaveCount(0);
      }
    }
    // A stage this app doesn't know yet is left off, not shown blank.
    await expect(row(page, "Floral Co")).toBeVisible();
    await expect(row(page, "Floral Co").getByText("Mandap Flowers")).toHaveCount(0);
  });

  test("the labels use the pill colours, in light and in dark", async ({ page, api }) => {
    await loginAs(page, api);
    mockInbox(api);

    const colours = async () => {
      const pill = row(page, "Spice Route Catering").getByText("Booked", { exact: true });
      await expect(pill).toBeVisible();
      return pill.evaluate((el) => {
        const s = getComputedStyle(el);
        return { ink: s.color, bg: s.backgroundColor };
      });
    };

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("messages");
    const light = await colours();
    expect(light).toEqual({ ink: "rgb(62, 109, 85)", bg: "rgb(226, 238, 230)" });

    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await colours();
    expect(dark).toEqual({ ink: "rgb(159, 208, 173)", bg: "rgba(127, 180, 142, 0.16)" });
  });

  test("the list keeps its filters; labels add no tabs", async ({ page, api }) => {
    await loginAs(page, api);
    mockInbox(api);
    await page.goto("messages");

    await expect(page.getByRole("button", { name: /^All · 7$/ })).toBeVisible();
    await page.getByRole("button", { name: /^Vendors · 6$/ }).click();
    await expect(row(page, "Wedding weekend")).toHaveCount(0);
    await expect(row(page, "Dhol Brothers").getByText("Negotiation", { exact: true })).toBeVisible();
  });
});

test.describe("the label in a chat's header (/conversation)", () => {
  test("shows the label and package under the vendor's name", async ({ page, api }) => {
    await loginAs(page, api);
    mockInbox(api);
    api.get("/conversations/c-neg", INBOX[1]);
    api.get("/conversations/c-neg/messages", messages());
    await page.goto("conversation/?id=c-neg");

    await expect(page.getByRole("heading", { name: "Dhol Brothers" })).toBeVisible();
    await expect(page.getByText("Negotiation", { exact: true })).toBeVisible();
    await expect(page.getByText("Baraat Dhol", { exact: true })).toBeVisible();
  });

  test("a chat with nothing to label shows none", async ({ page, api }) => {
    await loginAs(page, api);
    mockInbox(api);
    api.get("/conversations/c-none", INBOX[4]);
    api.get("/conversations/c-none/messages", messages());
    await page.goto("conversation/?id=c-none");

    await expect(page.getByRole("heading", { name: "DJ Raj" })).toBeVisible();
    await expect(page.getByText("Just the two of you")).toBeVisible();
    for (const text of ["Inquiry", "Negotiation", "Booked", "Closed"]) {
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    }
  });

  test("a new booking step in the chat updates the label", async ({ page, api }) => {
    await loginAs(page, api);
    mockInbox(api);
    let stage = "inquiry";
    api.get("/conversations/c-inq", () => ({ ...INBOX[0], ...label(stage, "Gold Photography") }));
    let items: unknown[] = [];
    api.get("/conversations/c-inq/messages", () => messages(items));
    await page.goto("conversation/?id=c-inq");
    await expect(page.getByText("Inquiry", { exact: true })).toBeVisible();

    // The vendor sends the contract: a system line arrives on the next poll,
    // and the chat now reads Negotiation.
    stage = "negotiation";
    items = [{
      message_id: "s1", conversation_id: "c-inq", sender_id: "vendor-c-inq", sender_name: "Lens and Light Studio",
      content: "Lens and Light Studio sent you a contract.", created_at: new Date().toISOString(), kind: "system",
      meta: { booking_id: "b-inquiry" },
    }];
    await expect(page.getByText("Lens and Light Studio sent you a contract.")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Negotiation", { exact: true })).toBeVisible();
    await expect(page.getByText("Inquiry", { exact: true })).toHaveCount(0);
  });

  test("a plain text message doesn't re-read the header", async ({ page, api }) => {
    await loginAs(page, api);
    mockInbox(api);
    let reads = 0;
    api.get("/conversations/c-inq", () => {
      reads += 1;
      return INBOX[0];
    });
    let items: unknown[] = [];
    api.get("/conversations/c-inq/messages", () => messages(items));
    await page.goto("conversation/?id=c-inq");
    await expect(page.getByText("Inquiry", { exact: true })).toBeVisible();
    const before = reads;

    items = [{
      message_id: "t1", conversation_id: "c-inq", sender_id: "vendor-c-inq", sender_name: "Lens and Light Studio",
      content: "Happy to help!", created_at: new Date().toISOString(), kind: "text",
    }];
    await expect(page.getByText("Happy to help!")).toBeVisible({ timeout: 10000 });
    expect(reads).toBe(before);
  });
});
