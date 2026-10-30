import { test, expect, loginAs } from "./support/fixtures";
import { mockBundleDetail } from "./support/mock-data";

// The client root used to be a second landing page; since the client app moved
// onto jornaevents.com (2026-10-29) it only sends people where they belong.
test.describe("client root", () => {
  test("a signed-out visitor goes to For clients on the main site", async ({ page }) => {
    await page.route("https://jornaevents.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "for clients" }),
    );
    await page.goto("");

    await expect(page).toHaveURL("https://jornaevents.com/app/for-clients/");
  });

  test("a signed-in client with a plan goes to their dashboard", async ({ page, api }) => {
    await loginAs(page, api);
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/bundles", [mockBundleDetail()]);
    api.get("/events", []);
    api.get("/conversations/unread-count", { unread_count: 0 });

    await page.goto("home/");

    await expect(page).toHaveURL(/\/client\/bundles\/?$/);
  });

  test("the client tabs have no Home beside the Dashboard", async ({ page, api }) => {
    await loginAs(page, api);
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations/unread-count", { unread_count: 0 });

    await page.goto("marketplace/");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveCount(0);
  });
});
