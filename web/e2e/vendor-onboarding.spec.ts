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

    await page.getByLabel("Add a category").selectOption({ label: "Photography" });
    await page.getByRole("button", { name: "Photography", exact: true }).click();
    await page.getByLabel("About you").fill("Full-service wedding photography team.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Where do you work?" })).toBeVisible();
    const createCalls = api.requestsTo("POST", "/vendors");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].body).toMatchObject({ category: "photography" });
  });

  test("switches the top nav to vendor tabs right after finishing onboarding, no reload", async ({
    page,
    api,
  }) => {
    // nav.tsx's isVendor check used to only re-run when the signed-in user
    // changed, never on navigation — so a client who became a vendor mid-
    // session kept seeing the client tabs until they signed out and back in,
    // even though create_vendor had already succeeded. This drives the real
    // flow (not just the API) to prove the fix: the nav has to update after
    // a plain route change, with no reload and no re-login.
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.get("/bundles", []);
    const vendor = mockVendorDetail();
    let hasVendor = false;
    api.get("/vendors/me", ({ route }: HandlerArgs) =>
      hasVendor
        ? vendor
        : route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Not a vendor" }),
          }),
    );
    api.post("/vendors", () => {
      hasVendor = true;
      return vendor;
    });
    api.patch("/vendors/me", vendor);

    await page.goto("vendor-onboarding/");
    await expect(page.getByRole("heading", { name: "What do you sell?" })).toBeVisible();
    // Still a client at this point — the top nav shows the client tabs.
    await expect(page.getByRole("link", { name: "Builder" })).toBeVisible();

    await page.getByLabel("Add a category").selectOption({ label: "Photography" });
    await page.getByRole("button", { name: "Photography", exact: true }).click();
    await page.getByLabel("About you").fill("Full-service wedding photography team.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Where do you work?" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "List your packages" })).toBeVisible();
    await page.getByRole("link", { name: "I'll add packages later" }).click();

    // A route change with no reload — the moment the fixed effect re-checks.
    await expect(page.getByRole("link", { name: "Earnings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Builder" })).not.toBeVisible();
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
