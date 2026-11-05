import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// Settings (sidebar footer), from the 2026-10 vendor redesign: Venmo/Zelle
// saves to the vendor record, and the theme choice sticks across a reload.
// The tentative-hold length moved to Contracts → Defaults (plan 2.4).
test.describe("vendor settings (/settings)", () => {
  function mockSettings(api: import("./support/api-mock").ApiMock) {
    const vendor = mockVendorDetail({ payment_method: "manual", venmo_handle: "@old" });
    api.get("/vendors/me", vendor);
    api.get(`/vendors/${vendor.vendor_id}/calendar-status`, {
      google_calendar_connected: false,
      google_calendar_write_enabled: false,
    });
    api.patch("/vendors/me", { ...vendor, venmo_handle: "@studio" });
    return vendor;
  }

  test("saves Venmo, and points to Contracts for the hold length", async ({ page, api }) => {
    await loginAs(page, api);
    mockSettings(api);

    await page.goto("settings/");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Settings", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByLabel("Venmo handle").fill("@studio");
    await expect(page.getByRole("link", { name: "Contracts → Defaults" })).toHaveAttribute("href", /\/contracts\/?$/);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("Saved.")).toBeVisible();
    const calls = api.requestsTo("PATCH", "/vendors/me");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ venmo_handle: "@studio" });
    // Not sent from here, so it can't overwrite what Defaults saved.
    expect(calls[0].body).not.toHaveProperty("contract_hold_days");
  });

  test("Show AI summaries can be turned off", async ({ page, api }) => {
    const user = await loginAs(page, api);
    mockSettings(api);
    api.patch("/me", { ...user, ai_summaries_enabled: false });

    await page.goto("settings/");
    const box = page.getByRole("checkbox", { name: /Show AI summaries/ });
    await expect(box).toBeChecked();
    await box.uncheck();
    await expect(box).not.toBeChecked();
    expect(api.requestsTo("PATCH", "/me")[0].body).toEqual({ ai_summaries_enabled: false });
  });

  test("the theme choice survives a reload", async ({ page, api }) => {
    await loginAs(page, api);
    mockSettings(api);

    await page.goto("settings/");
    await page.getByRole("tab", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("tab", { name: "Dark" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: "Match device" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });
});

test.describe("vendor shell on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the hamburger opens the nav and a link closes it", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/leads/pipeline", { items: [], counts: { inquiries: 0, negotiations: 0, needs_you: 0, waiting: 0, archived: 0 } });

    await page.goto("leads/");
    await expect(page.getByRole("navigation", { name: "Vendor" })).toBeHidden();

    await page.getByRole("button", { name: "Menu" }).click();
    const nav = page.getByRole("navigation", { name: "Vendor" });
    await expect(nav.getByRole("link", { name: "Leads" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings\/?$/);
    await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  });
});
