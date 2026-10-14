import { test, expect, loginAs } from "./support/fixtures";
import { mockLead, mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// The contract editor says what's wrong before Send, not after (web #166):
// payments due in the past, a total the discount wipes out, a date that's
// already booked, blanks left in a suggested section, a hold out of range.
function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mockEditor(api: ApiMock, vendorOver: Record<string, unknown> = {}) {
  const vendor = mockVendorDetail({ f_name: "Priya", l_name: "Lens", default_deposit_percent: 25, ...vendorOver });
  api.get("/vendors/me", vendor);
  api.get("/services", {
    items: [
      {
        service_id: "svc-1",
        vendor_id: vendor.vendor_id,
        name: "Sangeet Night Coverage",
        price: 2500,
        duration_minutes: 300,
        add_ons: [],
      },
    ],
    total: 1,
    limit: 100,
    offset: 0,
  });
  api.get("/contract-templates", { items: [], total: 0 });
  return vendor;
}

async function fillEvent(page: import("@playwright/test").Page, date: string) {
  await page.getByLabel("Date", { exact: true }).fill(date);
  await page.getByLabel("Start time").fill("18:00");
  await page.getByLabel("End time").fill("23:00");
  await page.getByLabel("Add a package").selectOption("svc-1");
}

const send = (page: import("@playwright/test").Page) =>
  page.getByRole("complementary", { name: "Send" }).getByRole("button", { name: "Send & hold date" }).click();

test.describe("contract editor checks", () => {
  test("a payment counted back past today is flagged; one after the event is only noted", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/");
    await fillEvent(page, iso(250));
    const schedule = page.getByRole("article", { name: "Contract document" }).getByRole("region", { name: "Payment schedule" });

    await schedule.getByLabel("Days before the event").fill("400");
    await send(page);
    await expect(schedule.getByText(/“Final balance” would be due .* which has passed/)).toBeVisible();
    expect(api.requestsTo("POST", "/contracts")).toHaveLength(0);

    await schedule.getByLabel("Due").last().selectOption("date");
    await schedule.getByLabel("Due date").fill(iso(280));
    await expect(schedule.getByText(/“Final balance” is due .*after the event/)).toBeVisible();
    await expect(schedule.getByText(/which has passed/)).toHaveCount(0);
  });

  test("a discount bigger than the items is the one problem, shown as a negative total", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/");
    await fillEvent(page, iso(60));
    await page.getByLabel("Discount ($)").fill("3000");
    await expect(page.getByTestId("rail-total")).toHaveText("−$500.00");
    await send(page);
    await expect(page.getByText(/The discount \(\$3,000\.00\) is as much as the items/)).toBeVisible();
    await expect(page.getByText("Add at least one payment to the schedule.")).toHaveCount(0);
  });

  test("a date already booked is said when it's picked", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockEditor(api);
    const taken = iso(90);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        {
          booking_id: "b-signed",
          status: "approved",
          contract_token: "tok-x",
          signed_at: "2026-01-01T00:00:00Z",
          client_name: "Asha Mehta",
          date_iso: taken,
          time_start: "17:00",
          time_end: "22:00",
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
    await page.goto("contracts/new/");
    await fillEvent(page, taken);
    await expect(page.getByText(/You're already booked then: Asha Mehta/)).toBeVisible();
    await page.getByLabel("Start time").fill("08:00");
    await page.getByLabel("End time").fill("12:00");
    await expect(page.getByText(/You're already booked then/)).toHaveCount(0);
  });

  test("Travel uses the vendor's own radius and leaves the rate to fill in", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, { travel_radius_miles: 60 });
    await page.goto("contracts/new/");
    await fillEvent(page, iso(60));
    await page.getByRole("button", { name: "+ Travel" }).click();
    await expect(page.getByLabel("Section text").last()).toHaveValue(/Travel within 60 miles is included\. .*\$___ per mile/);
    await send(page);
    await expect(page.getByText("Fill in the blank (___) in “Travel”.")).toBeVisible();
  });

  test("a hold out of range is said under the field instead of quietly becoming 7 days", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/");
    await page.getByLabel("Hold the date for (days)").fill("-2");
    await expect(page.getByText("Hold the date for between 1 and 60 days.")).toBeVisible();
  });

  test("the package's included hours go into the contract", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    await page.goto("contracts/new/");
    await page.getByLabel("Add a package").selectOption("svc-1");
    await expect(page.getByLabel("Add a package").locator("option", { hasText: "$2,500.00" })).toHaveCount(1);
    await expect(page.getByText(/5 hours included/).first()).toBeVisible();
  });

  test("a contract started from a lead belongs to Leads", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api);
    api.get("/leads", { items: [mockLead({ lead_id: "lead-9", name: "Rohan Das" })], total: 1 });
    await page.goto("contracts/new/?lead=lead-9");
    await expect(page.getByRole("link", { name: "← Back to Leads" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Vendor" }).getByRole("link", { name: /Leads/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Vendor" }).getByRole("link", { name: /Contracts/ })).not.toHaveAttribute("aria-current", "page");
  });
});
