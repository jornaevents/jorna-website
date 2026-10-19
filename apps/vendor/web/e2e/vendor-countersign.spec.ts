import { test, expect, loginAs, pastLinkSteps } from "./support/fixtures";

// The vendor countersigns after the client (backend DECISIONS #34): a
// contract the client signed waits on the vendor, who signs it — with the
// e-records consent the first time — or declines with a reason. The client's
// link says it's waiting, and why if the vendor said no.
test.describe("vendor countersignature", () => {
  const contract = (overrides: Record<string, unknown> = {}) => ({
    booking_id: "c-1",
    vendor_id: "vendor-1",
    service_id: "svc-1",
    date_iso: "2030-06-01",
    date_end: null,
    time_start: "18:00",
    time_end: "22:00",
    location: "Pines Manor",
    amount_cents: 140000,
    guest_name: "Meera Iyer",
    guest_email: "meera@example.com",
    signer_name: "Meera Iyer",
    client_signed_at: "2030-01-02T10:00:00Z",
    signed_at: null,
    status: "approved",
    contract_status: "awaiting_vendor",
    contract_token: "tok-1",
    line_items: [],
    payment_schedule: [],
    timeline: [{ at: "2030-01-02T10:00:00Z", kind: "signed", actor: "client", detail: { signer_name: "Meera Iyer" } }],
    vendor_esign_consent: { version: "2026-10-v1", text: "I agree to sign electronically.", given: false },
    ...overrides,
  });

  test("the vendor signs a contract the client signed, giving consent the first time", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/contracts/c-1", contract());
    api.get("/contracts/c-1/documents", { items: [], total: 0 });
    api.post("/contracts/c-1/countersign", contract({ contract_status: "signed", signed_at: "2030-01-03T10:00:00Z" }));

    await page.goto("contracts/view/?id=c-1");
    await expect(page.getByText("Meera Iyer signed the contract on")).toBeVisible();
    // Nothing can change once the client has signed.
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Void" })).toHaveCount(0);

    await page.getByRole("button", { name: "Sign", exact: true }).click();
    await page.getByLabel("Your full legal name").fill("Arjun Rao");
    const sign = page.getByRole("button", { name: "Sign", exact: true });
    await expect(sign).toBeDisabled();
    await page.getByText("I agree to sign electronically.").click();
    await sign.click();

    await expect(page.getByText(/Signed\. It's booked/)).toBeVisible();
    expect(api.requestsTo("POST", "/contracts/c-1/countersign")[0].body).toEqual({
      signer_name: "Arjun Rao",
      consent: true,
      consent_version: "2026-10-v1",
    });
  });

  test("declining to sign needs a reason", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/contracts/c-1", contract({ vendor_esign_consent: { version: "v", text: "t", given: true } }));
    api.get("/contracts/c-1/documents", { items: [], total: 0 });
    api.post("/contracts/c-1/decline-signature", contract({ status: "rejected", contract_status: "voided" }));

    await page.goto("contracts/view/?id=c-1");
    await page.getByRole("button", { name: "Don't sign" }).click();
    const confirm = page.getByRole("button", { name: "Don't sign" });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Why you're not signing").fill("No longer free that night.");
    await confirm.click();

    await expect(page.getByText("Not signed. We've told Meera Iyer why.")).toBeVisible();
    expect(api.requestsTo("POST", "/contracts/c-1/decline-signature")[0].body).toEqual({
      reason: "No longer free that night.",
    });
  });

  const guest = (overrides: Record<string, unknown> = {}) => ({
    booking_id: "c-1",
    vendor_display_name: "Priya Lens",
    service_name: "Wedding photography",
    status: "approved",
    contract_status: "awaiting_vendor",
    date_iso: "2030-06-25",
    date_end: null,
    time_start: "10:00",
    time_end: "22:00",
    location: "Pines Manor, Edison NJ",
    guest_count: 180,
    amount_cents: 600000,
    signer_name: "Asha Mehta",
    client_signed_at: "2030-05-02T12:00:00Z",
    signed_at: null,
    payment_status: "unpaid",
    guest_name: "Asha Mehta",
    guest_email: "asha@example.com",
    ...overrides,
  });

  test("the client's link waits on the vendor, then says why if they didn't sign", async ({ page, api }) => {
    await pastLinkSteps(page, "tok-1");
    api.get("/guest-bookings/tok-1", guest());
    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByRole("heading", { name: "Waiting for Priya Lens to sign" })).toBeVisible();
    await expect(page.getByText("Nothing is due until Priya Lens has signed.")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign/i })).toHaveCount(0);

    api.get(
      "/guest-bookings/tok-1",
      guest({
        status: "rejected",
        contract_status: "voided",
        rejected_reason: "vendor_declined_signature",
        vendor_decline_note: "We're double-booked, sorry.",
      }),
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: "Priya Lens didn't sign this" })).toBeVisible();
    await expect(page.getByText("They said: “We're double-booked, sorry.”")).toBeVisible();
  });
});
