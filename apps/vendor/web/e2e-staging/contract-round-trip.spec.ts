import { test, expect } from "@playwright/test";
import { CLIENT, api, configured, ensureVendor, farDate, signIn, signInPage } from "./support/staging";

// The contract round trip on the real staging stack: the vendor sends a
// contract, the client opens their link, asks for a change if this staging
// negotiates field by field (backend DECISIONS #26), the vendor accepts it,
// the client signs, and the vendor sees it signed. Each run uses a fresh
// date years out, so its hold never gets in another run's way.

test.describe("staging: contract round trip", () => {
  test.beforeAll(() => {
    const missing = configured();
    test.skip(Boolean(missing), `Staging checks not configured: ${missing}`);
  });

  test("send → (negotiate) → sign, end to end", async ({ page }) => {
    const vendor = await ensureVendor();
    await signIn(CLIENT); // the client's account exists, as a returning client's would
    const token = vendor.tokens.access_token;

    const contract = await api<{ booking_id: string; contract_token: string }>("/contracts", {
      method: "POST",
      token,
      body: {
        service_id: vendor.serviceId,
        date_iso: farDate(),
        time_start: "18:00",
        time_end: "22:00",
        amount_cents: 120_000,
        deposit_percent: 25,
        guest_name: `${CLIENT.f_name} ${CLIENT.l_name}`,
        guest_email: CLIENT.email,
        location: "Pines Manor, Edison NJ",
        email_client: false,
      },
    });

    // The client's link: no account needed to read it.
    await page.goto(`booking-link/?t=${contract.contract_token}`);
    await expect(page.getByRole("heading", { name: /sent you a contract/ })).toBeVisible();
    // The link's steps: the vendor's email and name for the client are kept.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue to the contract" }).click();

    const fields = await api<{ round: number } | null>(`/guest-bookings/${contract.contract_token}/negotiation`).catch(() => null);
    if (fields) {
      // Field by field: ask for a guest count, the vendor accepts it.
      await page.getByRole("button", { name: "Ask for changes" }).click();
      await page.getByText("Change something else").click();
      const panel = page.getByRole("complementary", { name: "Your answers" });
      await panel.getByText("Guest count", { exact: true }).locator("..").getByRole("button", { name: "Change" }).click();
      await panel.getByLabel("Guest count").fill("150");
      await page.getByRole("button", { name: "Send 1 change" }).click();
      await expect(page.getByText(/It's .*'s turn/)).toBeVisible();

      const state = await api<{ round: number }>(`/contracts/${contract.booking_id}/negotiation`, { token });
      await api(`/contracts/${contract.booking_id}/negotiation/send`, {
        method: "POST",
        token,
        body: { base_round: state.round, answers: [{ key: "event.guests", action: "accept" }] },
      });
      await page.reload();
      await expect(page.getByText(/Everything in the contract below is agreed/)).toBeVisible();
    }

    // Sign.
    await page.getByRole("button", { name: "Looks good — sign it" }).click();
    await page.getByPlaceholder("Type your full name to sign").fill(`${CLIENT.f_name} ${CLIENT.l_name}`);
    // The emailed code and consent box (backend DECISIONS #27). The suite
    // can't read email, so it enters staging's SIGNING_TEST_CODE.
    const emailCode = page.getByRole("button", { name: "Email me a code" });
    if (await emailCode.isVisible()) {
      const code = process.env.STAGING_E2E_SIGNING_CODE;
      test.skip(!code, "Set STAGING_E2E_SIGNING_CODE (staging's SIGNING_TEST_CODE) to sign");
      await emailCode.click();
      await page.getByLabel("6-digit code").fill(code!);
      await page.getByRole("checkbox", { name: /I agree to sign this agreement electronically/ }).check();
    }
    await page.getByRole("button", { name: "Confirm booking →" }).click();
    await expect(page.getByText(/Signed by/)).toBeVisible({ timeout: 20_000 });

    const signed = await api<{ signed_at: string | null; guest_count: number | null }>(`/contracts/${contract.booking_id}`, { token });
    expect(signed.signed_at).toBeTruthy();
    if (fields) expect(signed.guest_count).toBe(150);

    // And the vendor sees it signed on their contract page.
    await signInPage(page, vendor.tokens);
    await page.goto(`contracts/view/?id=${contract.booking_id}`);
    await expect(page.getByText(/Signed/).first()).toBeVisible();
  });
});
