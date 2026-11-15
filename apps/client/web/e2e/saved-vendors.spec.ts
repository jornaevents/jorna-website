import { test, expect, loginAs } from "./support/fixtures";
import { mockVendorSearchItem, mockVendorSearchResponse } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// Hearts and Compare (client redesign PR 7): a client saves vendors in
// Explore to their account and compares them side by side.

const saved = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  vendor_id: id, name, category: "photography", rating: 4.8, num_reviews: 32, years_experience: 9,
  starting_price: 2400, location: "Edison, NJ", saved_at: "2026-11-01T00:00:00", ...over,
});

function shell(api: ApiMock) {
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
}

test("a heart saves the vendor and offers Compare", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  let list: unknown[] = [];
  api.get("/saved-vendors", () => ({ items: list }));
  api.put("/saved-vendors/vendor-1", () => {
    list = [saved("vendor-1", "Anjali Kapoor")];
    return {};
  });
  api.get("/vendors/search", mockVendorSearchResponse([mockVendorSearchItem()]));
  await page.goto("marketplace/");

  await expect(page.getByText("Select vendors to compare")).toBeVisible();
  await page.getByRole("button", { name: "Save Anjali Kapoor" }).click();
  await expect(page.getByRole("button", { name: "Remove Anjali Kapoor" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 vendor selected")).toBeVisible();
  expect(api.requestsTo("PUT", "/saved-vendors/vendor-1")).toHaveLength(1);
  await expect(page.getByRole("link", { name: "Next · Compare" })).toHaveAttribute("href", /\/compare\/?$/);
});

test("Compare lays the saved vendors side by side and removes one", async ({ page, api }) => {
  await loginAs(page, api);
  shell(api);
  let list = [saved("v1", "Lens & Light"), saved("v2", "Kiran Collective", { num_reviews: 0, rating: 0, starting_price: null, years_experience: null })];
  api.get("/saved-vendors", () => ({ items: list }));
  api.delete("/saved-vendors/v2", () => {
    list = list.filter((v) => v.vendor_id !== "v2");
    return {};
  });
  await page.goto("compare/");

  await expect(page.getByText("2 selected")).toBeVisible();
  const row = (label: string) => page.getByRole("row", { name: new RegExp(`^${label}`) });
  await expect(row("Rating")).toContainText("★ 4.8");
  // No reviews yet reads as new, not as zero stars; no listed price asks for a quote.
  await expect(row("Rating")).toContainText("New");
  await expect(row("Starting price")).toContainText("From $2,400");
  await expect(row("Starting price")).toContainText("Ask for a quote");
  await expect(page.getByRole("link", { name: "View vendor" }).first()).toHaveAttribute("href", /vendor\/?\?id=v1$/);

  await page.getByRole("button", { name: "Remove Kiran Collective" }).click();
  await expect(page.getByText("1 selected")).toBeVisible();
  expect(api.requestsTo("DELETE", "/saved-vendors/v2")).toHaveLength(1);
});

test("with nothing saved, Compare points back to Explore; signed out, cards have no heart", async ({ page, api }) => {
  api.get("/vendors/search", mockVendorSearchResponse([mockVendorSearchItem()]));
  await page.goto("marketplace/");
  await expect(page.getByRole("heading", { name: "Anjali Kapoor" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Save / })).toHaveCount(0);

  await loginAs(page, api);
  shell(api);
  api.get("/saved-vendors", { items: [] });
  await page.goto("compare/");
  await expect(page.getByRole("heading", { name: "No vendors selected" })).toBeVisible();
});
