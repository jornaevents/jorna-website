import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockBundleBooking, mockBundleDetail, mockBundleOption } from "./support/mock-data";

test.describe("bundle builder (/plan)", () => {
  test("requires at least one category before building, and makes no request without one", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    await page.goto("plan/");

    await page.getByRole("button", { name: "Build my bundles" }).click();

    await expect(page.getByText("Pick at least one category to include.")).toBeVisible();
    expect(api.requestsTo("POST", "/chatbot/bundles")).toHaveLength(0);
  });

  test("builds bundles and choosing one opens it on /bundle", async ({ page, api }) => {
    await loginAs(page, api);
    const option = mockBundleOption({ bundle_id: "bundle-1", label: "Balanced" });
    api.post("/chatbot/bundles", { options: [option] });
    api.get("/bundles/:id", mockBundleDetail({ bundle_id: "bundle-1" }));
    // Fire-and-forget calls the bundle page makes alongside getBundle (see
    // the header comment in app/bundle/page.tsx) — all are caught silently on
    // failure, but mocking them keeps the run free of noisy 404s.
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);

    await page.goto("plan/");
    await page.getByRole("button", { name: "Select all" }).click();
    await page.getByRole("button", { name: "Build my bundles" }).click();

    await expect(page.getByRole("heading", { name: "Balanced" })).toBeVisible();
    await page.getByRole("button", { name: "Choose this bundle" }).click();
    await page.getByRole("button", { name: "Yes, choose this" }).click();

    await expect(page).toHaveURL(/\/app\/bundle\/?\?id=bundle-1/);
    await expect(page.getByText("Priya's Wedding")).toBeVisible();
  });
});

