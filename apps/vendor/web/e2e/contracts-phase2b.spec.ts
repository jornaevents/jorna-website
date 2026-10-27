import { test, expect, pastLinkSteps, toSigning } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { HandlerArgs } from "./support/api-mock";

// Phase 2b: contracts as proposals. The vendor's contract page (items,
// payments, timeline, confirm a payment), editing an unsigned one, and the
// client's side — the payment plan and clauses, signing the version they
// read, and marking one payment sent.
test.describe("contracts — Phase 2b (proposals)", () => {
  const schedule = (over: Record<string, unknown>[] = []) =>
    [
      { id: "i1", label: "Deposit", amount_cents: 50000, due_type: "on_signing", due_date: null, due_days: null, due_on: null, marked_paid_at: null, confirmed_at: null },
      { id: "i2", label: "Final balance", amount_cents: 110000, due_type: "before_event", due_date: null, due_days: 14, due_on: "2030-05-18", marked_paid_at: null, confirmed_at: null },
    ].map((row, i) => ({ ...row, ...(over[i] ?? {}) }));

  const contract = (over: Record<string, unknown> = {}) => ({
    booking_id: "c-1",
    vendor_id: "vendor-1",
    service_id: "svc-1",
    service_name: "Reception set",
    date_iso: "2030-06-01",
    date_end: null,
    time_start: "18:00",
    time_end: "22:00",
    location: "Pines Manor",
    guest_count: null,
    amount_cents: 160000,
    subtotal_cents: 200000,
    discount_cents: 40000,
    line_items: [
      { id: "l1", kind: "package", service_id: "svc-1", addon_id: null, name: "Reception set", description: null, unit: "event", unit_price_cents: 140000, quantity: 1, total_cents: 140000 },
      { id: "l2", kind: "addon", service_id: "svc-1", addon_id: "x", name: "Extra hour", description: null, unit: "hour", unit_price_cents: 25000, quantity: 2, total_cents: 50000 },
      { id: "l3", kind: "custom", service_id: null, addon_id: null, name: "Uplighting", description: null, unit: "item", unit_price_cents: 5000, quantity: 2, total_cents: 10000 },
    ],
    payment_schedule: schedule(),
    terms_clauses: [{ key: "cancel", title: "Cancellation", body: "The deposit is non-refundable." }],
    revision: 1,
    signed_snapshot_sha256: null,
    deposit_percent: 31,
    deposit_amount_cents: 50000,
    cancellation_window_hours: null,
    overtime_rate_cents: null,
    addon_rate_cents: null,
    contract_terms: null,
    guest_name: "Priya Mehta",
    guest_email: "priya@example.com",
    guest_phone: null,
    signer_name: null,
    signed_at: null,
    status: "approved",
    payment_status: "unpaid",
    contract_status: "viewed",
    sent_at: "2030-05-01T12:00:00",
    viewed_at: "2030-05-02T12:00:00",
    hold_expires_at: "2030-05-08T12:00:00",
    declined_at: null,
    decline_reason: null,
    voided_at: null,
    contract_token: "tok-1",
    vendor_display_name: "Arjun Kapoor",
    timeline: [
      { at: "2030-05-01T12:00:00", kind: "created", actor: "vendor", detail: { draft: false } },
      { at: "2030-05-01T12:00:01", kind: "sent", actor: "vendor", detail: { hold_expires_at: "2030-05-08T12:00:00" } },
      { at: "2030-05-01T12:00:02", kind: "emailed", actor: "vendor", detail: { to: "priya@example.com" } },
      { at: "2030-05-02T12:00:00", kind: "viewed", actor: "client", detail: null },
      { at: "2030-05-15T12:00:00", kind: "payment_reminder", actor: "system", detail: { label: "Final balance", amount_cents: 110000, reminder: "upcoming", due_on: "2030-05-18" } },
    ],
    ...over,
  });

  test("the contract page shows the proposal and its timeline, and confirms a payment", async ({ page, api }) => {
    await loginAs(page, api);
    const signed = contract({
      signed_at: "2030-05-03T12:00:00",
      signer_name: "Priya Mehta",
      contract_status: "signed",
      payment_schedule: schedule([{ marked_paid_at: "2030-05-04T12:00:00" }]),
      signed_snapshot_sha256: "a".repeat(64),
    });
    api.get("/contracts/c-1", signed);
    api.post("/contracts/c-1/payments/i1/confirm", signed);

    await page.goto("contracts/view/?id=c-1");
    await expect(page.getByRole("heading", { name: "Priya Mehta" })).toBeVisible();
    await expect(page.getByText("Uplighting")).toBeVisible();
    await expect(page.getByText("−$400.00")).toBeVisible();
    await expect(page.getByText("Link emailed to priya@example.com")).toBeVisible();
    await expect(page.getByText("Your client opened it")).toBeVisible();
    await expect(page.getByText(/Reminded your client Final balance \(\$1,100\.00\) is due/)).toBeVisible();
    await expect(page.getByText(/fingerprint/)).toBeVisible();

    await expect(page.getByText("Client says it's sent")).toBeVisible();
    await page.getByRole("button", { name: "Confirm received" }).first().click();
    expect(api.requestsTo("POST", "/contracts/c-1/payments/i1/confirm")).toHaveLength(1);
    // Signed — nothing to edit or void.
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  });

  test("editing an unsigned contract sends the whole document back", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/services", {
      items: [{ service_id: "svc-1", vendor_id: "vendor-1", name: "Reception set", price: 1400, add_ons: [] }],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.get("/contract-templates", { items: [], total: 0 });
    api.get("/contracts/c-1", contract());
    api.patch("/contracts/c-1", contract({ revision: 2 }));

    await page.goto("contracts/new/?edit=c-1");
    await expect(page.getByRole("heading", { name: "Edit contract" })).toBeVisible();
    await page.locator("#discount").fill("300");
    await page.getByRole("button", { name: "Put the difference on the last payment" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(/contracts\/view\/?\?id=c-1/);
    const [call] = api.requestsTo("PATCH", "/contracts/c-1");
    expect(call.body).toMatchObject({
      discount_cents: 30000,
      payment_schedule: [{ amount_cents: 50000 }, { amount_cents: 120000 }],
      terms_clauses: [{ key: "cancel", title: "Cancellation" }],
    });
  });

  test("the client sees the plan and terms, and must sign the latest version", async ({ page, api }) => {
    const guest = (over: Record<string, unknown> = {}) => {
      const c = contract(over);
      return { ...c, payment_status: "unpaid", vendor_venmo_handle: "@arjun", vendor_zelle_contact: null };
    };
    let revision = 1;
    api.get("/guest-bookings/tok-1", () => guest({ revision }));
    api.patch("/guest-bookings/tok-1", guest());
    api.post("/guest-bookings/tok-1/sign", async ({ route }: HandlerArgs) => {
      const sent = JSON.parse(route.request().postData() ?? "{}");
      if (sent.revision !== 2) {
        revision = 2;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail: "Your vendor updated this contract after you opened it — review the latest version and sign again",
          }),
        });
        return undefined;
      }
      return guest({ signed_at: "2030-05-03T12:00:00", signer_name: "Priya Mehta", contract_status: "signed" });
    });

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByText("How you'll pay")).toBeVisible();
    await expect(page.getByText("Due when signed", { exact: true })).toBeVisible();
    await expect(page.getByText("The deposit is non-refundable.")).toBeVisible();
    await expect(page.getByText(/Extra hour · 2 ×/)).toBeVisible();

    await toSigning(page);
    await page.getByPlaceholder("Type your full name to sign").fill("Priya Mehta");
    await page.getByRole("button", { name: /Sign the contract/ }).click();
    await expect(page.getByText(/updated this contract after you opened it/)).toBeVisible();

    // The page reloaded version 2; signing again sends it.
    await page.getByRole("button", { name: /Sign the contract/ }).click();
    await expect(page.getByRole("heading", { name: /You signed with Arjun Kapoor/ })).toBeVisible();
    const signs = api.requestsTo("POST", "/guest-bookings/tok-1/sign");
    expect(signs.map((s) => (s.body as { revision: number }).revision)).toEqual([1, 2]);
  });

  test("after signing, the client marks one payment as sent", async ({ page, api }) => {
    const signed = {
      ...contract({ signed_at: "2030-05-03T12:00:00", signer_name: "Priya Mehta", contract_status: "signed" }),
      vendor_venmo_handle: "@arjun",
      vendor_zelle_contact: null,
    };
    api.get("/guest-bookings/tok-1", signed);
    api.post("/guest-bookings/tok-1/payments/i1/mark-paid", {
      ...signed,
      payment_schedule: schedule([{ marked_paid_at: "2030-05-04T12:00:00" }]),
    });

    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByText("Your payments")).toBeVisible();
    await page.getByRole("button", { name: "I've sent this" }).first().click();
    // Asked how: the vendor's own way first (only Venmo here), then Other.
    const how = page.getByRole("group", { name: "How did you send it?" });
    await expect(how.getByRole("button")).toHaveText(["Venmo", "Other"]);
    await how.getByRole("button", { name: "Venmo" }).click();
    await expect(page.getByText("Marked as sent — waiting for your vendor to confirm")).toBeVisible();
    const [marked] = api.requestsTo("POST", "/guest-bookings/tok-1/payments/i1/mark-paid");
    expect(marked.body).toEqual({ paid_via: "venmo" });
    await expect(page.getByRole("button", { name: "I've paid in full" })).toHaveCount(0);
  });
});
