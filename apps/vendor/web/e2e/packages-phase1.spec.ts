import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockTaxonomyCategories, mockVendorDetail } from "./support/mock-data";
import type { Page } from "@playwright/test";
import type { ApiMock, HandlerArgs } from "./support/api-mock";

// Package details (backend 0063): a vendor has to choose how a package is
// priced, can list what's included and priced add-ons, can make a package
// private, and a booked package they delete is archived rather than gone.
// The contract form picks up a package's own terms; the public page shows
// clients what's included.
test.describe("packages — Phase 1", () => {
  function pkg(overrides: Record<string, unknown> = {}) {
    return {
      service_id: "svc-1",
      vendor_id: "vendor-1",
      name: "Reception set",
      price: 1400,
      price_unit: "event",
      status: "active",
      inclusions: [],
      add_ons: [],
      media: [],
      ...overrides,
    };
  }

  async function openProfile(page: Page, api: ApiMock, services: () => unknown[]) {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail({ default_deposit_percent: 25 }));
    api.get("/vendors/categories", { categories: mockTaxonomyCategories() });
    api.get("/reviews/vendor/vendor-1", { items: [], total: 0 });
    api.get("/services", () => {
      const items = services();
      return { items, total: items.length, limit: 100, offset: 0 };
    });
    await page.goto("vendor-profile/");
    await expect(page.getByRole("heading", { name: "Packages" })).toBeVisible();
  }

  test("a new package must say how it's priced, and sends details and add-ons", async ({
    page,
    api,
  }) => {
    let services: unknown[] = [];
    await openProfile(page, api, () => services);
    api.post("/services", ({ route }: HandlerArgs) => {
      const body = route.request().postDataJSON();
      services = [pkg({ ...body, service_id: "svc-new" })];
      return services[0];
    });

    // The page header's "Add package" opens the form.
    await page.getByRole("button", { name: "Add package" }).first().click();
    await page.getByLabel("Package name").fill("Sangeet DJ set");

    // No pricing chosen yet → no price field, and saving says why.
    await expect(page.getByLabel("Price", { exact: true })).toHaveCount(0);
    const save = page.locator("form").getByRole("button", { name: "Add package" });
    await save.click();
    await expect(page.getByText("Choose how this package is priced.")).toBeVisible();

    await page.getByRole("button", { name: "Flat price" }).click();
    await page.getByLabel("Price", { exact: true }).fill("1200");
    await page.getByLabel("Hours included (optional)").fill("4");
    await page.getByLabel("What's included (optional)").fill("Sound system\n\nTwo wireless mics");
    await page.getByRole("button", { name: "+ Add an add-on" }).click();
    await page.getByLabel("Add-on 1 name").fill("Extra hour");
    await page.getByLabel("Add-on 1 price").fill("250");
    await page.getByLabel("Add-on 1 unit").selectOption("hour");

    // Custom terms show the vendor's default as the placeholder.
    await page.getByRole("button", { name: /Custom contract terms/ }).click();
    await expect(page.getByLabel("Deposit (%)").first()).toHaveAttribute("placeholder", "25");
    await page.getByLabel("Cancellation window (days)").first().fill("30");

    await page.getByRole("button", { name: "Private" }).click();
    await save.click();

    await expect(page.getByText("Sangeet DJ set")).toBeVisible();
    const [call] = api.requestsTo("POST", "/services");
    expect(call.body).toMatchObject({
      name: "Sangeet DJ set",
      price: 1200,
      price_unit: "event",
      included_hours: 4,
      inclusions: ["Sound system", "Two wireless mics"],
      add_ons: [{ name: "Extra hour", price: 250, price_unit: "hour" }],
      deposit_percent: null,
      cancellation_window_hours: 720,
      status: "hidden",
    });
    expect(call.body).not.toHaveProperty("experience");
  });

  test("the profile shows who couples see, and a package opens to its details and editor", async ({
    page,
    api,
  }) => {
    await openProfile(page, api, () => [
      pkg({ included_hours: 5, inclusions: ["Sound system", "MC for the night"], negotiable: true }),
    ]);

    await expect(page.getByRole("link", { name: "Open public profile" })).toHaveAttribute("href", /vendor\/?\?id=/);
    const row = page.getByRole("button", { name: /Reception set/ });
    await expect(row).toContainText("5 hours");
    await row.click();
    await expect(page.getByText("MC for the night")).toBeVisible();
    await expect(page.getByText("Open to offers", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit package" }).click();
    await expect(page.getByLabel("Package name")).toHaveValue("Reception set");
  });

  test("making a package private, and deleting a booked one archives it", async ({
    page,
    api,
  }) => {
    let status = "active";
    await openProfile(page, api, () => [pkg({ status })]);
    api.patch("/services/svc-1", ({ route }: HandlerArgs) => {
      status = route.request().postDataJSON().status ?? status;
      return pkg({ status });
    });
    api.delete("/services/svc-1", () => {
      status = "archived"; // the backend archives a package with bookings
      return {};
    });

    // A package's actions are inside its row, as in the design.
    await page.getByRole("button", { name: /Reception set/ }).click();
    await expect(page.getByText("What's included", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Make private" }).click();
    await expect(page.getByText("Private", { exact: true }).first()).toBeVisible();
    expect(api.requestsTo("PATCH", "/services/svc-1")[0].body).toEqual({ status: "hidden" });

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();
    await expect(page.getByText("archived instead of deleted")).toBeVisible();
    await page.getByText("Archived (1)").click();
    await expect(page.getByRole("button", { name: "Restore as private" })).toBeVisible();
  });

  test("picking a package on a contract uses that package's own terms", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail({ default_deposit_percent: 25 }));
    api.get("/services", {
      items: [
        pkg({ deposit_percent: 40, cancellation_window_hours: 1440 }),
        pkg({ service_id: "svc-old", name: "Retired set", status: "archived" }),
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });

    await page.goto("contracts/new/");
    const picker = page.getByLabel("Add a package");
    await expect(picker.locator("option", { hasText: "Retired set" })).toHaveCount(0);
    await picker.selectOption("svc-1");

    // The payment plan starts from the package's 40%, not the vendor's 25%.
    await expect(page.getByLabel("Amount ($)").first()).toHaveValue("560");
    await expect(page.getByLabel("Cancellation window (days)")).toHaveValue("60");
  });

  test("the public package page shows what's included and the add-ons", async ({ page, api }) => {
    api.get(
      "/services/svc-1",
      pkg({
        vendor_name: "Arjun Kapoor",
        included_hours: 4,
        inclusions: ["Sound system"],
        add_ons: [{ id: "a1", name: "Extra hour", price: 250, price_unit: "hour" }],
      }),
    );
    api.get("/vendors/vendor-1", mockVendorDetail());
    api.get("/reviews/service/svc-1", { items: [], total: 0, limit: 50, offset: 0 });

    await page.goto("service/?id=svc-1");
    await expect(page.getByText("4 hours of coverage")).toBeVisible();
    await expect(page.getByText("✓ Sound system")).toBeVisible();
    await expect(page.getByText("Extra hour")).toBeVisible();
    await expect(page.getByText("$250 per hour")).toBeVisible();
  });
});