test.describe("bundle detail (/bundle)", () => {
  test("paying an approved booking redirects to Stripe Checkout", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/bundles/:id", mockBundleDetail());
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);
    api.post("/payments/bookings/:id/checkout-session", {
      checkout_url: "https://checkout.stripe.com/mock-session",
    });
    // The real destination is an external domain; fulfilling it locally
    // instead of letting the navigation actually leave localhost keeps the
    // test hermetic while still proving the redirect happened.
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Mock Stripe Checkout</h1>" }),
    );

    await page.goto("bundle/?id=bundle-1");
    await expect(page.getByRole("heading", { name: "Priya's Wedding" })).toBeVisible();

    await page.getByRole("button", { name: /^Pay \$/ }).click();

    await expect(page).toHaveURL("https://checkout.stripe.com/mock-session");
    const checkoutCalls = api.requestsTo("POST", "/payments/bookings/booking-1/checkout-session");
    expect(checkoutCalls).toHaveLength(1);
  });

  test("cancelling within the grace period refunds in full", async ({ page, api }) => {
    await loginAs(page, api);
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({
            payment_status: "paid",
            refund_preview: {
              full_refund_until: new Date(Date.now() + 20 * 3600 * 1000).toISOString(),
              vendor_pct_now: 0,
              client_refund_now_cents: 250000,
            },
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);
    api.post("/payments/bookings/:id/cancel", {
      message: "Cancelled. Refunded in full.",
      refund_cents: 250000,
      vendor_cancellation_cents: 0,
      payment_status: "refunded",
    });

    await page.goto("bundle/?id=bundle-1");
    await expect(page.getByText("Full refund available for another")).toBeVisible();

    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText(/refunded \$2,500 in full/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm cancellation" }).click();

    await expect(page.getByText(/refunded in full/)).toBeVisible();
    expect(api.requestsTo("POST", "/payments/bookings/booking-1/cancel")).toHaveLength(1);
  });

  test("cancelling past the grace period pays the vendor their share instead", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({
            payment_status: "paid",
            refund_preview: {
              full_refund_until: new Date(Date.now() - 3600 * 1000).toISOString(),
              vendor_pct_now: 50,
              client_refund_now_cents: 0,
            },
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);
    api.post("/payments/bookings/:id/cancel", {
      message: "Cancelled. Nothing refunded.",
      refund_cents: 0,
      vendor_cancellation_cents: 125000,
      payment_status: "cancelled",
    });

    await page.goto("bundle/?id=bundle-1");
    await expect(
      page.getByText("Cancelling now: 50% goes to Anjali Kapoor, nothing back to you"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText(/nothing is refunded to you/)).toBeVisible();
    await page.getByRole("button", { name: "Confirm cancellation" }).click();

    await expect(page.getByText(/Nothing was refunded/)).toBeVisible();
    expect(api.requestsTo("POST", "/payments/bookings/booking-1/cancel")).toHaveLength(1);
  });

  test("a manual-track booking shows Venmo/Zelle details and can be marked paid", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({
            payment_method: "manual",
            payment_status: "unpaid",
            vendor_venmo_handle: "@studio-anjali",
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);
    api.post("/payments/bookings/:id/mark-paid", {
      message: "Marked as paid.",
      payment_status: "marked_paid",
    });

    await page.goto("bundle/?id=bundle-1");
    await expect(page.getByText("Anjali Kapoor is paid directly, not through Jorna.")).toBeVisible();
    await expect(page.getByText("@studio-anjali")).toBeVisible();

    await page.getByRole("button", { name: "I sent payment" }).click();

    await expect(page.getByText(/Marked as paid/)).toBeVisible();
    expect(api.requestsTo("POST", "/payments/bookings/booking-1/mark-paid")).toHaveLength(1);
  });

  test("cancelling a manual-track booking shows no refund math", async ({ page, api }) => {
    await loginAs(page, api);
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({
            payment_method: "manual",
            payment_status: "confirmed_paid",
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);
    api.post("/payments/bookings/:id/cancel", {
      message: "Cancelled.",
      refund_cents: 0,
      vendor_cancellation_cents: 0,
      payment_status: "confirmed_paid",
    });

    await page.goto("bundle/?id=bundle-1");
    await page.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText(/Jorna doesn't hold or refund it/)).toBeVisible();
    await expect(page.getByText(/% goes to/)).not.toBeVisible();

    await page.getByRole("button", { name: "Confirm cancellation" }).click();

    await expect(page.getByText(/Jorna doesn't hold or refund it/)).toBeVisible();
    expect(api.requestsTo("POST", "/payments/bookings/booking-1/cancel")).toHaveLength(1);
  });

  test("a live counter-offer from the vendor is visible without clicking Negotiate", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.get(
      "/bundles/:id",
      // Bundle-level status must not be "draft" — isDraftBundle() falls back
      // to the bookings themselves in that case, and negotiation_ongoing
      // doesn't count as vendor contact there, which would wrongly force
      // draft=true and mask the negotiation panel behind an unrelated gate.
      mockBundleDetail({
        status: "sent",
        bookings: [
          mockBundleBooking({
            status: "negotiation_ongoing",
            open_to_price_negotiation: true,
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);
    api.get("/negotiations/booking/:id", {
      negotiation_id: "neg-1",
      booking_id: "booking-1",
      status: "open",
      current_offer_cents: 220000,
      // The vendor made the current offer, not the logged-in client — so
      // NegotiationPanel's mineIsCurrent is false and the response buttons
      // (not a "waiting on them" message) are what should render.
      proposed_by: "vendor-1",
      proposed_by_name: "Anjali Kapoor",
      offers: [
        { amount_cents: 220000, proposed_by: "vendor-1", proposed_by_name: "Anjali Kapoor" },
      ],
    });

    await page.goto("bundle/?id=bundle-1");
    await expect(page.getByRole("heading", { name: "Priya's Wedding" })).toBeVisible();

    // The regression: this used to require clicking "Negotiate price" first,
    // and the button/panel were hidden outright while status was
    // negotiation_ongoing — so the client never saw a live vendor offer at all.
    await expect(page.getByText("Current offer")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Accept \$2,200/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Counter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Negotiate price" })).not.toBeVisible();
  });
});
