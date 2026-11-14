import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// Settings (sidebar footer), from the 2026-10 vendor redesign: Venmo/Zelle
// saves to the vendor record, the site stays light (dark mode is behind a flag), and the
// account can be deleted from the foot of the page. Saves wait for a change,
// and the password fields stay closed until asked for. The tentative-hold length
// moved to Contracts → Defaults (plan 2.4); Google Calendar is on the calendar.
test.describe("vendor settings (/settings)", () => {
  function mockSettings(api: import("./support/api-mock").ApiMock) {
    const vendor = mockVendorDetail({ payment_method: "manual", venmo_handle: "@old" });
    api.get("/vendors/me", vendor);
    api.patch("/vendors/me", { ...vendor, venmo_handle: "@studio" });
    return vendor;
  }

  test("saves Venmo without touching the hold length", async ({ page, api }) => {
    await loginAs(page, api);
    mockSettings(api);

    await page.goto("settings/");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Settings", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByLabel("Venmo handle").fill("@studio");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("Saved.")).toBeVisible();
    const calls = api.requestsTo("PATCH", "/vendors/me");
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ venmo_handle: "@studio" });
    // Not sent from here, so it can't overwrite what Defaults saved.
    expect(calls[0].body).not.toHaveProperty("contract_hold_days");
  });

  test("profile Save waits for a change", async ({ page, api }) => {
    await loginAs(page, api);
    mockSettings(api);

    await page.goto("settings/");
    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();

    await page.getByLabel("Phone").fill("555-0100");
    await expect(save).toBeEnabled();
  });

  test("password fields open on request, and Cancel closes them", async ({ page, api }) => {
    await loginAs(page, api);
    mockSettings(api);
    api.post("/auth/change-password", { message: "ok" });

    await page.goto("settings/");
    await expect(page.getByLabel("Current password")).toHaveCount(0);

    await page.getByRole("button", { name: "Change password" }).click();
    await page.getByLabel("Current password").fill("old-password");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Current password")).toHaveCount(0);

    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByLabel("Current password")).toHaveValue("");
    await page.getByLabel("Current password").fill("old-password");
    await page.getByLabel("New password").fill("new-password-123");
    await page.getByRole("button", { name: "Update password" }).click();

    await expect(page).toHaveURL(/\/login\/?\?next=(%2F|\/)settings/);
    expect(api.requestsTo("POST", "/auth/change-password")).toHaveLength(1);
  });

  test("deletes the account after asking twice", async ({ page, api }) => {
    await loginAs(page, api);
    mockSettings(api);
    api.delete("/me", null);

    await page.goto("settings/");
    await expect(page.getByRole("heading", { name: "Google Calendar" })).toHaveCount(0);
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByRole("button", { name: "Delete my account permanently" }).click();

    await expect(page).toHaveURL(/\/home\/?$/);
    expect(api.requestsTo("DELETE", "/me")).toHaveLength(1);
  });

  // Dark mode is behind NEXT_PUBLIC_DARK_MODE_ENABLED (lib/flags.ts), unset
  // here as in production: light only, even on a dark device or with a dark
  // choice stored from before.
  test("the site is light only: no theme picker, and a dark device stays light", async ({ page, api }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("jorna_theme", "dark"));
    await loginAs(page, api);
    mockSettings(api);

    await page.goto("settings/");

    await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();
    await expect(page.getByText("Theme", { exact: true })).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-dark-mode", /.*/);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(ground).toBe("rgb(246, 238, 225)");
  });
});
