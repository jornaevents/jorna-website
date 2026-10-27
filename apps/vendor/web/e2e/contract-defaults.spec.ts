import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// Plan 2.4: every contract default in one "Defaults" drawer on the Contracts
// page, including the usual payment schedule (backend 0070), and new
// contracts starting from it.
test.describe("contract defaults (/contracts → Defaults)", () => {
  test("saves deposit, the usual schedule, the hold and the clauses as one list", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail({
      default_deposit_percent: 25,
      venmo_handle: "@studio",
      default_contract_terms: { equipment_power: "We bring our own gear.", custom: [{ label: "Meals", value: "One hot meal." }] },
    });
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });
    api.patch("/vendors/me", { ...vendor, default_payment_plan: { preset: "three", balance_days_before: 30 } });

    await page.goto("contracts/");
    await page.getByRole("button", { name: "Defaults", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByLabel("Deposit (%)")).toHaveValue("25");
    await expect(drawer.getByText("Clients pay you by Venmo @studio.")).toBeVisible();

    await drawer.getByLabel("Three payments").check();
    await drawer.getByLabel("Balance due (days before the event)").fill("30");
    await drawer.getByLabel("Hold the date for (days)").fill("10");
    // The old fixed "Equipment & power" box is now a row like any other.
    await expect(drawer.getByLabel("Clause title").first()).toHaveValue("Equipment & power");
    await drawer.getByRole("button", { name: "Move Meals up" }).click();
    await drawer.getByRole("button", { name: "Save defaults" }).click();

    await expect(drawer).toHaveCount(0);
    await expect(page.getByText("Defaults saved. New contracts start from them.")).toBeVisible();
    const [call] = api.requestsTo("PATCH", "/vendors/me");
    expect(call.body).toMatchObject({
      default_deposit_percent: 25,
      contract_hold_days: 10,
      default_payment_plan: { preset: "three", balance_days_before: 30 },
      default_contract_terms: {
        custom: [
          { label: "Meals", value: "One hot meal." },
          { label: "Equipment & power", value: "We bring our own gear." },
        ],
      },
    });
  });

  test("won't save a hold outside 1–60 days", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });

    await page.goto("contracts/");
    await page.getByRole("button", { name: "Defaults", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Hold the date for (days)").fill("90");
    await drawer.getByRole("button", { name: "Save defaults" }).click();

    await expect(drawer.getByRole("alert")).toContainText("between 1 and 60 days");
    expect(api.requestsTo("PATCH", "/vendors/me")).toHaveLength(0);
  });

  test("a new contract starts from the usual schedule", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail({
      default_deposit_percent: 25,
      default_payment_plan: { preset: "deposit_balance", balance_days_before: 21 },
    });
    api.get("/vendors/me", vendor);
    api.get("/services", {
      items: [{ service_id: "svc-1", vendor_id: vendor.vendor_id, name: "Reception set", price: 1400, add_ons: [] }],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.get("/contract-templates", { items: [], total: 0 });

    await page.goto("contracts/new/?scratch=1");
    await page.getByLabel("Add a package").selectOption("svc-1");
    const schedule = page.getByRole("region", { name: "Payment schedule" });
    await expect(schedule.getByLabel("Amount ($)").first()).toHaveValue("350");
    await expect(schedule.getByLabel("Days before the event")).toHaveValue("21");
  });
});
