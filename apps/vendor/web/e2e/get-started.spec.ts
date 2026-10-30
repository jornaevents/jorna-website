import { test, expect } from "./support/fixtures";

// "Get started" → "How will you use Jorna?" (Figma Make entry flow, 2026-10).
test.describe("get started", () => {
  test("every landing header offers it; the side pages skip the picker", async ({ page }) => {
    await page.goto("");
    await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", /\/get-started\/?$/);

    // For clients / For vendors already know the side: straight to its sign-up.
    await page.goto("for-clients/");
    await expect(page.locator("header").first().getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      /^https:\/\/[^/]+\/client\/login\/\?mode=register$/,
    );

    await page.goto("for-vendors/");
    await expect(page.locator("header").first().getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      /\/login\/?\?mode=register&role=vendor$/,
    );
  });

  test("a vendor continues to vendor sign-up", async ({ page }) => {
    await page.goto("get-started/");

    await expect(page.getByRole("heading", { name: "How will you use Jorna?" })).toBeVisible();
    // Nothing chosen yet, nowhere to continue to.
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

    await page.getByRole("radio", { name: /I'm a vendor/ }).click();
    await expect(page.getByRole("radio", { name: /I'm a vendor/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/login\/?\?mode=register&role=vendor$/);
    await expect(page.getByRole("heading", { name: "Create your vendor account" })).toBeVisible();
  });

  test("a client continues to the client app's sign-up", async ({ page }) => {
    await page.route("https://jornaevents.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "client app" }),
    );
    await page.route("https://book.jornaevents.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "client app" }),
    );
    await page.goto("get-started/?as=client");

    await expect(page.getByRole("radio", { name: /planning an event/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/login\/?\?mode=register$/);
  });
});
