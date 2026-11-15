import { test, expect, loginAs } from "./support/fixtures";
import { mockBundleBooking, mockBundleDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// Messages grouped by event, and the single Account page (client redesign
// PR 8).

const now = new Date().toISOString();
const conv = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  conversation_id: id, name, type: "direct", subject_type: "enquiry", bundle_id: null, booking_id: null, member_count: 2,
  members: [{ user_id: "user-1", name: "Priya" }, { user_id: `v-${id}`, name }],
  unread_count: 0, last_message: { content: `Hello from ${name}`, created_at: now }, created_at: now, ...over,
});

function shell(api: ApiMock) {
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
}

test("chats sit under the event they belong to", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  api.get("/bundles", [
    mockBundleDetail({ bundle_id: "b-wed", event_name: "Priya's Wedding", bookings: [mockBundleBooking({ booking_id: "bk-1" })] }),
    mockBundleDetail({ bundle_id: "b-bday", event_name: "Anaya's Birthday", event_id: "event-2", bookings: [] }),
  ]);
  api.get("/conversations", [
    conv("c1", "Lens & Light", { subject_type: "booking", booking_id: "bk-1" }),
    conv("c2", "Tiny Table Catering", { subject_type: "bundle", bundle_id: "b-bday" }),
    conv("c3", "Bloom & Diya"),
  ]);
  await page.goto("messages/");

  await expect(page.getByRole("region", { name: "Priya's Wedding" }).getByRole("link")).toContainText("Lens & Light");
  await expect(page.getByRole("region", { name: "Anaya's Birthday" }).getByRole("link")).toHaveCount(1);
  // A question asked before anything was added to an event.
  await expect(page.getByRole("region", { name: "Other conversations" }).getByRole("link")).toContainText("Bloom & Diya");
});

test("Account holds profile, password, notifications and privacy, with sign out and delete", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  api.get("/bundles", []);
  await page.goto("profile/");

  // The old profile hub sends its links on.
  await expect(page).toHaveURL(/\/account\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const sections = page.getByRole("navigation", { name: "Account sections" });
  await sections.getByRole("button", { name: "Password & sign-in" }).click();
  await expect(page.getByLabel("Current password")).toBeVisible();

  await sections.getByRole("button", { name: "Privacy" }).click();
  await expect(page.getByRole("link", { name: /Blocked people/ })).toHaveAttribute("href", /\/blocked\/?$/);
  // Light only: no dark mode switch without the flag.
  await expect(page.getByText("Dark mode")).toHaveCount(0);
  // Deleting still checks what would be lost, then asks twice.
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("button", { name: "Delete my account permanently" })).toBeVisible();
});

test("a chat says where prices and changes are handled", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  api.get("/conversations/c1", conv("c1", "Lens & Light"));
  api.get("/conversations", [conv("c1", "Lens & Light")]);
  api.get("/conversations/c1/messages", { items: [], total: 0, limit: 100, offset: 0 });
  await page.goto("conversation/?id=c1");
  await expect(page.getByText("Prices and changes are handled in your event.")).toBeVisible();
});
