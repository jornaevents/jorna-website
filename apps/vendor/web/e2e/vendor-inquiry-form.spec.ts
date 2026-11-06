import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// The public inquiry form from the vendor's side (backend DECISIONS #32):
// sharing it from Leads, and what an inquiry from it looks like there.

const FORM_LEAD = {
  id: "lead:inq1",
  source: "lead",
  stage: "inquiry",
  booking_id: null,
  lead_id: "inq1",
  conversation_id: null,
  name: "Neha Patel",
  email: "neha@example.com",
  phone: "(732) 555-0100",
  event_name: "Sangeet",
  event_date: "2027-05-14",
  event_date_end: null,
  location: null,
  service_name: null,
  estimated_value_cents: null,
  contract_status: null,
  hold_expires_at: null,
  attention: "needs_you",
  attention_reason: "new_lead",
  archived: false,
  outcome: null,
  note: "Looking for sangeet coverage in Edison.",
  lead_status: "new",
  lead_source: "inquiry_form",
  guest_count: 180,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function mockLeads(api: ApiMock, items: unknown[] = [FORM_LEAD]) {
  api.get("/vendors/me", mockVendorDetail());
  api.get("/leads/pipeline", {
    items,
    counts: { inquiries: items.length, negotiations: 0, needs_you: items.length, waiting: 0, archived: 0 },
  });
}

test.describe("inquiry form (vendor side)", () => {
  test("New shares the form as a link and a QR code", async ({ page, context, api }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loginAs(page, api);
    mockLeads(api, []);

    await page.goto("leads/");
    await expect(page.getByText(/Share your inquiry form from New to get your first one/)).toBeVisible();
    // Its own header button is gone; it's the New menu's first choice here.
    await expect(page.getByRole("button", { name: "Share your inquiry form" })).toHaveCount(0);
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: /Share inquiry form/ }).click();

    const drawer = page.getByRole("dialog");
    const link = drawer.getByLabel("Link");
    await expect(link).toHaveValue(/\/client\/inquire\/\?vendor=vendor-1$/);
    await drawer.getByRole("button", { name: "Copy" }).click();
    await expect(drawer.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/client\/inquire\/\?vendor=vendor-1$/);

    await expect(drawer.getByRole("img", { name: "QR code for your inquiry form" })).toHaveAttribute("src", /^data:image\/png/);
    await expect(drawer.getByRole("link", { name: "Download QR code" })).toHaveAttribute("download", "jorna-inquiry-form-qr.png");
  });

  test("an inquiry from the form says where it came from, and offers a reply by email", async ({ page, api }) => {
    await loginAs(page, api);
    mockLeads(api);

    await page.goto("leads/");
    const list = page.getByRole("region", { name: "Pipeline" });
    await expect(list.getByText("Sangeet")).toBeVisible();
    await list.getByRole("button", { name: /Neha Patel/ }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("From your inquiry form")).toBeVisible();
    await expect(drawer.getByText("What they wrote")).toBeVisible();
    await expect(drawer.getByText("Looking for sangeet coverage in Edison.")).toBeVisible();
    await expect(drawer.getByText("180")).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Reply by email" })).toHaveAttribute("href", "mailto:neha@example.com");
    await expect(drawer.getByRole("link", { name: "Create contract" })).toHaveAttribute("href", /\/contracts\/new\/?\?lead=inq1/);
  });
});
