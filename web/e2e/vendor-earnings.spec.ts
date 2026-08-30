import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockEarnings, mockStripeStatus, mockVendorDetail } from "./support/mock-data";

test.describe("vendor earnings (/my-earnings)", () => {
  test("prompts a non-vendor to create a profile first", async ({ page, api }) => {
    await loginAs(page, api);
    api.error("GET", "/vendors/me", 404, "Not a vendor");

    await page.goto("my-earnings/");

    await expect(page.getByRole("heading", { name: "You're not selling on Jorna yet" })).toBeVisible();
  });

  test("gates payouts until Stripe onboarding is finished, then redirects to it", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/payments/vendors/${vendor.vendor_id}/stripe-status`, mockStripeStatus());
    api.get(`/payments/vendors/${vendor.vendor_id}/earnings`, mockEarnings());
    api.post(`/payments/vendors/${vendor.vendor_id}/stripe-onboard`, {
      onboarding_url: "https://connect.stripe.com/mock-onboarding",
    });
    await page.route("https://connect.stripe.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Mock Stripe Connect</h1>" }),
    );

    await page.goto("my-earnings/");

    await expect(page.getByRole("heading", { name: "Set up payments" })).toBeVisible();
    await expect(
      page.getByText(/Clients can't pay you until Stripe has your details/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Set up payments" }).click();

    await expect(page).toHaveURL("https://connect.stripe.com/mock-onboarding");
  });

  test("shows a ready vendor their earnings once payments are set up", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(
      `/payments/vendors/${vendor.vendor_id}/stripe-status`,
      mockStripeStatus({ stripe_account_id: "acct_1", stripe_onboarding_complete: true }),
    );
    api.get(`/payments/vendors/${vendor.vendor_id}/earnings`, mockEarnings());

    await page.goto("my-earnings/");

    await expect(
      page.getByText("Payments are set up — you're ready to be booked and paid."),
    ).toBeVisible();
    await expect(page.getByText("$5,000")).toBeVisible(); // total_released_cents
    await expect(page.getByText("$2,500")).toBeVisible(); // in_escrow_cents
  });
});
