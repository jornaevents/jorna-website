import { test, expect } from "./support/fixtures";
import { mockVendorSearchResponse } from "./support/mock-data";

test.describe("home (marketing) page", () => {
  test("renders for a signed-out visitor and shows the live vendor showcase", async ({
    page,
    api,
  }) => {
    api.get("/vendors/search", mockVendorSearchResponse());

    await page.goto("");

    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Get started", exact: true })).toBeVisible();

    // Vendor showcase is real data from /vendors/search, not placeholder copy
    // (see the header comment in app/home/page.tsx) — assert the mocked row
    // actually rendered.
    await expect(page.getByText("Anjali Kapoor")).toBeVisible();
    await expect(page.getByText("Full Day Wedding Photography")).toBeVisible();
  });

  test("still renders the marketing content if the vendor showcase fails to load", async ({
    page,
    api,
  }) => {
    api.error("GET", "/vendors/search", 500, "Internal server error");

    await page.goto("");

    await expect(page.getByRole("link", { name: "Get started", exact: true })).toBeVisible();
  });
});
