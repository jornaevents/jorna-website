import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { Page } from "@playwright/test";
import type { ApiMock } from "./support/api-mock";

// Which version a screen gets (globals.css's desk: variant): every laptop
// gets the desktop one — a zoomed-in MacBook is a narrow window, not a phone —
// and only phones get the menu button, even turned sideways.
async function openOverview(page: Page, api: ApiMock) {
  await loginAs(page, api);
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });
  api.get("/leads", { items: [], total: 0 });
  api.get("/conversations", []);
  api.get("/conversations/unread-count", { unread_count: 0 });
  await page.goto("overview/");
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible();
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Vendor" });
const menuButton = (page: Page) => page.getByRole("button", { name: "Menu" });

test.describe("a laptop window", () => {
  // A 1280px MacBook at 160% zoom.
  test.use({ viewport: { width: 800, height: 700 } });

  test("gets the sidebar as icons, leaving the page its room", async ({ page, api }) => {
    await openOverview(page, api);
    await expect(sidebar(page)).toBeVisible();
    await expect(menuButton(page)).toBeHidden();
    expect((await sidebar(page).boundingBox())!.width).toBeLessThan(80);
    // Still named, for screen readers and on hover.
    await expect(sidebar(page).getByRole("link", { name: "Bookings" })).toHaveAttribute("title", "Bookings");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  });
});

test.describe("a laptop at full size", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("gets the full sidebar", async ({ page, api }) => {
    await openOverview(page, api);
    await expect(sidebar(page).getByText("Bookings")).toBeVisible();
    expect((await sidebar(page).boundingBox())!.width).toBeGreaterThan(180);
  });
});

test.describe("a wide window", () => {
  test.use({ viewport: { width: 2560, height: 1000 } });

  test("keeps the page next to the sidebar rather than centred away from it", async ({ page, api }) => {
    await openOverview(page, api);
    const rail = await sidebar(page).boundingBox();
    const heading = await page.getByText(/Good (morning|afternoon|evening)/).boundingBox();
    expect(heading!.x - (rail!.x + rail!.width)).toBeLessThan(120);
  });
});

test.describe("a phone turned sideways", () => {
  test.use({ viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true });

  test("keeps the phone version", async ({ page, api }) => {
    await openOverview(page, api);
    await expect(menuButton(page)).toBeVisible();
    await expect(sidebar(page)).toBeHidden();
  });
});

test.describe("a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("gets the menu button", async ({ page, api }) => {
    await openOverview(page, api);
    await expect(menuButton(page)).toBeVisible();
    await expect(sidebar(page)).toBeHidden();
  });
});
