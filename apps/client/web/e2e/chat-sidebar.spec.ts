import { test, expect, loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// Beside a client's chat with one vendor (2026-11-16): the vendor, where the
// contract stands with its action, and the payment schedule.

const now = new Date().toISOString();

const THREAD = {
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
  location: "Pines Manor, Edison, NJ",
  amount_cents: 600000,
  signed_at: null,
  payment_status: "unpaid",
  guest_name: "Priya Shah",
  guest_email: "priya@example.com",
  revision: 1,
};

function mockThread(api: import("./support/api-mock").ApiMock, contract: Record<string, unknown>) {
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
  api.get("/vendors/vendor-1", mockVendorDetail({ business_name: "Lens and Light Studio", category: "photography", rating: 4.8, location: "Edison, NJ" }));
  api.get("/bookings/b9", { booking_id: "b9", contract_token: "tok-9" });
  api.get("/guest-bookings/tok-9", contract);
}

test.describe("chat sidebar", () => {
  test("shows the vendor, the contract waiting on the client, and how to act on it", async ({ page, api }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, api);
    mockThread(api, CONTRACT);

    await page.goto("conversation/?id=c1");
    const side = page.getByRole("complementary", { name: "About this booking" });
    await expect(side.getByText("Lens and Light Studio")).toBeVisible();
    await expect(side.getByRole("link", { name: "See their page" })).toHaveAttribute("href", /vendor\/?\?id=vendor-1$/);
    await expect(side.getByText("Wedding photography")).toBeVisible();
    await expect(side.getByRole("link", { name: "Review & sign" })).toHaveAttribute("href", /contract\/?\?t=tok-9&sign=1$/);
    // Unsigned: nothing to pay yet.
    await expect(side.getByText("Payments")).toHaveCount(0);
  });

  test("while the client's changes are with the vendor, it says so instead", async ({ page, api }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, api);
    mockThread(api, { ...CONTRACT, sign_blockers: ["waiting_on_vendor"] });

    await page.goto("conversation/?id=c1");
    const side = page.getByRole("complementary", { name: "About this booking" });
    await expect(side.getByText(/Waiting on Lens and Light Studio/)).toBeVisible();
    await expect(side.getByRole("link", { name: "Review & sign" })).toHaveCount(0);
  });

  test("once signed it lists the payments; on a phone it's behind Details", async ({ page, api }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, api);
    mockThread(api, {
      ...CONTRACT,
      contract_status: "signed",
      client_signed_at: "2030-03-01T10:00:00+00:00",
      signed_at: "2030-03-01T12:00:00+00:00",
      vendor_signer_name: "Lens and Light Studio",
      payment_schedule: [
        { id: "dep", label: "Deposit", amount_cents: 30_000, due_type: "on_signing", effective_due: "2030-03-01",
          marked_paid_at: "2030-03-01T10:00:00+00:00", confirmed_at: "2030-03-02T10:00:00+00:00" },
        { id: "bal", label: "Final balance", amount_cents: 570_000, due_type: "before_event", effective_due: "2030-06-11",
          marked_paid_at: null, confirmed_at: null },
      ],
    });

    await page.goto("conversation/?id=c1");
    const side = page.getByRole("complementary", { name: "About this booking" });
    await expect(side).toBeHidden();
    await page.getByRole("button", { name: "Details" }).click();
    await expect(side.getByText("Payments")).toBeVisible();
    await expect(side.getByText("Final balance")).toBeVisible();
    await expect(side.getByRole("link", { name: "Open the contract" })).toHaveAttribute("href", /contract\/?\?id=b9$/);
  });
});
