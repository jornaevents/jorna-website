import { test, expect, loginAs } from "./support/fixtures";

// A contract sent in the chat (backend DECISIONS #48): a card in the thread,
// opened and signed in this app — no link to another site.

const now = new Date().toISOString();

const THREAD = {
  conversation_id: "c1",
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
};

const CONTRACT = {
  booking_id: "b9",
  vendor_display_name: "Lens and Light Studio",
  service_name: "Wedding photography",
  status: "approved",
  contract_status: "sent",
  date_iso: "2030-06-25",
  time_start: "10:00",
  time_end: "22:00",
  location: "TBD",
  guest_count: null,
  amount_cents: 600000,
  signed_at: null,
  payment_status: "unpaid",
  guest_name: "Priya Shah",
  guest_email: "priya@example.com",
  revision: 1,
};

test.describe("contracts in the chat", () => {
  test("a contract arrives as a card that opens it here", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/conversations/c1", THREAD);
    api.get("/conversations", [THREAD]);
    api.get("/conversations/unread-count", { unread_count: 0 });
    api.get("/conversations/c1/messages", {
      items: [
        {
          message_id: "m1", conversation_id: "c1", sender_id: "vendor-user", sender_name: "Lens and Light Studio",
          content: "Lens and Light Studio sent you a contract to review and sign.", created_at: now, kind: "contract",
          meta: { booking_id: "b9", contract_status: "sent" },
        },
      ],
      total: 1, limit: 100, offset: 0,
    });

    await page.goto("conversation/?id=c1");
    await expect(page.getByText("Lens and Light Studio sent you a contract to review and sign.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Review & sign" })).toHaveAttribute(
      "href",
      /\/contract\/?\?id=b9&sign=1$/,
    );
  });

  test("opened from the chat, it starts at the contract — no email step, no link message box", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/bookings/b9", { booking_id: "b9", contract_token: "tok-9" });
    api.get("/guest-bookings/tok-9", CONTRACT);

    await page.goto("contract/?id=b9&sign=1");

    await expect(page.getByRole("button", { name: "Looks good — sign it" })).toBeVisible();
    await expect(page.getByText("Where should we send your copy?")).toHaveCount(0);
    const steps = page.getByRole("navigation", { name: "Steps" });
    await expect(steps.getByText("Email")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "← The contract" })).toHaveAttribute("href", /contract\/?\?t=tok-9$/);
  });

  test("without a name on file yet, it asks for their details first", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/bookings/b9", { booking_id: "b9", contract_token: "tok-9" });
    api.get("/guest-bookings/tok-9", { ...CONTRACT, guest_name: null });

    await page.goto("contract/?id=b9&sign=1");

    await expect(page.getByLabel("Your full name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  });

  test("a booking with no contract says so", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/bookings/b9", { booking_id: "b9", contract_token: null });

    await page.goto("contract/?id=b9&sign=1");

    await expect(page.getByText("There's no contract on this booking yet.")).toBeVisible();
  });
});
