import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { ApiMock, HandlerArgs } from "./support/api-mock";

// Editing templates (backend DECISIONS #31): the contract editor in template
// mode, Manage templates, and the contract editor's ⋯ Update.
const EDIT = {
  template_id: "t-edit", name: "Full day (weddings)", kind: "agreement", service_id: "svc-full",
  body: { version: 1, title: "Wedding day agreement",
    lines: [{ kind: "package", serviceId: "svc-full", addonId: null, name: "Full day", unit: "event", price: "2700", quantity: "1" }] },
  created_at: "2030-01-01", updated_at: "2030-01-01",
};
const SAVED = {
  template_id: "t-1", name: "Sangeet", kind: "agreement", service_id: null,
  body: { version: 1, title: "Sangeet agreement", clauses: [{ title: "Meals", body: "Dinner for two." }] },
  created_at: "2030-01-01", updated_at: "2030-01-01",
};

function mockVendor(api: ApiMock, templates: () => unknown[]) {
  const vendor = mockVendorDetail({ default_deposit_percent: 25 });
  api.get("/vendors/me", vendor);
  api.get("/services", {
    items: [
      { service_id: "svc-full", vendor_id: vendor.vendor_id, name: "Full day", price: 2500, price_unit: "event",
        included_hours: 8, add_ons: [], sort_order: 1, status: "active" },
    ],
    total: 1,
    limit: 100,
    offset: 0,
  });
  api.get("/contract-templates", () => ({ items: templates(), total: templates().length }));
  api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });
  return vendor;
}

