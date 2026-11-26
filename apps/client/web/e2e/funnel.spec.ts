import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";

// The client funnel's walkthrough fixes (web #164, #132), and where links to
// the retired request form land.
const SERVICE = {
  service_id: "svc-1",
  vendor_id: "vendor-1",
  vendor_name: "Arjun Kapoor",
  name: "Sangeet Night Coverage",
  price: 2500,
  price_unit: "event",
  status: "active",
  media: [],
};

// /book made a booking with no inquiry behind it (backend DECISIONS #54).
// Old links to it now land where an inquiry starts.
test.describe("old request form (/book)", () => {
  test("a link to a package lands on that package's page", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/services/svc-1", SERVICE);
    await page.goto("book/?service=svc-1");
    await expect(page).toHaveURL(/\/service\/?\?id=svc-1$/);
  });

  test("a link without a package lands on Explore", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/search", { items: [], total: 0, limit: 24, offset: 0 });
    await page.goto("book/");
    await expect(page).toHaveURL(/\/marketplace\/?$/);
  });
});

test.describe("plan and marketplace", () => {
  test("/browse takes a signed-in client to the Marketplace", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/search", { items: [], total: 0, limit: 24, offset: 0 });
    await page.goto("browse/");
    await expect(page).toHaveURL(/\/marketplace\/?$/);
  });
});
