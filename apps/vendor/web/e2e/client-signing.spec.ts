import { test, expect, loginAs, pastLinkSteps, toSigning } from "./support/fixtures";

// The client's contract page (#169, #154): the signature is checked against
// the name on the contract, set terms can't be changed on the form, and the
// page says what it means — before and after signing.
test.describe("client signing page", () => {
  const today = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lastMonth = iso(new Date(today.getFullYear(), today.getMonth() - 1, 8));

  const booking = (overrides: Record<string, unknown> = {}) => ({
    booking_id: "c-1",
    vendor_display_name: "Priya Lens",
    service_name: "Wedding photography",
    status: "approved",
    contract_status: "viewed",
    date_iso: "2030-06-25",
    date_end: "2030-06-27",
    time_start: "10:00",
    time_end: "22:00",
    location: "Pines Manor, Edison NJ",
    guest_count: 180,
    amount_cents: 600000,
    signed_at: null,
    payment_status: "unpaid",
    guest_name: "Asha Mehta",
    guest_email: "asha@example.com",
    revision: 2,
    cancellation_window_hours: 720,
    terms_clauses: [{ key: "cancellation", title: "Cancellation", body: "Deposits are non-refundable." }],
    ...overrides,
  });

  test("a different name warns but still signs", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", booking());
    api.patch("/guest-bookings/tok-1", booking());
    api.post("/guest-bookings/tok-1/sign", booking({ signed_at: "2030-05-02T12:00:00Z", signer_name: "Bob Smith" }));

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await toSigning(page);
    const name = page.getByPlaceholder("Type your full name to sign");
    await name.fill("Asha R. Mehta");
    await expect(page.getByText(/doesn't match the name on the contract/)).toHaveCount(0);
    await name.fill("Bob Smith");
    await expect(
      page.getByText("This doesn't match the name on the contract (Asha Mehta). You can still sign — Priya Lens will see the difference."),
    ).toBeVisible();
    await page.getByRole("button", { name: /Sign the contract/ }).click();
    await expect(page.getByRole("heading", { name: "You signed with Priya Lens" })).toBeVisible();
  });

  test("a venue and guest count the vendor set are read-only", async ({ page, api }) => {
    api.get("/guest-bookings/tok-2", booking());
    api.patch("/guest-bookings/tok-2", booking());
    api.post("/guest-bookings/tok-2/sign", booking({ signed_at: "2030-05-02T12:00:00Z", signer_name: "Asha Mehta" }));

    await page.goto("booking-link/?t=tok-2");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Street address")).toHaveCount(0);
    await expect(page.getByLabel("Guest count")).toHaveCount(0);
    await expect(page.getByText(/These are part of the contract\./)).toBeVisible();

    await page.getByRole("button", { name: "Continue to the contract" }).click();
    await expect.poll(() => api.requestsTo("PATCH", "/guest-bookings/tok-2").length).toBe(1);
    const [saved] = api.requestsTo("PATCH", "/guest-bookings/tok-2");
    expect(saved.body).toMatchObject({ location: null, guest_count: null });
  });

  test("a venue left blank can be filled in", async ({ page, api }) => {
    api.get("/guest-bookings/tok-3", booking({ location: "TBD", guest_count: null }));
    api.patch("/guest-bookings/tok-3", booking());

    await page.goto("booking-link/?t=tok-3");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Street address").fill("12 Maple Ave");
    await page.getByLabel("City", { exact: true }).fill("Evanston");
    await page.getByLabel("State", { exact: true }).selectOption("IL");
    await page.getByLabel("ZIP code").fill("60201");
    await page.getByLabel("Guest count").fill("120");
    await page.getByRole("button", { name: "Continue to the contract" }).click();
    await expect.poll(() => api.requestsTo("PATCH", "/guest-bookings/tok-3").length).toBe(1);
    expect(api.requestsTo("PATCH", "/guest-bookings/tok-3")[0].body).toMatchObject({
      location: "12 Maple Ave, Evanston, IL 60201",
      guest_count: 120,
    });
  });

  test("the summary shows the whole date range and the venue, and says what's owed", async ({ page, api }) => {
    api.get(
      "/guest-bookings/tok-4",
      booking({
        payment_schedule: [
          { id: "p1", label: "Retainer", amount_cents: 150000, due_type: "date", due_date: lastMonth, due_days: null, due_on: lastMonth, marked_paid_at: null, confirmed_at: null },
          { id: "p2", label: "Balance", amount_cents: 450000, due_type: "days_before", due_date: null, due_days: 14, due_on: "2030-06-11", marked_paid_at: null, confirmed_at: null },
        ],
      }),
    );

    await pastLinkSteps(page, "tok-4");
    await page.goto("booking-link/?t=tok-4");
    await expect(page.getByRole("heading", { name: "Priya Lens sent you a contract" })).toBeVisible();
    await expect(page.getByText(/June 25, 2030 – .*June 27, 2030/).first()).toBeVisible();
    await expect(page.getByText("Pines Manor, Edison NJ").first()).toBeVisible();
    await expect(page.getByText(/^Overdue — was due/)).toBeVisible();
    // The vendor's own cancellation clause stands in for the generated line.
    await expect(page.getByText(/may forfeit the deposit/)).toHaveCount(0);
  });

  test("with nothing to list, there's no empty agreeing card", async ({ page, api }) => {
    api.get(
      "/guest-bookings/tok-5",
      booking({ cancellation_window_hours: null, terms_clauses: [], deposit_percent: 25, deposit_amount_cents: 150000,
        payment_schedule: [{ id: "p1", label: "Deposit", amount_cents: 150000, due_type: "on_signing", due_date: null, due_days: null, due_on: null, marked_paid_at: null, confirmed_at: null }] }),
    );
    await pastLinkSteps(page, "tok-5");
    await page.goto("booking-link/?t=tok-5");
    await expect(page.getByText(/sent you a contract/)).toBeVisible();
    await expect(page.getByText("What you're agreeing to")).toHaveCount(0);
  });

  test("the cancellation line says what's at stake the way the contract does", async ({ page, api }) => {
    api.get("/guest-bookings/tok-6", booking({ terms_clauses: [] }));
    await pastLinkSteps(page, "tok-6");
    await page.goto("booking-link/?t=tok-6");
    await expect(page.getByText(/Cancelling within 30 days of the event may forfeit what's been paid/)).toBeVisible();
  });

  test("after signing, the date isn't called secured until the deposit arrives", async ({ page, api }) => {
    api.get(
      "/guest-bookings/tok-7",
      booking({ signed_at: "2030-05-02T12:00:00Z", signer_name: "Asha Mehta", contract_status: "signed",
        deposit_percent: 25, deposit_amount_cents: 150000 }),
    );
    await page.goto("booking-link/?t=tok-7");
    await expect(page.getByRole("heading", { name: "You signed with Priya Lens" })).toBeVisible();
    await expect(page.getByText("Your date is secured once Priya Lens receives the $1,500.00 deposit.")).toBeVisible();
    await expect(page.getByText(/Signed by Asha Mehta on [A-Z][a-z]{2} \d/)).toBeVisible();
  });

  test("a signed-in visitor sees the wordmark only, not the site's navigation", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/guest-bookings/tok-8", booking());
    await page.goto("booking-link/?t=tok-8");
    await expect(page.getByText(/sent you a contract/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse vendors" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "How it works" })).toHaveCount(0);
  });

  const negotiation = (over: Record<string, unknown> = {}) => ({
    mode: "fields", side: "client", round: 1, turn: "client", revision: 2, locks: [], nudge: false,
    can_sign: true, waiting_count: 0, terms: {}, previous_terms: null, original_terms: {}, last_send: null, draft: null,
    fields: [],
    ...over,
  });
  const field = (key: string, state: string, proposed_by: string | null) => ({
    key, group: "event", label: key, value: 1, state, proposed: 2, proposed_by, round: 2,
  });

  test("round 1 doesn't call the contract agreed before the client has said anything", async ({ page, api }) => {
    api.get("/guest-bookings/tok-9", booking());
    api.get("/guest-bookings/tok-9/negotiation", negotiation());
    await pastLinkSteps(page, "tok-9");
    await page.goto("booking-link/?t=tok-9");
    await expect(page.getByText("Read the contract below. Sign it, or ask for a change.")).toBeVisible();
    await expect(page.getByText(/Everything in the contract below is agreed/)).toHaveCount(0);
  });

  test("signing as it is names only the side with open changes", async ({ page, api }) => {
    api.get("/guest-bookings/tok-10", booking());
    api.get(
      "/guest-bookings/tok-10/negotiation",
      negotiation({ round: 2, turn: "vendor", can_sign: false, waiting_count: 2,
        fields: [field("event.guests", "waiting_vendor", "client"), field("event.location", "waiting_vendor", "client")] }),
    );
    await pastLinkSteps(page, "tok-10");
    await page.goto("booking-link/?t=tok-10");
    await toSigning(page);
    await expect(
      page.getByText("Sign it as it is. Your 2 changes haven't been answered yet; signing drops them."),
    ).toBeVisible();
    await expect(page.getByText(/are taken|is taken/)).toHaveCount(0);
  });

  test("a link that never worked doesn't say it expired", async ({ page, api }) => {
    api.error("GET", "/guest-bookings/nope", 404, "Not found");
    await page.goto("booking-link/?t=nope");
    await expect(page.getByText("This link isn't valid. Check you copied all of it, or ask your vendor for a new one.")).toBeVisible();
  });
});
