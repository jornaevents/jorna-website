import { test, expect } from "./support/fixtures";

// For clients and For vendors (Figma, 2026-10): each draws its own header and
// footer, and every action has to land somewhere real — the client app for a
// client, this app's sign-up for a vendor. Pure layout is left to a manual
// pass; these pin the routing.
test.describe("landing pages (For clients / For vendors)", () => {
  test("For clients sends every action to the client app", async ({ page }) => {
    await page.goto("for-clients/");

    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "Plan your celebration" })).toHaveAttribute(
      "href",
      /^https:\/\/[^/]+\/client\/login\/\?mode=register$/,
    );
    // The one sign-in, on this app (it sends a client on to their dashboard).
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /\/app\/login\/?$/);
    // Trailing slashes, so no 308 on the way there.
    await expect(header.getByRole("link", { name: "Find vendors" })).toHaveAttribute(
      "href",
      /^https:\/\/[^/]+\/client\/marketplace\/$/,
    );
    // A category chip opens the marketplace already filtered.
    await expect(page.getByRole("link", { name: "Catering", exact: true })).toHaveAttribute(
      "href",
      /\/client\/marketplace\/\?category=catering$/,
    );

    await header.getByRole("link", { name: "For vendors" }).click();
    await expect(page).toHaveURL(/\/for-vendors\/?$/);
  });

  test("For vendors signs a new vendor up in this app", async ({ page }) => {
    await page.goto("for-vendors/");

    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "Join as a vendor" })).toHaveAttribute(
      "href",
      /\/login\/?\?mode=register&role=vendor$/,
    );
    // Vendor-side sign-in: an account with no vendor profile yet finishes setup.
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", /\/login\/?\?role=vendor$/);
    await expect(page.getByRole("link", { name: "Create your vendor storefront" })).toHaveAttribute(
      "href",
      /\/login\/?\?mode=register&role=vendor$/,
    );

    await header.getByRole("link", { name: "For clients" }).click();
    await expect(page).toHaveURL(/\/for-clients\/?$/);
  });

  test("the shared site header stays on the app's other pages", async ({ page }) => {
    await page.goto("for-vendors/");
    await expect(page.getByRole("navigation", { name: "About Jorna" })).toHaveCount(0);

    await page.goto("how-it-works/");
    await expect(page.getByRole("navigation", { name: "About Jorna" })).toBeVisible();
  });
});
