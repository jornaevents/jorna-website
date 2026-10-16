import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockBundleBooking, mockBundleDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// The client funnel's walkthrough fixes (web #164, #132): the request form,
// the plan, and the marketplace.
const SERVICE = {
  service_id: "svc-1",
  vendor_id: "vendor-1",
  vendor_name: "Arjun Kapoor",
  name: "Sangeet Night Coverage",
  price: 2500,
  price_unit: "event",
  status: "active",
  media: [],
  add_ons: [{ id: "a1", name: "Second shooter", price: 400, price_unit: "event" }],
};

function mockForm(api: ApiMock, bundles: unknown[] = []) {
  api.get("/services/svc-1", SERVICE);
  api.get("/bundles", bundles);
  api.get("/vendors/vendor-1/availability", { busy: [] });
}

test.describe("request form (/book)", () => {
  test("a past date is said under the date, and everything typed stays", async ({ page, api }) => {
    await loginAs(page, api);
    mockForm(api);

    await page.goto("book/?service=svc-1");
    await expect(page.getByText("Add to your plan")).toBeVisible();
    await page.getByLabel("Event name").fill("Asha's Sangeet");
    await page.getByLabel("Date").fill("2024-01-15");
    await expect(page.getByRole("alert").filter({ hasText: "That date has already passed — check the year." })).toBeVisible();
    // Neither add goes anywhere, and the form is still the form.
    await expect(page.getByRole("button", { name: "Add to plan" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add and keep browsing" })).toBeDisabled();
    await expect(page.getByLabel("Event name")).toHaveValue("Asha's Sangeet");
    expect(api.requestsTo("POST", "/bookings")).toHaveLength(0);
  });

  test("a refused add is said beside the button, not instead of the form", async ({ page, api }) => {
    await loginAs(page, api);
    mockForm(api);
    api.error("POST", "/bookings", 400, "That date is fully booked");

    await page.goto("book/?service=svc-1");
    await page.getByLabel("Event name").fill("Asha's Sangeet");
    await page.getByRole("button", { name: "Add to plan" }).click();
    await expect(page.getByText("That date is fully booked")).toBeVisible();
    await expect(page.getByLabel("Event name")).toHaveValue("Asha's Sangeet");
  });

  test("times start unset, and an unconfirmed overnight window holds both adds", async ({ page, api }) => {
    await loginAs(page, api);
    mockForm(api);

    await page.goto("book/?service=svc-1");
    const startHour = page.getByLabel("Start time — hour");
    await expect(startHour).toHaveValue("");
    await expect(page.getByRole("button", { name: "AM", pressed: true })).toHaveCount(0);

    await startHour.selectOption("10");
    await page.getByLabel("End time — hour").selectOption("2");
    await page.getByRole("button", { name: "AM" }).last().click();
    await expect(page.getByText(/spans into the next day/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to plan" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add and keep browsing" })).toBeDisabled();
  });

  test("add-ons are listed for the client to mention, and plans say how far along they are", async ({ page, api }) => {
    await loginAs(page, api);
    mockForm(api, [
      mockBundleDetail({ bundle_id: "b-draft", event_name: "Mehndi", status: "draft", bookings: [] }),
      mockBundleDetail({ bundle_id: "b-sent", event_name: "Reception", status: "confirmed", bookings: [mockBundleBooking({ signed_at: null })] }),
      mockBundleDetail({ bundle_id: "b-booked", event_name: "Wedding", status: "confirmed",
        bookings: [mockBundleBooking({ signed_at: "2030-05-02T12:00:00Z" })] }),
    ]);

    await page.goto("book/?service=svc-1");
    await expect(page.getByText("Second shooter")).toBeVisible();
    await expect(page.getByText(/Arjun Kapoor adds them to your contract/)).toBeVisible();
    const addTo = page.getByLabel("Add to");
    await expect(addTo.locator("option")).toHaveText(["A new plan", "Mehndi", "Reception (sent to vendors)", "Wedding (booked)"]);
  });

  test("the nav puts the form under Market, where the package is", async ({ page, api }) => {
    await loginAs(page, api);
    mockForm(api);
    await page.goto("book/?service=svc-1");
    await expect(page.getByRole("link", { name: "Market" }).first()).toHaveAttribute("aria-current", "page");
  });
});

test.describe("plan and marketplace", () => {
  test("/browse takes a signed-in client to the Marketplace", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/search", { items: [], total: 0, limit: 24, offset: 0 });
    await page.goto("browse/");
    await expect(page).toHaveURL(/\/marketplace\/?$/);
  });

  test("the marketplace's chips are the vendor categories, with their types beneath", async ({ page, api }) => {
    api.get("/vendors/categories", {
      categories: [
        { value: "photography", label: "Photography", subcategories: [] },
        { value: "beauty", label: "Beauty", subcategories: [
          { value: "bridal_makeup", label: "Bridal Makeup" },
          { value: "mehndi_artist", label: "Mehndi Artist" },
        ] },
      ],
    });
    api.get("/vendors/search", { items: [], total: 0, limit: 24, offset: 0 });

    await page.goto("marketplace/");
    await expect(page.getByRole("button", { name: "Photography" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Photographer" })).toHaveCount(0);
    await page.getByRole("button", { name: "Beauty" }).click();
    const types = page.getByRole("group", { name: "Beauty types" });
    const searched = page.waitForRequest((r) => /\/vendors\/search\?.*subcategory=mehndi_artist/.test(r.url()));
    await types.getByRole("button", { name: "Mehndi Artist" }).click();
    expect((await searched).url()).toMatch(/category=beauty/);
  });
});
