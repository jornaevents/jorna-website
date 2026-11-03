import { test, expect } from "./support/fixtures";
import { mockServiceTaxonomy, mockVendorSearchItem, mockVendorSearchResponse } from "./support/mock-data";
import type { HandlerArgs } from "./support/api-mock";

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

  // Escrow is off (lib/flags ESCROW_ENABLED), so every vendor is paid
  // directly — a per-vendor payment tag said nothing and is gone.
  test("cards carry no payment-track tag, whichever track the vendor is on", async ({
    page,
    api,
  }) => {
    api.get(
      "/vendors/search",
      mockVendorSearchResponse([
        mockVendorSearchItem({ payment_method: "manual" }),
        mockVendorSearchItem({
          vendor_id: "vendor-2",
          first_name: "Rohan",
          last_name: "Mehta",
          service_id: "service-2",
          service_name: "Live Dhol",
          payment_method: "stripe",
        }),
      ]),
    );

    await page.goto("marketplace/");

    await expect(page.getByText("Live Dhol")).toBeVisible();
    await expect(page.getByText("Direct", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Protected", { exact: true })).toHaveCount(0);
  });

  test("chips are the taxonomy's groups, then the group's services, and search by service", async ({ page, api }) => {
    api.get("/taxonomy", mockServiceTaxonomy());
    const asked: (string | null)[] = [];
    api.get("/vendors/search", ({ url }: HandlerArgs) => {
      asked.push(url.searchParams.get("service"));
      return mockVendorSearchResponse();
    });

    await page.goto("marketplace/");
    await page.getByRole("button", { name: "Beauty", exact: true }).click();
    const services = page.getByRole("group", { name: "Beauty services" });
    await expect(services.getByRole("button", { name: "All beauty" })).toHaveAttribute("aria-pressed", "true");
    await services.getByRole("button", { name: "Mehndi artist" }).click();

    // Debounced: quick picks coalesce into one search, for the last one.
    await expect.poll(() => asked.at(-1)).toBe("mehndi_artist");
    // Still the group's chip: the service is one of its own.
    await expect(page.getByRole("button", { name: "Beauty", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("?service= presets the filter; an old ?category= link still filters", async ({ page, api }) => {
    api.get("/taxonomy", mockServiceTaxonomy());
    const asked: string[] = [];
    api.get("/vendors/search", ({ url }: HandlerArgs) => {
      asked.push(url.search);
      return mockVendorSearchResponse();
    });

    await page.goto("marketplace/?service=dhol");
    await expect(page.getByRole("group", { name: "Music services" }).getByRole("button", { name: "Dhol player" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect.poll(() => asked.at(-1)).toContain("service=dhol");

    await page.goto("marketplace/?category=music_entertainment&subcategory=dhol");
    await expect.poll(() => asked.at(-1)).toContain("subcategory=dhol");
    expect(asked.at(-1)).not.toContain("service=");
  });
});
