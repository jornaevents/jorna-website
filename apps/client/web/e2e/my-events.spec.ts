import { test, expect, loginAs } from "./support/fixtures";
import { mockBundleBooking, mockBundleDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// My Events, the client's home (client redesign PR 2): three counts across
// every celebration, a card per celebration with how many vendors are booked,
// and the first-visit welcome.

function shell(api: ApiMock) {
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
}

const stat = (page: import("@playwright/test").Page, label: string) =>
  page.getByRole("button", { name: new RegExp(label) });

test("counts events, booked vendors and what's left to find", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  api.get("/events", [
    { event_id: "event-1", user_id: "user-1", name: "Priya's Wedding", date_iso: "2099-05-22", location: "Edison, NJ", services_needed: ["photography", "catering", "dj"] },
    { event_id: "event-2", user_id: "user-1", name: "Anaya's Birthday", date_iso: "2099-12-12", location: "Jersey City, NJ", services_needed: ["decor"] },
  ]);
  api.get("/bundles", [mockBundleDetail({ status: "sent", bookings: [mockBundleBooking({ status: "approved", payment_status: "paid" })] })]);

  await page.goto("bundles/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
  await expect(stat(page, "Active events")).toContainText("2");
  await expect(stat(page, "Vendors booked")).toContainText("1");
  // Catering and DJ on the wedding, decor on the birthday.
  await expect(stat(page, "Vendors booked")).toContainText("3 vendors left to find");

  const wedding = page.getByRole("link", { name: /Priya's Wedding/ });
  await expect(wedding).toContainText("1 of 3 vendors booked");
  await expect(wedding).toHaveAttribute("href", /\/bundle\/?\?id=bundle-1$/);
  // No plan yet: the card starts one for this event, not a second event.
  const birthday = page.getByRole("link", { name: /Anaya's Birthday/ });
  await expect(birthday).toContainText("0 of 1 vendors booked");
  await expect(birthday).toHaveAttribute("href", /\/plan\/?\?event_id=event-2/);
});

test("the attention tile opens everything waiting on the client", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  api.get("/events", [{ event_id: "event-1", user_id: "user-1", name: "Priya's Wedding", date_iso: "2099-05-22", location: "Edison, NJ" }]);
  api.get("/bundles", [mockBundleDetail()]);

  await page.goto("bundles/");
  await stat(page, "Needs your attention").click();
  await expect(page).toHaveURL(/\/activity\/?$/);
});

test("a new client is welcomed and can plan a first event", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  api.get("/events", []);
  api.get("/bundles", []);

  await page.goto("bundles/");

  await expect(page.getByRole("heading", { name: "Your celebrations start here" })).toBeVisible();
  await page.getByRole("button", { name: "Plan your first event" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "What are you celebrating?" })).toBeVisible();
});
