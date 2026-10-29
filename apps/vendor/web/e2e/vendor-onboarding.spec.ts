import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockBundleDetail, mockTaxonomyCategories, mockVendorDetail } from "./support/mock-data";
import type { HandlerArgs } from "./support/api-mock";

// The design's four steps (Figma Make "Jorna-Vendor", 2026-10): what you offer,
// where you work, how clients pay you, your first package — then "You're set
// up". This suite runs with escrow on, where step 3 has nothing required.
test.describe("vendor onboarding", () => {
  test("blocks switching to vendor while a client booking is still open", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    // Not dead and not yet released — lib/planning's hasActiveBookings() reads
    // this as "still a client".
    api.get("/bundles", [mockBundleDetail()]);

    await page.goto("vendor-onboarding/");

    await expect(page.getByRole("heading", { name: "Finish up as a client first" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to your celebrations" })).toBeVisible();
  });

  test("step 1 creates the vendor from the picked services and moves to where you work", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/bundles", []);
    api.post("/vendors", mockVendorDetail());

    await page.goto("vendor-onboarding/");
    await expect(page.getByRole("heading", { name: "What do you offer?" })).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();

    // Nothing picked, nothing to continue with.
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await page.getByRole("button", { name: "Photographer" }).click();
    await expect(page.getByRole("button", { name: "Photographer" })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("About you").fill("Full-service wedding photography team.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Where you work" })).toBeVisible();
    const [call] = api.requestsTo("POST", "/vendors");
    expect(call.body).toMatchObject({ category: "photography", bio: "Full-service wedding photography team." });
  });

  test("the service directory adds a specific service", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/bundles", []);

    await page.goto("vendor-onboarding/");
    await page.getByRole("button", { name: "Browse all services" }).click();
    const sheet = page.getByRole("dialog", { name: "All services" });
    await sheet.getByPlaceholder("Search all services").fill("wedding");
    await sheet.getByRole("button", { name: "Wedding Photography" }).click();
    await sheet.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("list", { name: "Picked services" })).toContainText("Wedding Photography");
  });

  test("steps 2 and 3 save where the vendor works, then the package step waits for a package (#162)", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.get("/bundles", []);
    const vendor = mockVendorDetail({ venmo_handle: null, zelle_contact: null, payment_method: null });
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
    api.patch("/vendors/me", vendor);
    api.patch("/auth/profile", { message: "Profile updated", profile_complete: false });
    api.get("/services", { items: [], total: 0, limit: 100, offset: 0 });

    await page.goto("vendor-onboarding/");
    // Its own top bar: the wordmark and a way out, nothing to wander off to.
    await expect(page.getByRole("button", { name: "Save and finish later" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse vendors" })).toHaveCount(0);

    await page.getByRole("button", { name: "Photographer" }).click();
    await page.getByLabel("About you").fill("Full-service wedding photography team.");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Where you work" })).toBeVisible();
    // A city is required: it's what places the vendor against an event.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Add the city you're based in.")).toBeVisible();
    await page.getByPlaceholder("Start typing a city…").fill("Edison, NJ");
    await page.getByLabel("How far you travel").fill("80");
    await page.getByLabel("Instagram").fill("@studio_raj");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "How clients pay you" })).toBeVisible();
    expect(api.requestsTo("PATCH", "/auth/profile")[0].body).toMatchObject({ location: "Edison, NJ" });
    expect(api.requestsTo("PATCH", "/vendors/me")[0].body).toMatchObject({
      travel_radius_miles: 80,
      instagram_username: "studio_raj",
    });

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "List your first package" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finish setup" })).toBeDisabled();

    // A vendor page sends a vendor with no packages back here.
    await page.goto("overview/");
    await expect(page).toHaveURL(/vendor-onboarding/);
  });
});

test("coming back after step 3 carries on at the package, and says so", async ({ page, api }) => {
  await loginAs(page, api);
  api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
  api.get("/vendors/me", mockVendorDetail({ payment_method: "stripe", venmo_handle: "@studio" }));
  api.get("/services", { items: [], total: 0, limit: 100, offset: 0 });

  await page.goto("vendor-onboarding/");

  await expect(page.getByRole("heading", { name: "List your first package" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Welcome back.");
});
