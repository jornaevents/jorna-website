import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockTaxonomyCategories, mockUser, mockVendorDetail } from "./support/mock-data";
import type { Page } from "@playwright/test";
import type { ApiMock, HandlerArgs } from "./support/api-mock";

// Vendor Profile (plan 2.5): only what clients see, each section saving
// itself (the business details through the Edit profile popup), a checklist
// of what's missing, a live client preview and a "Most popular" package.
function pkg(overrides: Record<string, unknown> = {}) {
  return {
    service_id: "svc-1",
    vendor_id: "vendor-1",
    name: "Reception set",
    price: 1400,
    price_unit: "event",
    category: "photography",
    status: "active",
    inclusions: [],
    add_ons: [],
    media: [],
    ...overrides,
  };
}

async function openProfile(
  page: Page,
  api: ApiMock,
  { vendor = {}, services = [pkg()], hours = [] }: { vendor?: object; services?: unknown[]; hours?: unknown[] } = {},
) {
  await loginAs(page, api);
  const v = mockVendorDetail({ bio: "", instagram_username: null, ...vendor });
  api.get("/vendors/me", v);
  api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
  api.get("/reviews/vendor/vendor-1", { items: [], total: 0 });
  api.get("/vendors/me/availability", hours);
  let items = services;
  api.get("/services", () => ({ items, total: items.length, limit: 100, offset: 0 }));
  await page.goto("vendor-profile/");
  await expect(page.getByRole("heading", { name: "Packages" })).toBeVisible();
  return { vendor: v, setServices: (next: unknown[]) => (items = next) };
}

