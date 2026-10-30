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

    await expect(page).toHaveURL(/\/client\/bundle\/?\?id=bundle-1/);
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

    // Regression: the Stripe "Pay" button used to render right alongside
    // this — the backend has no Stripe account for a manual-track vendor,
    // so clicking it always 400'd instead of ever being a real second way
    // to pay.
    await expect(page.getByRole("button", { name: /^Pay \$/ })).not.toBeVisible();

    await page.getByRole("button", { name: "I sent payment" }).click();

    await expect(page.getByText(/Marked as paid/)).toBeVisible();
    expect(api.requestsTo("POST", "/payments/bookings/booking-1/mark-paid")).toHaveLength(1);
  });

  test("an accepted request asks for a signature before any payment", async ({ page, api }) => {
    await loginAs(page, api);
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({
            payment_method: "manual",
            payment_status: "unpaid",
            vendor_venmo_handle: "@studio-anjali",
            contract_token: "tok-1",
            contract_status: "sent",
            signed_at: null,
            hold_expires_at: "2030-05-08T12:00:00",
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);

    await page.goto("bundle/?id=bundle-1");
    await expect(page.getByText(/accepted — review and sign the contract/)).toBeVisible();
    await expect(page.getByText("Contract to review")).toBeVisible();
    await expect(page.getByRole("link", { name: "Review & sign" })).toHaveAttribute(
      "href",
      "https://jornaevents.com/app/booking-link/?t=tok-1",
    );
    // Nothing is owed until it's signed.
    await expect(page.getByRole("button", { name: "I sent payment" })).toHaveCount(0);
  });

  const schedule = [
    {
      id: "dep",
      label: "Deposit",
      amount_cents: 30_000,
      due_type: "on_signing",
      effective_due: "2030-03-01",
      marked_paid_at: "2030-03-01T10:00:00+00:00",
      confirmed_at: "2030-03-02T10:00:00+00:00",
    },
    {
      id: "bal",
      label: "Final balance",
      amount_cents: 70_050,
      due_type: "before_event",
      due_days: 14,
      effective_due: "2099-04-17",
      marked_paid_at: null,
      confirmed_at: null,
    },
  ];

  test("a signed contract's payments are marked one at a time", async ({ page, api }) => {
    await loginAs(page, api);
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({
            payment_method: "manual",
            payment_status: "unpaid",
            contract_token: "tok-1",
            contract_status: "signed",
            signed_at: "2030-03-01T09:00:00+00:00",
            payment_schedule: schedule,
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);
    api.post("/guest-bookings/:token/payments/:id/mark-paid", {});

    await page.goto("bundle/?id=bundle-1");
    await expect(page.getByText(/^Received by /)).toBeVisible();
    await expect(page.getByText("$700.50")).toBeVisible();
    // One button per payment still owed — not one that marks the lot.
    await expect(page.getByRole("button", { name: "I sent payment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "I sent this" })).toHaveCount(1);
    // A signed contract is a record: nothing here deletes it.
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Swap package" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View contract" })).toHaveAttribute("href", /contract\/?\?t=tok-1/);

    await page.getByRole("button", { name: "I sent this" }).click();

    await expect(page.getByText(/Marked “Final balance” as sent/)).toBeVisible();
    expect(api.requestsTo("POST", "/guest-bookings/tok-1/payments/bal/mark-paid")).toHaveLength(1);
    expect(api.requestsTo("POST", "/payments/bookings/booking-1/mark-paid")).toHaveLength(0);
  });

  test("the contract page shows what was signed", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/guest-bookings/:token", {
      booking_id: "booking-1",
      vendor_display_name: "Anjali Studio",
      vendor_venmo_handle: "@studio-anjali",
      service_name: "Wedding photography",
      date_iso: "2099-05-01",
      time_start: "16:00",
      time_end: "23:00",
      location: "Pines Manor, Edison NJ",
      amount_cents: 100_050,
      line_items: [
        { id: "l1", kind: "package", name: "Full day", unit_price_cents: 90_050, quantity: 1, total_cents: 90_050 },
        { id: "l2", kind: "addon", name: "Second shooter", unit_price_cents: 5_000, quantity: 2, total_cents: 10_000 },
      ],
      payment_schedule: schedule,
      terms_clauses: [{ key: "travel", title: "Travel", body: "30 miles included." }],
      signer_name: "Priya Mehta",
      signed_at: "2030-03-01T09:00:00+00:00",
      signed_snapshot_sha256: "ab12cd34",
      contract_status: "signed",
      status: "approved",
    });

    await page.goto("contract/?t=tok-1");
    await expect(page.getByRole("heading", { name: "Wedding photography" })).toBeVisible();
    await expect(page.getByText("Second shooter")).toBeVisible();
    await expect(page.getByText("$1,000.50")).toBeVisible();
    await expect(page.getByText("30 miles included.")).toBeVisible();
    await expect(page.getByText("Priya Mehta")).toBeVisible();
    await expect(page.getByText("ab12cd34")).toBeVisible();
    await expect(page.getByRole("button", { name: "I sent this" })).toHaveCount(1);
    // Deposit confirmed, event ahead: the same stage the vendor's Bookings shows.
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  });

  test("a negotiation shows on the card, with Propose changes beside Review & sign", async ({ page, api }) => {
    await loginAs(page, api);
    const unsigned = {
      payment_method: "manual",
      contract_status: "viewed",
      signed_at: null,
      date_iso: "2099-05-01",
    };
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({ ...unsigned, booking_id: "b-open", service_name: "Mehndi", contract_token: "tok-open", proposal_status: "open" }),
          mockBundleBooking({ ...unsigned, booking_id: "b-new", service_name: "Live Dhol", contract_token: "tok-new", proposal_status: "revised" }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);

    await page.goto("bundle/?id=bundle-1");
    await expect(page.getByText("Changes proposed", { exact: true })).toBeVisible();
    await expect(page.getByText("New version to review", { exact: true })).toBeVisible();
    await expect(page.getByText(/sent a new version — see what changed, then sign/)).toBeVisible();
    // One "Propose changes": not on the card whose proposal is still open.
    const propose = page.getByRole("link", { name: "Propose changes" });
    await expect(propose).toHaveCount(1);
    await expect(propose).toHaveAttribute("href", "https://jornaevents.com/app/booking-link/?t=tok-new&propose=1");
    await expect(page.getByRole("link", { name: "Review & sign" })).toHaveCount(2);
  });

  test("each booking card names its stage, the way the vendor's app does", async ({ page, api }) => {
    await loginAs(page, api);
    const unconfirmed = schedule.map((i) => ({ ...i, marked_paid_at: null, confirmed_at: null }));
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({ booking_id: "b-req", service_name: "Mehndi", status: "pending" }),
          mockBundleBooking({
            booking_id: "b-dep",
            service_name: "Live Dhol",
            payment_method: "manual",
            contract_token: "tok-dep",
            contract_status: "signed",
            signed_at: "2030-03-01T09:00:00+00:00",
            date_iso: "2099-05-01",
            payment_schedule: unconfirmed,
          }),
          mockBundleBooking({
            booking_id: "b-done",
            service_name: "Catering",
            payment_method: "manual",
            contract_token: "tok-done",
            contract_status: "signed",
            signed_at: "2020-03-01T09:00:00+00:00",
            date_iso: "2020-05-01",
            payment_schedule: unconfirmed,
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);

    await page.goto("bundle/?id=bundle-1");
    await expect(page.getByText("Requested — awaiting the vendor")).toBeVisible();
    await expect(page.getByText("Signed · deposit due")).toBeVisible();
    // A past event is Completed whatever is still owed on it.
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
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

  test("a per-performer booking's missing performer count shows up in Required Info", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    api.get(
      "/bundles/:id",
      mockBundleDetail({
        bookings: [
          mockBundleBooking({
            price_unit: "performer",
            service_name: "Bhangra Dance Troupe",
            location: "123 Main St, Springfield, IL 62704",
          }),
        ],
      }),
    );
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations", []);
    api.get("/payments/card", null);
    api.patch("/bookings/:id", { booking_id: "booking-1" });

    await page.goto("bundle/?id=bundle-1");
    // mockBundleBooking's default status ("approved") already counts as
    // vendor contact, so this reads as a sent plan ("Still needed"), not a
    // draft still being assembled ("Required Info").
    await expect(page.getByRole("heading", { name: "Still needed" })).toBeVisible();

    // Regression: this field didn't exist at all, so a plan priced per
    // performer could never be completed from the one card meant to collect
    // everything still missing before Send.
    await expect(
      page.getByText("Anjali Kapoor can't act on this until it has a performer count."),
    ).toBeVisible();
    await page.getByLabel("Performer count").fill("6");
    await expect(page.getByText("Saved")).toBeVisible();

    const patchCalls = api.requestsTo("PATCH", "/bookings/booking-1");
    expect(patchCalls.at(-1)?.body).toMatchObject({ performer_count: 6 });
  });
});
