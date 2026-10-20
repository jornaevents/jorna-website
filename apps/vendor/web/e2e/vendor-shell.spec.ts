import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// Which chrome a page gets: every seller page (Calendar and Earnings
// included) sits inside VendorSidebar, and Messages — shared with clients —
// gets the sidebar for a vendor and the ordinary header for anyone else.
// See ChromeGate's useVendorShell.
test.describe("vendor sidebar shell", () => {
  const sidebar = (page: import("@playwright/test").Page) =>
    page.getByRole("navigation", { name: "Vendor" });

  test("Calendar is inside the sidebar, with its item lit", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });

    await page.goto("my-calendar/");

    await expect(page.getByRole("heading", { name: "Calendar", level: 1 })).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  });

  test("the sidebar's order, and the profile card is the way to the profile", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });

    await page.goto("my-calendar/");

    const names = (await sidebar(page).getByRole("link").allInnerTexts()).map((t) => t.replace(/\d+/g, "").trim());
    expect(names).toEqual(["Overview", "Bookings", "Leads", "Messages", "Contracts", "Calendar", "Earnings"]);
    await expect(page.getByRole("link", { name: /^Your profile/ }).first()).toHaveAttribute(
      "href",
      /\/vendor-profile\/?$/,
    );
  });

  test("a vendor reads Messages inside the sidebar, with the unread badge", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/conversations", []);
    api.get("/conversations/unread-count", { unread_count: 3 });

    await page.goto("messages/");

    const item = sidebar(page).getByRole("link", { name: /Messages/ });
    await expect(item).toHaveAttribute("aria-current", "page");
    await expect(item).toContainText("3");
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  });

  test("a client reads Messages under the ordinary header, no sidebar", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/conversations", []);
    api.get("/conversations/unread-count", { unread_count: 0 });

    await page.goto("messages/");

    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
  });
});
