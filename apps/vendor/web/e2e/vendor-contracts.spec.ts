import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// /contracts — the list of every contract a vendor has sent. Status wording
// comes from vendorPlan's contractStatus (unit-tested there); this covers the
// page's own logic: only contract bookings show, needs-you sorts first and
// filters, and the share link is recoverable after the fact.
test.describe("vendor contracts list (/contracts)", () => {
  const contract = (overrides: Record<string, unknown>) =>
    mockVendorBooking({
      user_id: null,
      client_name: null,
      is_guest_booking: true,
      status: "approved",
      amount_cents: 250000,
      ...overrides,
    });

  test("lists contracts by status and lets the vendor copy a share link", async ({
    page,
    api,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        contract({ booking_id: "c-unsigned", contract_token: "tok-unsigned", date_iso: "2026-10-01" }),
        contract({
          booking_id: "c-deposit",
          contract_token: "tok-deposit",
          guest_name: "Meera Iyer",
          signed_at: "2026-09-01T12:00:00Z",
          signer_name: "Meera Iyer",
          deposit_percent: 25,
          deposit_amount_cents: 62500,
          deposit_marked_paid_at: "2026-09-02T12:00:00Z",
          date_iso: "2026-12-01",
        }),
        // An ordinary marketplace booking — not a contract, must not show.
        mockVendorBooking({ booking_id: "b-market", client_name: "Priya Shah" }),
      ],
      total: 3,
      limit: 100,
      offset: 0,
    });

    await page.goto("contracts/");

    await expect(page.getByRole("heading", { name: "Contracts", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Start from scratch/ })).toHaveAttribute("href", /\/app\/contracts\/new\/?\?scratch=1$/);
    await expect(page.getByText("Priya Shah")).not.toBeVisible();

    // Needs-you sorts ahead of a contract still with the client.
    const rows = page.getByRole("region", { name: "Document library" }).locator("li");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Meera Iyer");
    await expect(rows.first().getByRole("link", { name: "Confirm deposit" })).toHaveAttribute(
      "href",
      "/app/my-bookings/?id=c-deposit",
    );
    await expect(rows.nth(1)).toContainText("Sent");
    // Sent or signed opens read-only.
    await expect(rows.nth(1).getByRole("link").first()).toHaveAttribute("href", /contracts\/view\/?\?id=c-unsigned/);

    await page.getByRole("tab", { name: /Waiting on client/ }).click();
    await expect(page.getByText("Meera Iyer")).not.toBeVisible();
    await expect(rows).toHaveCount(1);

    await rows.first().getByRole("button", { name: "Copy link" }).click();
    await expect(rows.first().getByRole("button", { name: "Copied!" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/app\/booking-link\?t=tok-unsigned$/);
  });

  test("shows an empty state pointing at the new-contract form", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });

    await page.goto("contracts/");

    await expect(page.getByRole("link", { name: "Create your first contract" })).toHaveAttribute(
      "href",
      "/app/contracts/new/",
    );
  });
});