test.describe("vendor profile (/vendor-profile)", () => {
  test("the checklist says what's missing and opens where it's fixed", async ({ page, api }) => {
    await openProfile(page, api);
    const list = page.getByRole("region", { name: "Listing checklist" });

    await expect(list.getByRole("button", { name: "Link your Instagram" })).toBeVisible();
    await expect(list.getByRole("link", { name: "List a priced package with a photo" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Set the hours you're available" })).toBeVisible();
    await list.getByRole("button", { name: "Write a few lines about your business" }).click();
    await expect(page.getByRole("dialog", { name: "Edit profile" })).toBeVisible();
  });

  test("the checklist goes away once the listing is complete", async ({ page, api }) => {
    await openProfile(page, api, {
      vendor: { pfp_url: "https://example.test/me.jpg", bio: "We have played sangeets and receptions across New Jersey for ten years.", instagram_username: "studio" },
      services: [pkg({ media: [{ url: "https://example.test/p.jpg", type: "image" }] })],
      hours: [{ day_of_week: 5, start_time: "10:00", end_time: "23:00" }],
    });
    await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Listing checklist" })).toHaveCount(0);
  });

  test("Edit profile saves out of state and years in business, not a travel radius", async ({ page, api }) => {
    const { vendor } = await openProfile(page, api, { vendor: { bio: "Sangeet and reception DJ.", location: "Edison, NJ" } });
    api.patch("/vendors/me", ({ route }: HandlerArgs) => ({ ...vendor, ...route.request().postDataJSON() }));

    await page.getByRole("button", { name: "Edit profile" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit profile" });
    await expect(dialog.getByLabel(/Travel radius/)).toHaveCount(0);

    await dialog.getByLabel("Open to events out of state").check();
    await dialog.getByLabel("Years in business").fill("12");
    await dialog.getByLabel("Instagram (optional)").fill("studio");
    await dialog.getByRole("button", { name: "Save profile" }).click();

    await expect(dialog).toHaveCount(0);
    const [call] = api.requestsTo("PATCH", "/vendors/me");
    expect(call.body).toMatchObject({ open_to_long_distance: true, years_experience: 12, instagram_username: "studio" });
    expect(call.body).not.toHaveProperty("travel_radius_miles");
    // Contract defaults aren't this page's, so it can't overwrite them.
    expect(call.body).not.toHaveProperty("default_deposit_percent");
    // The city didn't change, so the account isn't touched.
    expect(api.requestsTo("PATCH", "/me")).toHaveLength(0);

    const details = page.getByLabel("Profile details");
    await expect(details).toContainText("Edison, NJ");
    await expect(details).toContainText("Open to out-of-state events");
    await expect(details).toContainText("12 years in business");
  });

  test("years in business takes whole numbers only", async ({ page, api }) => {
    await openProfile(page, api);
    await page.getByRole("button", { name: "Edit profile" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit profile" });
    const years = dialog.getByLabel("Years in business");
    const save = dialog.getByRole("button", { name: "Save profile" });

    for (const bad of ["abc", "4.5", "120"]) {
      await years.fill(bad);
      await expect(dialog.getByText("Enter a whole number of years (0–99).")).toBeVisible();
      await expect(save).toBeDisabled();
    }
    await years.fill("1");
    await expect(dialog.getByText("Enter a whole number of years (0–99).")).toHaveCount(0);
    await expect(dialog.getByRole("complementary", { name: "Profile preview" })).toContainText("1 year in business");
    await expect(save).toBeEnabled();
  });

  test("a new city saves to the account, and Cancel keeps nothing", async ({ page, api }) => {
    const { vendor } = await openProfile(page, api, { vendor: { location: "Edison, NJ" } });
    api.patch("/me", ({ route }: HandlerArgs) => mockUser(route.request().postDataJSON()));
    api.patch("/vendors/me", ({ route }: HandlerArgs) => ({ ...vendor, ...route.request().postDataJSON(), location: "Austin, TX" }));

    await page.getByRole("button", { name: "Edit profile" }).click();
    let dialog = page.getByRole("dialog", { name: "Edit profile" });
    await dialog.getByLabel("Years in business").fill("8");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Profile details")).not.toContainText("years in business");

    await page.getByRole("button", { name: "Edit profile" }).click();
    dialog = page.getByRole("dialog", { name: "Edit profile" });
    await expect(dialog.getByLabel("Years in business")).toHaveValue("");
    await dialog.getByLabel("Business location").fill("Austin, TX");
    await dialog.getByRole("button", { name: "Save profile" }).click();

    await expect(dialog).toHaveCount(0);
    const [me] = api.requestsTo("PATCH", "/me");
    expect(me.body).toEqual({ location: "Austin, TX" });
    await expect(page.getByLabel("Profile details")).toContainText("Austin, TX");
  });

  test("the popup's preview follows the fields as they're typed", async ({ page, api }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openProfile(page, api, { services: [pkg({ is_popular: true })] });
    await page.getByRole("button", { name: "See it as a client" }).click();
    await expect(page.getByRole("complementary", { name: "Client preview" }).getByText("Most popular")).toBeVisible();

    await page.getByRole("button", { name: "Edit profile" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit profile" });
    await dialog.getByLabel("Short introduction").fill("Live music for every kind of celebration.");
    await dialog.getByLabel("Open to events out of state").check();
    const preview = dialog.getByRole("complementary", { name: "Profile preview" });
    await expect(preview.getByText("Live music for every kind of celebration.")).toBeVisible();
    await expect(preview.getByText("Open to out-of-state events")).toBeVisible();
  });

  test("a package can be marked most popular", async ({ page, api }) => {
    const { setServices } = await openProfile(page, api);
    api.patch("/services/svc-1", ({ route }: HandlerArgs) => {
      const updated = pkg(route.request().postDataJSON());
      setServices([updated]);
      return updated;
    });

    const row = page.getByRole("button", { name: /Reception set/ }).first();
    await row.click();
    await page.getByRole("button", { name: "Edit package" }).click();
    await page.getByLabel("Mark as most popular").check();
    await page.locator("form").getByRole("button", { name: /Save/ }).first().click();

    const [call] = api.requestsTo("PATCH", "/services/svc-1");
    expect(call.body).toMatchObject({ is_popular: true });
    await expect(row).toContainText("Most popular");
  });
});
