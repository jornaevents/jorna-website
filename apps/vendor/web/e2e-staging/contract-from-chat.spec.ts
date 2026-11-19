import { test, expect } from "@playwright/test";
import { CLIENT, api, configured, ensureVendor, farDate, signInPage } from "./support/staging";

// Contract Builder from Chat on the real staging stack (Step 0, version 1,
// version 2): a client who only asked a question is sent the inquiry form,
// sends it, proposes a detail the vendor agrees to, and the vendor's Send
// contract opens a contract already filled in from the inquiry, with the
// chat's details beside it.
//
// The inquiry form can be asked for once per chat (has_inquiry), so every run
// makes a client of its own, confirmed with staging's test code.

test.describe("staging: contract from chat", () => {
  test.beforeAll(() => {
    const missing = configured();
    test.skip(Boolean(missing), `Staging checks not configured: ${missing}`);
    test.skip(!process.env.STAGING_E2E_SIGNING_CODE, "Set STAGING_E2E_SIGNING_CODE to confirm the run's client");
  });

  test("question → inquiry form → inquiry → agreed detail → contract filled in", async ({ page }) => {
    test.setTimeout(180_000);
    const vendor = await ensureVendor();
    const vendorToken = vendor.tokens.access_token;

    // A client of this run's own.
    const stamp = Date.now();
    const email = `e2e-staging-cfc-${stamp}@example.com`;
    await api("/auth/register", {
      method: "POST",
      body: { email, password: CLIENT.password, f_name: "Meera", l_name: `Check${stamp % 10000}`, accept_terms: true, side: "client" },
    });
    const client = await api<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: { identifier: email, password: CLIENT.password },
    });
    const clientToken = client.access_token;
    await api("/auth/email/verify", { method: "POST", token: clientToken, body: { code: process.env.STAGING_E2E_SIGNING_CODE } });

    // 1. Only a question so far.
    const thread = await api<{ conversation_id: string }>("/conversations/enquiry", {
      method: "POST",
      token: clientToken,
      body: { vendor_id: vendor.vendorId, content: "Staging check: are you free for a sangeet?" },
    });
    const conv = thread.conversation_id;
    const before = await api<{ has_inquiry?: boolean }>(`/conversations/${conv}`, { token: vendorToken });
    expect(before.has_inquiry).toBe(false);

    // 2. The vendor sends the inquiry form from Messages.
    await signInPage(page, vendor.tokens);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`messages/?id=${conv}`);
    const details = page.getByRole("complementary", { name: "Details" });
    await expect(details.getByRole("link", { name: "Send contract" })).toHaveCount(0);
    await details.getByRole("button", { name: "Send inquiry form" }).click();
    await expect(details.getByRole("button", { name: "Inquiry form sent" })).toBeVisible();

    const asked = await api<{ items: { kind?: string }[] }>(`/conversations/${conv}/messages?limit=50`, { token: clientToken });
    expect(asked.items.some((m) => m.kind === "inquiry_request")).toBe(true);

    // 3. The client sends the inquiry: package, a city-only place, times, a note.
    const date = farDate();
    const sent = await api<{ conversation_id: string }>(`/vendors/${vendor.vendorId}/inquiries`, {
      method: "POST",
      token: clientToken,
      body: {
        event_date_iso: date, event_type: "Sangeet", location_kind: "city", location_city: "Edison", location_state: "NJ",
        service_id: vendor.serviceId, guest_count: 180, time_start: "16:00", time_end: "22:00",
        note: "Staging check: a mix of Bollywood and Punjabi, please.",
      },
    });
    expect(sent.conversation_id).toBe(conv);
    const after = await api<{ has_inquiry?: boolean }>(`/conversations/${conv}`, { token: vendorToken });
    expect(after.has_inquiry).toBe(true);

    // 4. In chat: a detail said, and one proposed for the vendor to agree to.
    await api(`/conversations/${conv}/messages`, {
      method: "POST",
      token: clientToken,
      body: { content: "Could we do 6 hours, and is $100 off possible?" },
    });
    await api(`/conversations/${conv}/details`, { method: "POST", token: clientToken, body: { field: "guests", value: "150" } });

    await page.reload();
    await page.getByRole("button", { name: "Agree" }).click();
    await expect(page.getByText("Agreed", { exact: true })).toBeVisible();

    // 5. Send contract now opens a contract built from the inquiry.
    await expect(details.getByRole("link", { name: "Send contract" })).toBeVisible({ timeout: 20_000 });
    await details.getByRole("link", { name: "Send contract" }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]package=${vendor.serviceId}`));
    await expect(page.getByRole("button", { name: "Remove Staging check package" })).toBeVisible();
    await expect(page.getByLabel("City")).toHaveValue("Edison");
    await expect(page.getByLabel("Start time — hour")).toHaveValue("4");
    const note = page.getByRole("note");
    await expect(note.getByText(/inquiry$/)).toBeVisible();
    await expect(note.getByText("Staging check: a mix of Bollywood and Punjabi, please.")).toBeVisible();
    await expect(page.getByLabel("Guest count (optional)")).toHaveValue("180");

    // The chat's details beside it, the agreed one first.
    await page.getByText(/details? mentioned in chat/).click();
    const list = page.getByRole("list", { name: "Mentioned in chat" });
    await expect(list.getByText("Agreed in chat")).toBeVisible();
    await expect(list.getByText("Discount:", { exact: false })).toBeVisible();
    await list.getByRole("button", { name: "Use 150 guests" }).click();
    await expect(page.getByLabel("Guest count (optional)")).toHaveValue("150");
  });
});