test.describe("editing contract templates", () => {
  test("a package's template is edited without a client or event, and saving makes it the vendor's", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api, () => []);
    api.post("/contract-templates", ({ route }: HandlerArgs) => ({
      ...EDIT, ...route.request().postDataJSON(), template_id: "t-new",
    }));

    await page.goto("contracts/template/?package=svc-full");
    await expect(page.getByRole("heading", { name: "Edit template" })).toBeVisible();
    await expect(page.getByText(/follows the package's price and details/)).toBeVisible();
    const doc = page.getByRole("article", { name: "Contract document" });
    await expect(doc.getByRole("region", { name: "Event details" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Send/ })).toHaveCount(0);
    // A template has no date to miss.
    await expect(page.getByText(/to fix before/)).toHaveCount(0);

    await doc.getByLabel(/^Price/).fill("2700");
    await page.getByLabel("Template name").fill("Full day (weddings)");
    await page.getByRole("complementary", { name: "Save" }).getByRole("button", { name: "Save template" }).click();

    await expect(page.getByText(/Saved\. Contracts you start from “Full day \(weddings\)” begin like this/)).toBeVisible();
    const [call] = api.requestsTo("POST", "/contract-templates");
    expect(call.body).toMatchObject({
      name: "Full day (weddings)",
      kind: "agreement",
      service_id: "svc-full",
      body: { lines: [{ serviceId: "svc-full", price: "2700" }] },
    });
    // Now it's the vendor's own, and can go back to the package's.
    await expect(page.getByRole("button", { name: "Reset to package" })).toBeVisible();
  });

  test("Reset to package drops the edit, and the template follows the package again", async ({ page, api }) => {
    await loginAs(page, api);
    let stored: unknown[] = [EDIT];
    mockVendor(api, () => stored);
    api.delete("/contract-templates/t-edit", () => {
      stored = [];
      return { message: "Template deleted" };
    });

    await page.goto("contracts/template/?package=svc-full");
    await expect(page.getByText(/no longer follows the package/)).toBeVisible();
    await expect(page.getByLabel(/^Price/)).toHaveValue("2700");
    await page.getByRole("button", { name: "Reset to package" }).click();

    await expect(page.getByText(/follows the package's price and details/)).toBeVisible();
    await expect(page.getByLabel(/^Price/)).toHaveValue("2500");
    expect(api.requestsTo("DELETE", "/contract-templates/t-edit")).toHaveLength(1);
  });

  test("one of the vendor's own templates saves over itself", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api, () => [SAVED]);
    api.patch("/contract-templates/t-1", ({ route }: HandlerArgs) => ({ ...SAVED, ...route.request().postDataJSON() }));

    await page.goto("contracts/template/?id=t-1");
    await expect(page.getByLabel("Template name")).toHaveValue("Sangeet");
    await page.getByLabel("Template name").fill("Sangeet night");
    await page.getByRole("button", { name: "Save template" }).first().click();
    await expect(page.getByText(/Saved\./)).toBeVisible();
    const [call] = api.requestsTo("PATCH", "/contract-templates/t-1");
    expect(call.body).toMatchObject({ name: "Sangeet night", body: { clauses: [{ title: "Meals" }] } });
    expect(api.requestsTo("POST", "/contract-templates")).toHaveLength(0);
  });

  test("Manage templates edits, renames, duplicates, deletes and resets", async ({ page, api }) => {
    await loginAs(page, api);
    let stored: Record<string, unknown>[] = [EDIT, SAVED];
    mockVendor(api, () => stored);
    api.patch("/contract-templates/t-1", ({ route }: HandlerArgs) => {
      stored = stored.map((t) => (t.template_id === "t-1" ? { ...t, ...route.request().postDataJSON() } : t));
      return stored.find((t) => t.template_id === "t-1");
    });
    api.post("/contract-templates", ({ route }: HandlerArgs) => {
      const made = { ...route.request().postDataJSON(), template_id: "t-copy", service_id: null, created_at: "x", updated_at: "x" };
      stored = [...stored, made];
      return made;
    });
    api.delete("/contract-templates/t-edit", () => {
      stored = stored.filter((t) => t.template_id !== "t-edit");
      return { message: "Template deleted" };
    });

    await page.goto("contracts/");
    await page.getByRole("button", { name: "Manage templates" }).click();
    const drawer = page.getByRole("dialog");
    const pkgs = drawer.getByRole("region", { name: "Package templates" });
    await expect(pkgs.getByText("Full day (weddings)")).toBeVisible();
    await expect(pkgs.getByRole("link", { name: "Edit" })).toHaveAttribute("href", /contracts\/template\/?\?package=svc-full/);

    const own = drawer.getByRole("region", { name: "Saved templates" });
    await expect(own.getByRole("link", { name: "Edit" })).toHaveAttribute("href", /contracts\/template\/?\?id=t-1/);
    await own.getByRole("button", { name: "Rename" }).click();
    await own.getByLabel("Template name").fill("Sangeet night");
    await own.getByRole("button", { name: "Save" }).click();
    await expect(drawer.getByText("Renamed to “Sangeet night”.")).toBeVisible();
    await expect(own.getByText("Sangeet night")).toBeVisible();

    await own.getByRole("button", { name: "Duplicate" }).click();
    await expect(own.getByText("Sangeet night (copy)")).toBeVisible();
    expect(api.requestsTo("POST", "/contract-templates")[0].body).not.toHaveProperty("service_id");

    await pkgs.getByRole("button", { name: "Reset to package" }).click();
    await expect(drawer.getByText(/follows the package again/)).toBeVisible();
    await expect(pkgs.getByText("Full day", { exact: true })).toBeVisible();
  });

  test("a contract started from a package can update that package's template", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api, () => []);
    api.post("/contract-templates", ({ route }: HandlerArgs) => ({
      ...EDIT, ...route.request().postDataJSON(), template_id: "t-new",
    }));

    await page.goto("contracts/new/?package=svc-full");
    await page.getByLabel(/^Price/).fill("2600");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Update “Full day”" }).click();
    await expect(page.getByText(/Updated “Full day” — contracts you start from it begin like this one/)).toBeVisible();
    const [call] = api.requestsTo("POST", "/contract-templates");
    expect(call.body).toMatchObject({ service_id: "svc-full", body: { lines: [{ price: "2600" }] } });
    // The client and event are each contract's own.
    expect(JSON.stringify(call.body)).not.toContain("clientName");
  });
});
