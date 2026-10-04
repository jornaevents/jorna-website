import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockTaxonomyCategories, mockVendorDetail } from "./support/mock-data";
import type { Page } from "@playwright/test";
import type { ApiMock, HandlerArgs } from "./support/api-mock";

// Vendor Profile (plan 2.5): only what clients see, each section saving
// itself, a checklist of what's missing, a live client preview and a "Most
// popular" package.
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
  test("the checklist says what's missing and links to where it's fixed", async ({ page, api }) => {
    await openProfile(page, api);
    const list = page.getByRole("region", { name: "Listing checklist" });

    await expect(list.getByRole("link", { name: "Write a few lines about your business" })).toHaveAttribute("href", "#about");
    await expect(list.getByRole("link", { name: "List a priced package with a photo" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Set the hours you're available" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Link your Instagram" })).toBeVisible();
  });

  test("the checklist goes away once the listing is complete", async ({ page, api }) => {
    await openProfile(page, api, {
      vendor: { pfp_url: "https://example.test/me.jpg", bio: "We have played sangeets and receptions across New Jersey for ten years.", instagram_username: "studio" },
      services: [pkg({ media: [{ url: "https://example.test/p.jpg", type: "image" }] })],
      hours: [{ day_of_week: 5, start_time: "10:00", end_time: "23:00" }],
    });
    await expect(page.getByRole("region", { name: "About your business" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Listing checklist" })).toHaveCount(0);
  });

  test("About saves on its own and says when it has unsaved changes", async ({ page, api }) => {
    const { vendor } = await openProfile(page, api, { vendor: { bio: "Sangeet and reception DJ." } });
    api.patch("/vendors/me", ({ route }: HandlerArgs) => ({ ...vendor, ...route.request().postDataJSON() }));
    const about = page.getByRole("region", { name: "About your business" });

    await expect(about.getByText("Saved", { exact: true })).toBeVisible();
    await expect(about.getByRole("button", { name: "Save about" })).toBeDisabled();

    await about.getByLabel("Instagram").fill("studio");
    await expect(about.getByText("Unsaved changes")).toBeVisible();
    await about.getByRole("button", { name: "Save about" }).click();

    await expect(about.getByText("Saved", { exact: true })).toBeVisible();
    const [call] = api.requestsTo("PATCH", "/vendors/me");
    expect(call.body).toMatchObject({ instagram_username: "studio" });
    // Contract defaults aren't this page's any more, so it can't overwrite them.
    expect(call.body).not.toHaveProperty("default_deposit_percent");
    expect(call.body).not.toHaveProperty("default_guest_count_mode");
  });

  test("the client preview follows the About fields as they're typed", async ({ page, api }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openProfile(page, api, { services: [pkg({ is_popular: true })] });
    await page.getByRole("button", { name: "See it as a client" }).click();
    const preview = page.getByRole("complementary", { name: "Client preview" });

    await expect(preview.getByText("Most popular")).toBeVisible();
    await page.getByLabel("About you", { exact: true }).fill("Live music for every kind of celebration.");
    await expect(preview.getByText("Live music for every kind of celebration.")).toBeVisible();
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
