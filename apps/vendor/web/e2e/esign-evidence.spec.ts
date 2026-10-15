import { test, expect, pastLinkSteps, toSigning } from "./support/fixtures";

// Signing by link (backend DECISIONS #27): the client asks for a code by
// email, enters it, ticks the e-records consent in the backend's own words,
// and only then can sign. An older backend sends no consent text, and the
// page signs with the name alone, as before.
test.describe("signing evidence", () => {
  const consent = {
    version: "2026-10-v1",
    text: "I agree to sign this agreement electronically and to receive it and related records electronically.",
  };
  const guestBooking = (overrides: Record<string, unknown> = {}) => ({
    booking_id: "c-1",
    vendor_display_name: "Arjun Kapoor",
    service_name: "Reception set",
    status: "approved",
    contract_status: "viewed",
    date_iso: "2030-06-01",
    time_start: "18:00",
    time_end: "22:00",
    location: "TBD",
    amount_cents: 100000,
    signed_at: null,
    payment_status: "unpaid",
    guest_name: "Priya Mehta",
    guest_email: "priya@example.com",
    revision: 3,
    esign_consent: consent,
    signing_code_required: true,
    ...overrides,
  });

  test("the client signs with an emailed code and the consent box", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", guestBooking());
    api.patch("/guest-bookings/tok-1", guestBooking());
    api.post("/guest-bookings/tok-1/signing-code", { sent_to: "p••••@example.com", expires_in_minutes: 10 });
    api.post(
      "/guest-bookings/tok-1/sign",
      guestBooking({ signed_at: "2030-05-02T12:00:00Z", signer_name: "Priya Mehta", contract_status: "signed" }),
    );

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await toSigning(page);
    await page.getByPlaceholder("Type your full name to sign").fill("Priya Mehta");
    const confirm = page.getByRole("button", { name: /Confirm booking/ });
    await expect(confirm).toBeDisabled();

    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText(/We sent a 6-digit code to p••••@example.com/)).toBeVisible();
    // The email was given at the link's first step; signing doesn't save it again.
    expect(api.requestsTo("PATCH", "/guest-bookings/tok-1")).toHaveLength(0);

    // A pasted "123 456" still reads as the code.
    await page.getByLabel("6-digit code").fill("123 456");
    await expect(page.getByLabel("6-digit code")).toHaveValue("123456");
    await expect(confirm).toBeDisabled();
    await page.getByRole("checkbox", { name: /I agree to sign this agreement electronically/ }).check();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText(/Signed by/).first()).toBeVisible();
    const [call] = api.requestsTo("POST", "/guest-bookings/tok-1/sign");
    expect(call.body).toEqual({
      signer_name: "Priya Mehta",
      revision: 3,
      code: "123456",
      consent: true,
      consent_version: "2026-10-v1",
    });
  });

  test("a failed send says why", async ({ page, api }) => {
    api.get("/guest-bookings/tok-2", guestBooking());
    api.patch("/guest-bookings/tok-2", guestBooking());
    api.error("POST", "/guest-bookings/tok-2/signing-code", 502, "We couldn't send the code. Check your email address and try again");

    await pastLinkSteps(page, "tok-2");
    await page.goto("booking-link/?t=tok-2");
    await toSigning(page);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText("We couldn't send the code. Check your email address and try again")).toBeVisible();
  });

  test("an older backend signs with the name alone", async ({ page, api }) => {
    api.get("/guest-bookings/tok-3", guestBooking({ esign_consent: undefined, signing_code_required: undefined }));
    api.patch("/guest-bookings/tok-3", guestBooking());

    await pastLinkSteps(page, "tok-3");
    await page.goto("booking-link/?t=tok-3");
    await toSigning(page);
    await expect(page.getByRole("button", { name: "Email me a code" })).toHaveCount(0);
    await page.getByPlaceholder("Type your full name to sign").fill("Priya Mehta");
    await expect(page.getByRole("button", { name: /Confirm booking/ })).toBeEnabled();
  });

  test("an addendum signs with its own code", async ({ page, api }) => {
    const doc = {
      document_id: "d-1",
      booking_id: "c-1",
      kind: "addendum",
      title: "Later finish",
      sections: [{ key: "s1", title: "New finish time", body: "The reception now ends at midnight." }],
      status: "viewed",
      signed_at: null,
      signer_name: null,
      signed_snapshot_sha256: null,
      vendor_display_name: "Arjun Kapoor",
      client_name: "Priya Mehta",
      date_iso: "2030-06-01",
      location: "Pines Manor",
      esign_consent: consent,
      signing_code_required: true,
    };
    api.get("/guest-documents/dtok-1", doc);
    api.post("/guest-documents/dtok-1/signing-code", { sent_to: "p••••@example.com", expires_in_minutes: 10 });
    api.post("/guest-documents/dtok-1/sign", { ...doc, status: "signed", signer_name: "Priya Mehta", signed_at: "2030-05-02T12:00:00Z" });

    await page.goto("booking-link/?d=dtok-1");
    await toSigning(page);
    await page.getByPlaceholder("Type your full name to sign").fill("Priya Mehta");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await page.getByLabel("6-digit code").fill("654321");
    await page.getByRole("checkbox", { name: /I agree to sign/ }).check();
    await page.getByRole("button", { name: /Sign the service addendum/ }).click();
    await expect(page.getByText(/Signed by Priya Mehta/)).toBeVisible();

    const [call] = api.requestsTo("POST", "/guest-documents/dtok-1/sign");
    expect(call.body).toEqual({ signer_name: "Priya Mehta", code: "654321", consent: true, consent_version: "2026-10-v1" });
  });
});
