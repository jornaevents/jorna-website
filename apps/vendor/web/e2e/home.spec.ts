import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail, mockVendorSearchResponse } from "./support/mock-data";

// The site root is the Welcome screen (Figma, 2026-10): one question — client
// or vendor — and a way to each side's own page. See docs/DECISIONS.md.
test.describe("welcome (site root)", () => {
  test("a signed-out visitor chooses a path", async ({ page }) => {
    await page.goto("");

    await expect(
      page.getByRole("heading", { level: 1, name: "Every celebration starts with a connection." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue as a client" })).toHaveAttribute("href", /\/for-clients\/?$/);
    await expect(page.getByRole("link", { name: "Continue as a vendor" })).toHaveAttribute("href", /\/for-vendors\/?$/);
    // One sign-in per side: a client's is in the client app, a vendor's here.
    await expect(page.getByRole("link", { name: "Client", exact: true })).toHaveAttribute(
      "href",
      /^https:\/\/[^/]+\/client\/login$/,
    );
    await expect(page.getByRole("link", { name: "Vendor", exact: true })).toHaveAttribute("href", /\/login\/?$/);

    // The page draws its own header from the design; the app's shared one
    // (SiteHeader, "About Jorna" nav) steps aside — see ChromeGate.
    await expect(page.getByRole("navigation", { name: "About Jorna" })).toHaveCount(0);
  });

  test("each path leads to its own page", async ({ page }) => {
    await page.goto("");
    await page.getByRole("link", { name: "Continue as a client" }).click();
    await expect(page).toHaveURL(/\/for-clients\/?$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Vendors who get it.");

    await page.goto("");
    await page.getByRole("link", { name: "Continue as a vendor" }).click();
    await expect(page).toHaveURL(/\/for-vendors\/?$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your business,");
  });

  // Home is a pitch a vendor has already bought — see VendorHomeRedirect.
  test("a signed-in vendor landing on the site root goes to their dashboard", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get("/vendors/search", mockVendorSearchResponse());
    api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });
    api.get("/leads", { items: [], total: 0 });

    await page.goto("");

    await expect(page).toHaveURL(/\/overview\/?$/);
    await expect(page.getByText("Every celebration starts with a connection.")).not.toBeVisible();
  });

  test("a signed-in client still gets the welcome screen at the site root", async ({ page, api }) => {
    await loginAs(page, api);
    api.error("GET", "/vendors/me", 404, "Not a vendor");

    await page.goto("");

    await expect(page.getByText("Every celebration starts with a connection.")).toBeVisible();
    await expect(page).not.toHaveURL(/overview/);
  });
});
