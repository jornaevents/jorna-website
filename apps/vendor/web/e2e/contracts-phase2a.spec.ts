import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Phase 2a: a sent contract holds its date only for a while. The vendor sees
// whether the client opened it and until when the date is held, can resend a
// lapsed one, and the client can see the hold, find an expired offer
// explained, or decline.
test.describe("contracts — Phase 2a (offers and holds)", () => {
  const guestBooking = (overrides: Record<string, unknown> = {}) => ({
    booking_id: "c-1",
    vendor_display_name: "Arjun Kapoor",
    service_name: "Reception set",
    status: "approved",
    contract_status: "viewed",
    hold_expires_at: "2030-05-08T12:00:00",
    date_iso: "2030-06-01",
    time_start: "18:00",
    time_end: "22:00",
    location: "TBD",
    amount_cents: 100000,
    signed_at: null,
    payment_status: "unpaid",
    ...overrides,
  });

  test("an expired offer can be resent, and a live one shows its hold", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    const contract = (overrides: Record<string, unknown>) =>
      mockVendorBooking({ user_id: null, client_name: null, status: "approved", ...overrides });
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        contract({
          booking_id: "c-old",
          contract_token: "tok-old",
          guest_name: "Anita Shah",
          contract_status: "expired",
          hold_expires_at: "2030-05-01T12:00:00",
        }),
        contract({
          booking_id: "c-live",
          contract_token: "tok-live",
          guest_name: "Rohan Das",
          contract_status: "viewed",
          viewed_at: "2030-05-02T12:00:00",
          hold_expires_at: "2030-05-09T12:00:00",
        }),
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });
    api.post("/contracts/c-old/send", {
      booking_id: "c-old",
      contract_status: "sent",
      hold_expires_at: "2030-05-15T12:00:00",
    });

    await page.goto("contracts/");
    await expect(page.getByText(/hold ended .* — date released/)).toBeVisible();
    await expect(page.getByText(/Opened .* · date held until/)).toBeVisible();
    await expect(page.getByRole("link", { name: "View as client" }).first()).toHaveAttribute(
      "href",
      /preview=1/,
    );

    await page.getByRole("button", { name: "Resend & hold date" }).click();
    await expect(page.getByText(/date released/)).toHaveCount(0);
    expect(api.requestsTo("POST", "/contracts/c-old/send")).toHaveLength(1);
  });

  test("the client sees the hold, and can decline with a note", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", guestBooking());
    api.post("/guest-bookings/tok-1/decline", guestBooking({ status: "rejected", contract_status: "declined" }));

    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByText(/Arjun Kapoor is holding this date for you until/)).toBeVisible();

    await page.getByRole("button", { name: /Not going ahead/ }).click();
    await page.getByLabel(/Anything you'd like/).fill("Went with a friend");
    await page.getByRole("button", { name: "Decline this offer" }).click();

    await expect(page.getByRole("heading", { name: "You turned this offer down" })).toBeVisible();
    const [call] = api.requestsTo("POST", "/guest-bookings/tok-1/decline");
    expect(call.body).toEqual({ reason: "Went with a friend" });
  });

  test("an expired offer tells the client to ask for a resend", async ({ page, api }) => {
    api.get("/guest-bookings/tok-2", guestBooking({ contract_status: "expired" }));

    await page.goto("booking-link/?t=tok-2");
    await expect(page.getByRole("heading", { name: "This offer has expired" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign the contract/ })).toHaveCount(0);
  });

  test("the vendor's preview doesn't count as the client opening it", async ({ page, api }) => {
    api.get("/guest-bookings/tok-3", guestBooking());

    await page.goto("booking-link/?t=tok-3&preview=1");
    await expect(page.getByText(/Preview — this is what your client sees/)).toBeVisible();
    // Every step is there to look at, and walking them saves nothing.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue to the contract" }).click();
    expect(api.requestsTo("PATCH", "/guest-bookings/tok-3")).toHaveLength(0);
    await page.getByRole("navigation", { name: "Steps" }).getByRole("button", { name: /Sign/ }).click();
    await expect(page.getByRole("button", { name: /Sign the contract/ })).toBeDisabled();
  });
});
