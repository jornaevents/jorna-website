import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockBundleDetail, mockTaxonomyCategories, mockVendorDetail } from "./support/mock-data";

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

    await page.getByLabel("Add a category").selectOption({ label: "Photography" });
    await page.getByRole("button", { name: "Photography", exact: true }).click();
    await page.getByLabel("About you").fill("Full-service wedding photography team.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Where do you work?" })).toBeVisible();
    const createCalls = api.requestsTo("POST", "/vendors");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].body).toMatchObject({ category: "photography" });
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
