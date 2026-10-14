import { test, expect } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// The package page shows what the price covers and what can be added (#163),
// the same as the vendor site's copy of it.
test("a package page shows its hours, what's included and its add-ons", async ({ page, api }) => {
  api.get("/services/svc-1", {
    service_id: "svc-1",
    vendor_id: "vendor-1",
    vendor_name: "Arjun Kapoor",
    name: "Sangeet Night Coverage",
    price: 2500,
    price_unit: "event",
    status: "active",
    media: [],
    included_hours: 5,
    inclusions: ["Edited gallery"],
    add_ons: [{ id: "a1", name: "Second shooter", price: 400, price_unit: "event" }],
    negotiable: true,
  });
  api.get("/vendors/vendor-1", mockVendorDetail());
  api.get("/reviews/service/svc-1", { items: [], total: 0, limit: 50, offset: 0 });

  await page.goto("service/?id=svc-1");
  await expect(page.getByText("5 hours of coverage")).toBeVisible();
  await expect(page.getByText("✓ Edited gallery")).toBeVisible();
  await expect(page.getByText("Second shooter")).toBeVisible();
  // Drawn once for phones and once for the desktop column.
  await expect(page.getByText("A flat rate covering 5 hours.")).not.toHaveCount(0);
  await expect(page.getByText(/however long it runs/)).toHaveCount(0);
  await expect(page.getByText(/open to offers/i)).toHaveCount(0);
});
