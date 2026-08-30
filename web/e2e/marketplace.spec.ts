import { test, expect } from "./support/fixtures";
import { mockVendorSearchItem, mockVendorSearchResponse } from "./support/mock-data";

test.describe("marketplace search", () => {
  test("shows results returned by /vendors/search", async ({ page, api }) => {
    api.get("/vendors/search", mockVendorSearchResponse());

    await page.goto("marketplace/");

    await expect(page.getByText("Anjali Kapoor")).toBeVisible();
    await expect(page.getByText("Full Day Wedding Photography")).toBeVisible();
    await expect(page.getByText("$2,500")).toBeVisible();
  });

  test("shows the empty state when nothing matches", async ({ page, api }) => {
    api.get("/vendors/search", mockVendorSearchResponse([]));

    await page.goto("marketplace/");

    await expect(page.getByText(/No vendors match those filters yet/i)).toBeVisible();
  });

  test("filters the already-loaded results client-side as you type", async ({ page, api }) => {
    // The search box narrows what's already been fetched (see `candidates` in
    // marketplace/page.tsx) rather than triggering a new /vendors/search call —
    // only the category/price/rating filters do that.
    api.get("/vendors/search", mockVendorSearchResponse());

    await page.goto("marketplace/");
    await expect(page.getByText("Anjali Kapoor")).toBeVisible();

    await page.getByRole("searchbox", { name: "Search vendors" }).fill("mehndi");
    await expect(page.getByText("Anjali Kapoor")).not.toBeVisible();

    await page.getByRole("searchbox", { name: "Search vendors" }).fill("Anjali");
    await expect(page.getByText("Anjali Kapoor")).toBeVisible();

    expect(api.requestsTo("GET", "/vendors/search")).toHaveLength(1);
  });
});
