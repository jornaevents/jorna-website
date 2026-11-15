import { test, expect, loginAs } from "./support/fixtures";
import { mockVendorSearchItem, mockVendorSearchResponse } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// Hearts and Compare (client redesign PR 7; packages since backend 0090): a
// client saves packages in Explore to their account and compares them side by
// side — the package, not the vendor, since one vendor's packages differ.

const saved = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  service_id: id, name, available: true, category: "catering", photo_url: null,
  price: 38, price_unit: "person", included_hours: 5, inclusions: ["Servers", "Linens"],
  add_ons: ["Chai bar"], deposit_percent: 25, cancellation_window_hours: 720, negotiable: true,
  rating: 4.8, num_reviews: 32, vendor_id: "v1", vendor_name: "Saffron Table",
  vendor_location: "Edison, NJ", years_experience: 9, saved_at: "2026-11-01T00:00:00", ...over,
});

function shell(api: ApiMock) {
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
}

test("a heart saves that package, not every card from the vendor", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  let list: unknown[] = [];
  api.get("/saved-packages", () => ({ items: list }));
  api.put("/saved-packages/s1", () => {
    list = [saved("s1", "Plated dinner")];
    return {};
  });
  // Two packages from one vendor.
  api.get(
    "/vendors/search",
    mockVendorSearchResponse([
      mockVendorSearchItem({ service_id: "s1", service_name: "Plated dinner" }),
      mockVendorSearchItem({ service_id: "s2", service_name: "Buffet" }),
    ]),
  );
  await page.goto("marketplace/");

  await expect(page.getByText("Select packages to compare")).toBeVisible();
  await page.getByRole("button", { name: "Save Plated dinner" }).click();
  await expect(page.getByRole("button", { name: "Remove Plated dinner" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Save Buffet" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("1 package selected")).toBeVisible();
  expect(api.requestsTo("PUT", "/saved-packages/s1")).toHaveLength(1);
  await expect(page.getByRole("link", { name: "Next · Compare" })).toHaveAttribute("href", /\/compare\/?$/);
});

test("Compare lays the saved packages side by side and removes one", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  let list = [
    saved("s1", "Plated dinner"),
    saved("s2", "Reception buffet", {
      price: 8000, price_unit: "event", included_hours: null, inclusions: [], add_ons: [],
      deposit_percent: null, cancellation_window_hours: null, negotiable: false, num_reviews: 0, rating: 0,
    }),
    saved("s3", "Old tasting menu", { available: false }),
  ];
  api.get("/saved-packages", () => ({ items: list }));
  api.delete("/saved-packages/s2", () => {
    list = list.filter((p) => p.service_id !== "s2");
    return {};
  });
  await page.goto("compare/");

  await expect(page.getByRole("heading", { name: "Compare your selected packages" })).toBeVisible();
  await expect(page.getByText("3 selected")).toBeVisible();
  // By the row's own header, exactly — "Price" would otherwise also match "Price negotiable".
  const row = (label: string) =>
    page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
  await expect(row("Price")).toContainText("$38 per person");
  await expect(row("Price")).toContainText("$8,000 flat");
  await expect(row("Hours included")).toContainText("5 hours");
  await expect(row("What's included")).toContainText("Servers");
  await expect(row("Add-ons")).toContainText("Chai bar");
  await expect(row("Add-ons")).toContainText("None");
  await expect(row("Deposit")).toContainText("25% to book");
  await expect(row("Cancellation")).toContainText("Up to 30 days before the event");
  await expect(row("Rating")).toContainText("★ 4.8 (32)");
  await expect(row("Rating")).toContainText("New");
  await expect(page.getByRole("link", { name: "Saffron Table" }).first()).toHaveAttribute("href", /vendor\/?\?id=v1$/);
  await expect(page.getByRole("link", { name: "View package" }).first()).toHaveAttribute("href", /service\/?\?id=s1$/);
  // A package the vendor has since hidden stays, says so, and can't be opened.
  await expect(page.getByText("No longer offered")).toBeVisible();
  await expect(page.getByRole("link", { name: "View package" })).toHaveCount(2);

  await page.getByRole("button", { name: "Remove Reception buffet" }).click();
  await expect(page.getByText("2 selected")).toBeVisible();
  expect(api.requestsTo("DELETE", "/saved-packages/s2")).toHaveLength(1);
});

test("with nothing saved, Compare points back to Explore; signed out, cards have no heart", async ({ page, api }) => {
  api.get("/vendors/search", mockVendorSearchResponse([mockVendorSearchItem()]));
  await page.goto("marketplace/");
  await expect(page.getByRole("heading", { name: "Anjali Kapoor" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save / })).toHaveCount(0);

  await loginAs(page, api);
  shell(api);
  api.get("/saved-packages", { items: [] });
  await page.goto("compare/");
  await expect(page.getByRole("heading", { name: "No packages selected" })).toBeVisible();
});
