import { test, expect, loginAs } from "./support/fixtures";
import { mockBundleBooking, mockBundleDetail } from "./support/mock-data";
import type { ApiMock, HandlerArgs } from "./support/api-mock";

// The event workspace (client redesign PR 4): an event's Overview — each
// vendor with one status and one next step, what's still to find, what needs
// the client, the budget — the vendor drawer, and editing the event.

const EVENT = {
  event_id: "event-1", user_id: "user-1", name: "Priya's Wedding", date_iso: "2099-05-22", date_end: "2099-05-24",
  location: "Edison, NJ", guest_count: 300, budget: 40000, services_needed: ["photography", "catering", "dj"],
};
const schedule = [
  { id: "dep", label: "Deposit", amount_cents: 100000, due_type: "on_signing", effective_due: "2020-01-01", marked_paid_at: null, confirmed_at: null },
  { id: "bal", label: "Balance", amount_cents: 150000, due_type: "before_event", effective_due: "2099-05-01", marked_paid_at: null, confirmed_at: null },
];

function mock(api: ApiMock) {
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/events", [EVENT]);
  api.get("/bundles", [
    mockBundleDetail({
      status: "sent",
      bookings: [
        mockBundleBooking({ booking_id: "bk-photo", vendor_name: "Lens & Light", contract_token: "tok-1", contract_status: "signed", signed_at: "2026-01-01T00:00:00Z", payment_schedule: schedule }),
        mockBundleBooking({ booking_id: "bk-cater", vendor_name: "Royal Caterers", service_category: "catering", service_name: "Grand menu", contract_token: "tok-2", contract_status: "sent" }),
      ],
    }),
  ]);
}

test("the Overview gives each vendor one status and one next step", async ({ page, api }) => {
  await loginAs(page, api);
  mock(api);
  await page.goto("event/?id=event-1");

  await expect(page.getByRole("heading", { level: 1, name: "Priya's Wedding" })).toBeVisible();
  await expect(page.getByText("May 22, 2099 – May 24, 2099 · Edison, NJ · 300 guests")).toBeVisible();

  const progress = page.getByRole("region", { name: "Booking progress" });
  const photo = progress.getByRole("listitem").filter({ hasText: "Lens & Light" });
  await expect(photo).toContainText("Booked");
  await expect(photo).toContainText("$1,000 overdue");
  await expect(photo.getByRole("button", { name: "Pay now" })).toBeVisible();
  const cater = progress.getByRole("listitem").filter({ hasText: "Royal Caterers" });
  await expect(cater).toContainText("Contract ready");

  // DJ was asked for and nothing covers it.
  await expect(progress.getByRole("link", { name: "Find vendor" })).toHaveAttribute("href", /marketplace\/?\?category=dj$/);
  await expect(page.getByRole("region", { name: "Budget snapshot" })).toContainText("$40,000");

  // Review opens the contract as it stands now.
  await cater.getByRole("button", { name: "Review" }).click();
  await expect(page).toHaveURL(/\/contract\/?\?id=bk-cater$/);
});

test("Pay now opens the vendor's payments, and a payment can be marked sent", async ({ page, api }) => {
  await loginAs(page, api);
  mock(api);
  const contract = { booking_id: "bk-photo", signed_at: "2026-01-01T00:00:00Z", payment_schedule: schedule, vendor_venmo_handle: "@lensandlight", vendor_zelle_contact: null };
  api.get("/guest-bookings/tok-1", contract);
  api.post("/guest-bookings/tok-1/payments/dep/mark-paid", ({}: HandlerArgs) => ({
    ...contract,
    payment_schedule: [{ ...schedule[0], marked_paid_at: "2026-02-01T00:00:00Z" }, schedule[1]],
  }));
  await page.goto("event/?id=event-1");

  await page.getByRole("button", { name: "Pay now" }).click();
  const drawer = page.getByRole("dialog", { name: "Lens & Light" });
  await expect(drawer.getByRole("list", { name: "Progress" }).locator('[aria-current="step"]')).toContainText("Signed");
  await expect(drawer.getByText("@lensandlight")).toBeVisible();
  await drawer.getByRole("button", { name: /sent/i }).first().click();
  await expect.poll(() => api.requestsTo("POST", "/guest-bookings/tok-1/payments/dep/mark-paid").length).toBe(1);
  await expect(drawer.getByRole("link", { name: "Manage this booking in your plan" })).toHaveAttribute("href", /bundle\/?\?id=bundle-1$/);
});

test("Edit event saves, and a refused delete says why", async ({ page, api }) => {
  await loginAs(page, api);
  mock(api);
  api.patch("/events/event-1", ({ route }: HandlerArgs) => ({ ...EVENT, ...route.request().postDataJSON() }));
  api.error("DELETE", "/events/event-1", 400, "This celebration still has 1 plan on it. Delete that first.");
  await page.goto("event/?id=event-1");

  await page.getByRole("button", { name: "Edit event" }).click();
  const drawer = page.getByRole("dialog", { name: "Edit event" });
  await drawer.getByRole("button", { name: "Delete event" }).click();
  await drawer.getByRole("button", { name: "Delete event" }).click();
  await expect(drawer.getByRole("alert")).toContainText("still has 1 plan on it");

  await drawer.getByLabel("Guests").fill("320");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await expect(drawer).toHaveCount(0);
  const [call] = api.requestsTo("PATCH", "/events/event-1");
  expect(call.body).toMatchObject({ guest_count: 320, date_end: "2099-05-24" });
});

test("an event with nothing on it yet offers suggestions for its open slots", async ({ page, api }) => {
  await loginAs(page, api);
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/events", [EVENT]);
  api.get("/bundles", []);
  await page.goto("event/?id=event-1");

  await expect(page.getByText("No vendors added yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Suggest vendors" })).toHaveAttribute("href", /plan\/?\?event_id=event-1/);
});
