import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockBundleDetail, mockBundleOption } from "./support/mock-data";

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
});
