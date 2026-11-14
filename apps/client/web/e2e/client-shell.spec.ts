import { test, expect, loginAs } from "./support/fixtures";
import type { Page } from "@playwright/test";
import type { ApiMock } from "./support/api-mock";

// The shell from the Jorna-Client design (client redesign plan, PR 1): four
// tabs — My Events, Explore, Messages, Account — as a top bar on a laptop and
// a tab bar along the bottom on a phone. The old pages open under the tab
// they belong to until each is redesigned.

function signedIn(api: ApiMock, unread = 0) {
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/bundles", []);
  api.get("/events", []);
  api.get("/conversations", []);
  api.get("/conversations/unread-count", { unread_count: unread });
}

const primary = (page: Page) => page.getByRole("navigation", { name: "Primary" });

test.describe("on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Explore, My Events and Messages, with the initials opening Account", async ({ page, api }) => {
    await loginAs(page, api);
    signedIn(api, 3);
    await page.goto("marketplace/");

    const links = primary(page).getByRole("link");
    await expect(links).toHaveCount(3);
    await expect(links.nth(0)).toHaveText("Explore");
    await expect(links.nth(0)).toHaveAttribute("aria-current", "page");
    await expect(primary(page).getByRole("link", { name: "Messages, 3 unread" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Account" })).toHaveAttribute("href", /\/profile\/?$/);
    // Sign out lives on Account now, and the site is light only.
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /dark mode|light mode/ })).toHaveCount(0);
  });

  for (const [path, tab] of [
    ["plan/", "My Events"],
    ["activity/", "My Events"],
    ["book/?service=svc-1", "Explore"],
    ["conversation/?id=c1", "Messages"],
  ] as const) {
    test(`${path} opens under ${tab}`, async ({ page, api }) => {
      await loginAs(page, api);
      signedIn(api);
      await page.goto(path);
      await expect(primary(page).getByRole("link", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-current", "page");
    });
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the four tabs sit along the bottom, and the top bar keeps the wordmark", async ({ page, api }) => {
    await loginAs(page, api);
    signedIn(api);
    await page.goto("profile/");

    const bar = primary(page);
    await expect(bar.getByRole("link")).toHaveText(["My Events", "Explore", "Messages", "Account"]);
    await expect(bar.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(830);
    await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  });
});

test("signed out, there are no tabs", async ({ page, api }) => {
  api.get("/vendors/search", { items: [], total: 0, limit: 20, offset: 0 });
  await page.goto("marketplace/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(primary(page)).toHaveCount(0);
});
