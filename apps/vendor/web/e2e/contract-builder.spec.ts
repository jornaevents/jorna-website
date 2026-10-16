import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// Plan 2.3b: the contract editor shows the contract as the client will read
// it — policies in the document, problems under the block that has them, a
// preview, and Send in reach on a phone.
function mockEditor(api: ApiMock) {
  const vendor = mockVendorDetail({ f_name: "Sound", l_name: "Studio", default_deposit_percent: 25 });
  api.get("/vendors/me", vendor);
  api.get("/services", {
    items: [{ service_id: "svc-1", vendor_id: vendor.vendor_id, name: "Reception set", price: 1400, add_ons: [] }],
    total: 1,
    limit: 100,
    offset: 0,
  });
  api.get("/contract-templates", { items: [], total: 0 });
  return vendor;
}

test.describe("contract editor fixes (plan 2.3b)", () => {
  test("problems wait for Send, then show under their block", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/?scratch=1");
    const doc = page.getByRole("article", { name: "Contract document" });
    const event = doc.getByRole("region", { name: "Event details" });

    // Nothing is flagged while the contract is being written…
    await expect(event.getByText("Pick the event date.")).toHaveCount(0);
    await expect(page.getByText(/things? to fix before sending/)).toBeVisible();

    // …and Send says what's missing where it's fixed, instead of sending.
    await page.getByRole("complementary", { name: "Send" }).getByRole("button", { name: "Send & hold date" }).click();
    await expect(event.getByText("Pick the event date.")).toBeVisible();
    await expect(doc.getByRole("region", { name: "Packages & items" }).getByText("Add at least one of your packages.")).toBeVisible();
    expect(api.requestsTo("POST", "/contracts")).toHaveLength(0);
  });

  test("the cancellation window lives in its own section, overtime under the schedule", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/?scratch=1");
    const doc = page.getByRole("article", { name: "Contract document" });
    const schedule = doc.getByRole("region", { name: "Payment schedule" });

    await expect(schedule.getByLabel("Overtime rate ($/hr)")).toBeVisible();
    await schedule.getByRole("button", { name: "+ Add a cancellation window" }).click();
    const days = doc.getByLabel("Cancellation window (days before the event)");
    await expect(days).toHaveValue("30");
    await days.fill("45");
    await expect(doc.getByText("Cancelling within 45 days of the event may forfeit what's been paid.")).toBeVisible();
    // One place for it: the suggestion and the schedule's button go away.
    await expect(doc.getByRole("button", { name: "+ Cancellation" })).toHaveCount(0);
    await expect(schedule.getByRole("button", { name: "+ Add a cancellation window" })).toHaveCount(0);
    // Hold days is about sending, so it stays with Send.
    await expect(page.getByRole("complementary", { name: "Send" }).getByLabel("Hold the date for (days)")).toBeVisible();
  });

  test("a new custom item takes the cursor, and left blank it neither blocks nor eats the next click", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/?scratch=1");
    await page.getByLabel("Add a package").selectOption("svc-1");
    const doc = page.getByRole("article", { name: "Contract document" });
    const items = doc.getByRole("region", { name: "Packages & items" });

    await items.getByRole("button", { name: "+ Add a custom item" }).click();
    await expect(items.getByRole("textbox", { name: "Item", exact: true }).last()).toBeFocused();
    // The click that leaves the empty row does what it was for.
    await doc.getByRole("button", { name: "Three payments" }).click();
    await expect(doc.getByRole("region", { name: "Payment schedule" }).getByLabel("Name")).toHaveCount(3);

    await page.getByRole("complementary", { name: "Send" }).getByRole("button", { name: "Send & hold date" }).click();
    await expect(items.getByText("Every line needs a name.")).toHaveCount(0);
  });

  test("Preview as client shows the contract as the client reads it", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/?scratch=1");
    await page.getByLabel("Add a package").selectOption("svc-1");
    await page.getByRole("button", { name: "Preview as client" }).click();

    const preview = page.getByRole("dialog");
    await expect(preview.getByText("What's included")).toBeVisible();
    await expect(preview.getByText("Reception set").first()).toBeVisible();
  });

  test("on a phone, the total and Send stay at the bottom of the screen", async ({ page, api }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/?scratch=1");
    await page.getByLabel("Add a package").selectOption("svc-1");

    const bar = page.locator("div.fixed.bottom-0");
    await expect(bar).toContainText("$1,400.00");
    await expect(bar.getByRole("button", { name: "Send & hold date" })).toBeInViewport();
  });
});
