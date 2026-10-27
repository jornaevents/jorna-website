import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// Send a contract asks what to start from (backend DECISIONS #31): every
// package's template, the vendor's own templates, or scratch.
function mockVendor(api: ApiMock, templates: unknown[] = []) {
  const vendor = mockVendorDetail({ default_deposit_percent: 25 });
  api.get("/vendors/me", vendor);
  api.get("/services", {
    items: [
      { service_id: "svc-full", vendor_id: vendor.vendor_id, name: "Full day", price: 2500, price_unit: "event",
        included_hours: 8, inclusions: ["Second shooter"], add_ons: [], sort_order: 1, status: "active" },
      { service_id: "svc-guest", vendor_id: vendor.vendor_id, name: "Per-guest dinner", price: 45, price_unit: "person",
        add_ons: [], sort_order: 2, status: "hidden" },
      { service_id: "svc-old", vendor_id: vendor.vendor_id, name: "Retired package", price: 900,
        add_ons: [], sort_order: 3, status: "archived" },
    ],
    total: 3,
    limit: 100,
    offset: 0,
  });
  api.get("/contract-templates", { items: templates, total: templates.length });
  api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });
  return vendor;
}

test.describe("contract template picker", () => {
  test("Send a contract offers each package's template, the vendor's own, and scratch", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api, [
      { template_id: "t-1", name: "Sangeet", kind: "agreement", body: { version: 1, title: "Sangeet agreement" },
        service_id: null, created_at: "2030-01-01", updated_at: "2030-01-01" },
    ]);

    await page.goto("contracts/new/");
    await expect(page.getByRole("heading", { name: "Send a contract" })).toBeVisible();
    const packages = page.getByRole("region", { name: "Your packages" });
    await expect(packages.getByRole("button")).toHaveCount(2);
    await expect(packages.getByRole("button", { name: /Full day.*\$2,500\.00/ })).toBeVisible();
    // Private packages are what contracts are for; retired ones aren't offered.
    await expect(packages.getByRole("button", { name: /Per-guest dinner/ })).toBeVisible();
    await expect(page.getByText("Retired package")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Your templates" }).getByRole("button", { name: /Sangeet/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Start from scratch/ })).toBeVisible();

    await packages.getByRole("button", { name: /Full day/ }).click();
    await expect(page).toHaveURL(/package=svc-full/);
    await expect(page.getByLabel("Agreement title")).toHaveValue("Full day agreement");
    await expect(page.getByLabel("Item", { exact: true })).toHaveValue("Full day");
    await expect(page.getByLabel(/^Price/)).toHaveValue("2500");
    await expect(page.getByText(/Started from “Full day”/)).toBeVisible();
  });

  test("a package's edited template takes its place", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api, [
      { template_id: "t-edit", name: "Full day (weddings)", kind: "agreement", service_id: "svc-full",
        body: { version: 1, title: "Wedding day agreement",
          lines: [{ kind: "package", serviceId: "svc-full", addonId: null, name: "Full day", unit: "event", price: "2700", quantity: "1" }] },
        created_at: "2030-01-01", updated_at: "2030-01-01" },
    ]);

    await page.goto("contracts/new/");
    const card = page.getByRole("region", { name: "Your packages" }).getByRole("button", { name: /Full day \(weddings\)/ });
    await expect(card).toContainText("Edited");
    // It's the package's, so it isn't listed again among the vendor's own.
    await expect(page.getByRole("region", { name: "Your templates" })).toHaveCount(0);
    await card.click();
    await expect(page.getByLabel("Agreement title")).toHaveValue("Wedding day agreement");
    await expect(page.getByLabel(/^Price/)).toHaveValue("2700");
  });

  test("scratch is the vendor's usual terms, no items", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api);
    await page.goto("contracts/new/");
    await page.getByRole("button", { name: /Start from scratch/ }).click();
    await expect(page).toHaveURL(/scratch=1/);
    await expect(page.getByLabel("Item", { exact: true })).toHaveCount(0);
  });

  test("answering a request marks the package asked for, and keeps the client's quantity", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendor(api);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          status: "pending", service_id: "svc-guest", service_name: "Per-guest dinner", price: 45,
          price_unit: "person", price_pending_quantity: true, guest_count: 180,
          date_iso: "2030-06-01", time_start: "18:00", time_end: "23:00", location: "Pines Manor",
        }),
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });

    await page.goto("contracts/new/?request=vbooking-1");
    await expect(page.getByRole("heading", { name: /Accept Priya Shah/ })).toBeVisible();
    const packages = page.getByRole("region", { name: "Your packages" }).getByRole("button");
    await expect(packages.first()).toContainText("Per-guest dinner");
    await expect(packages.first()).toContainText("Requested");

    await packages.first().click();
    await expect(page).toHaveURL(/request=vbooking-1.*package=svc-guest|package=svc-guest.*request=vbooking-1/);
    await expect(page.getByLabel("Agreement title")).toHaveValue("Per-guest dinner agreement");
    await expect(page.getByLabel("Qty")).toHaveValue("180");
  });

  test("the editor's menu can switch to another package's template", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api);
    await page.goto("contracts/new/?scratch=1");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByLabel("Start from a template").selectOption({ label: "Full day" });
    await expect(page.getByLabel("Item", { exact: true })).toHaveValue("Full day");
  });

  // ── Batch 4 of the contract fix plan (2026-10-26 staging test) ──

  test("an edited template says what's in it, and offers the package's price today", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api, [
      { template_id: "t-edit", name: "Full day (weddings)", kind: "agreement", service_id: "svc-full",
        body: { version: 1, title: "Wedding day agreement",
          lines: [{ kind: "package", serviceId: "svc-full", addonId: null, name: "Full day", unit: "event", price: "2000", quantity: "1" }],
          schedule: [{ label: "Deposit", percent: 50, dueType: "on_signing", dueDays: "" }, { label: "Balance", percent: 50, dueType: "before_event", dueDays: "14" }],
          clauses: [{ title: "Meals", body: "A hot meal." }] },
        created_at: "2030-01-01", updated_at: "2030-01-01" },
    ]);

    await page.goto("contracts/new/");
    await expect(page.getByRole("button", { name: /Full day · \$2,500\.00 · your edited template · 1 item · 2 payments · 1 section/ })).toBeVisible();
    await page.getByRole("button", { name: /Full day \(weddings\)/ }).click();
    await expect(page.getByText("Full day is now $2,500 — this template has $2,000.")).toBeVisible();
    await expect(page.getByLabel(/^Price/)).toHaveValue("2000");
    await page.getByRole("button", { name: "Use today's price" }).click();
    await expect(page.getByLabel(/^Price/)).toHaveValue("2500");
  });

  test("a template's blank overtime leaves the vendor's default in", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendor(api, [
      { template_id: "t-1", name: "Sangeet", kind: "agreement", service_id: null,
        body: { version: 1, title: "Sangeet agreement", overtimeRate: "", cancellationDays: "" },
        created_at: "2030-01-01", updated_at: "2030-01-01" },
    ]);
    api.get("/vendors/me", { ...vendor, default_overtime_rate_cents: 17500, negotiation_locks: ["prices"] });

    await page.goto("contracts/new/?template=t-1");
    await expect(page.getByLabel("Overtime rate ($/hr)")).toHaveValue("175");
    // The client can't ask to change prices, and the editor says so.
    await expect(page.getByText("· Fixed: prices")).toBeVisible();
  });
});
