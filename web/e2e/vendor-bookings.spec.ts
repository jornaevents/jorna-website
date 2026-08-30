import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockStripeStatus, mockVendorBooking, mockVendorDetail } from "./support/mock-data";

test.describe("vendor bookings (/my-bookings)", () => {
  test("accepting a pending request notifies the client can now pay", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [mockVendorBooking({ status: "pending" })],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.get(`/payments/vendors/${vendor.vendor_id}/stripe-status`, mockStripeStatus({
      stripe_account_id: "acct_1",
      stripe_onboarding_complete: true,
    }));
    api.put("/bookings/:id/status", {});

    await page.goto("my-bookings/");
    await expect(page.getByText("Priya Shah")).toBeVisible();

    await page.getByRole("button", { name: "Accept", exact: true }).click();

    await expect(
      page.getByText("Accepted. The client can pay now — the money is held until after the event."),
    ).toBeVisible();
    const putCalls = api.requestsTo("PUT", "/bookings/vbooking-1/status");
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].body).toMatchObject({ status: "approved" });
  });

  test("declining a request requires confirmation before it's sent", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [mockVendorBooking({ status: "pending" })],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.get(`/payments/vendors/${vendor.vendor_id}/stripe-status`, mockStripeStatus());
    api.put("/bookings/:id/status", {});

    await page.goto("my-bookings/");
    await page.getByRole("button", { name: "Decline" }).click();

    // First click only opens the confirmation — nothing sent yet.
    await expect(page.getByText(/Decline this request\?/)).toBeVisible();
    expect(api.requestsTo("PUT", "/bookings/vbooking-1/status")).toHaveLength(0);

    await page.getByRole("button", { name: "Decline", exact: true }).click();

    await expect(page.getByText("Declined.")).toBeVisible();
    const putCalls = api.requestsTo("PUT", "/bookings/vbooking-1/status");
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].body).toMatchObject({ status: "rejected" });
  });

  test("warns that accepting won't pay out yet when Stripe isn't set up", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [mockVendorBooking({ status: "pending" })],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.get(`/payments/vendors/${vendor.vendor_id}/stripe-status`, mockStripeStatus());

    await page.goto("my-bookings/");

    await expect(page.getByText(/Accepting won.t pay out yet/)).toBeVisible();
  });
});
