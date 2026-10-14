import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockBundleDetail, mockTaxonomyCategories, mockVendorDetail } from "./support/mock-data";
import type { HandlerArgs } from "./support/api-mock";

test.describe("vendor onboarding", () => {
  test("blocks switching to vendor while a client booking is still open", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    // Not dead (status "approved") and not yet released — hasActiveBookings()
    // in lib/planning.ts should read this as "still a client".
    api.get("/bundles", [mockBundleDetail()]);

    await page.goto("vendor-onboarding/");

    await expect(page.getByRole("heading", { name: "Finish up as a client first" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to your celebrations" })).toBeVisible();
  });

  test("creates a vendor profile and advances to the reach step", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/bundles", []);
    api.post("/vendors", mockVendorDetail());

    await page.goto("vendor-onboarding/");
    await expect(page.getByRole("heading", { name: "What do you sell?" })).toBeVisible();

    // Choosing the category picks it; the chip below shows it selected.
    await page.getByLabel("Add a category").selectOption({ label: "Photography" });
    await expect(page.getByRole("button", { name: "All photography", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByLabel("About you").fill("Full-service wedding photography team.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "How far you go, and how you're paid" })).toBeVisible();
    const createCalls = api.requestsTo("POST", "/vendors");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].body).toMatchObject({ category: "photography" });
  });

  test("the wizard has no site navigation, and vendor pages wait for a first package (#162)", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.get("/bundles", []);
    const vendor = mockVendorDetail({ venmo_handle: null, zelle_contact: null });
    let hasVendor = false;
    api.get("/vendors/me", ({ route }: HandlerArgs) =>
      hasVendor
        ? vendor
        : route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not a vendor" }) }),
    );
    api.post("/vendors", () => {
      hasVendor = true;
      return vendor;
    });
    api.patch("/vendors/me", { ...vendor, venmo_handle: "@studio" });
    api.get("/services", { items: [], total: 0, limit: 100, offset: 0 });

    await page.goto("vendor-onboarding/");
    await expect(page.getByRole("heading", { name: "What do you sell?" })).toBeVisible();
    // Only the wordmark and a way out: nothing to wander off to mid-setup.
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get started" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Browse vendors" })).toHaveCount(0);

    await page.getByLabel("Add a category").selectOption({ label: "Photography" });
    await page.getByLabel("About you").fill("Full-service wedding photography team.");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "How far you go, and how you're paid" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "List your packages" })).toBeVisible();
    await expect(page.getByRole("link", { name: "I'll add packages later" })).toHaveCount(0);

    // A vendor page sends a vendor with no packages back to the wizard.
    await page.goto("overview/");
    await expect(page).toHaveURL(/vendor-onboarding/);
  });

  test("requires at least one category before continuing", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/bundles", []);

    await page.goto("vendor-onboarding/");
    await page.getByLabel("About you").fill("Full-service wedding photography team.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Pick at least one category first.")).toBeVisible();
    expect(api.requestsTo("POST", "/vendors")).toHaveLength(0);
  });
});

test("a reload after step 2 carries on at the packages (#162)", async ({ page, api }) => {
  await loginAs(page, api);
  api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
  api.get("/vendors/me", mockVendorDetail({ payment_method: "stripe", venmo_handle: "@studio" }));
  api.get("/services", { items: [], total: 0, limit: 100, offset: 0 });
  await page.goto("vendor-onboarding/");
  await expect(page.getByRole("heading", { name: "List your packages" })).toBeVisible();
});
