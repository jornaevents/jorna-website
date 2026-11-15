import { test, expect, loginAs } from "./support/fixtures";
import { mockBundleBooking, mockBundleDetail } from "./support/mock-data";

// The Budget and Day-of tabs of the event workspace (client redesign PR 10).

const EVENT = { event_id: "event-1", user_id: "user-1", name: "Priya's Wedding", date_iso: "2099-05-22", location: "Edison, NJ", budget: 3000 };
const schedule = [
  { id: "dep", label: "Deposit", amount_cents: 100000, due_type: "on_signing", effective_due: "2020-01-10", marked_paid_at: "2020-01-09T00:00:00Z", confirmed_at: "2020-01-09T00:00:00Z" },
  { id: "bal", label: "Balance", amount_cents: 150000, due_type: "before_event", effective_due: "2020-02-10", marked_paid_at: null, confirmed_at: null },
];

test.beforeEach(async ({ page, api }) => {
  await loginAs(page, api);
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/events", [EVENT]);
  api.get("/bundles", [
    mockBundleDetail({
      status: "sent",
      bookings: [
        mockBundleBooking({ booking_id: "bk-photo", vendor_name: "Lens & Light", date_iso: "2099-05-22", contract_token: "tok-1", contract_status: "signed", signed_at: "2019-12-01T00:00:00Z", payment_schedule: schedule }),
        mockBundleBooking({ booking_id: "bk-cater", vendor_name: "Royal Caterers", service_category: "catering", date_iso: "2099-05-22", amount_cents: 1145000, contract_token: "tok-2", contract_status: "sent" }),
      ],
    }),
  ]);
});

test("Budget counts signed contracts only and lists payments by month", async ({ page }) => {
  await page.goto("event/?id=event-1&tab=budget");

  const figure = (label: string) => page.locator("dl div").filter({ hasText: label }).locator("dd");
  await expect(figure("Event budget")).toHaveText("$3,000");
  await expect(figure("Signed contracts")).toHaveText("$2,500");
  await expect(figure("Paid")).toHaveText("$1,000");
  await expect(figure("Still to pay")).toHaveText("$1,500");
  // Sent, not signed: named, not counted.
  await expect(page.getByText("Pending contracts: $11,450 from Royal Caterers — not counted until signed.")).toBeVisible();

  const payments = page.getByRole("region", { name: "Payments" });
  await expect(payments.getByText("January 2020")).toBeVisible();
  await expect(payments.getByRole("button", { name: /Deposit/ })).toContainText("Paid");
  const balance = payments.getByRole("button", { name: /Balance/ });
  await expect(balance).toContainText("Overdue");
  // A payment opens its vendor, where it's paid.
  await balance.click();
  await expect(page.getByRole("dialog", { name: "Lens & Light" })).toBeVisible();
});

test("Day-of shows the order of the day from the plan's schedule", async ({ page }) => {
  await page.goto("event/?id=event-1");
  await page.getByRole("link", { name: "Day-of" }).click();
  await expect(page).toHaveURL(/tab=dayof/);
  await expect(page.getByRole("heading", { name: "Who's coming, and when" })).toBeVisible();
  await expect(page.getByText("Lens & Light").first()).toBeVisible();
  await expect(page.getByText("Royal Caterers").first()).toBeVisible();
});
