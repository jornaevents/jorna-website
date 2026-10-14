import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Phase 4: accepting a signed-in client's marketplace request with a
// proposal written in the builder (?request=). The request's when and where
// are the client's — shown, not edited — and it's sent to /propose.
test.describe("contracts — Phase 4 (requests become proposals)", () => {
  test("accepts a request from the builder with the vendor's own terms", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail({ default_deposit_percent: 25 });
    api.get("/vendors/me", vendor);
    api.get("/services", {
      items: [{ service_id: "service-1", vendor_id: vendor.vendor_id, name: "Full Day Wedding Photography", price: 2500, add_ons: [] }],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.get("/contract-templates", { items: [], total: 0 });
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          status: "pending",
          service_id: "service-1",
          price: 2500,
          price_pending_quantity: false,
          date_iso: "2030-06-01",
          time_start: "10:00",
          time_end: "18:00",
          location: "Pines Manor",
          client_note: "Can you do a first look?",
        }),
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.post("/bookings/vbooking-1/propose", {
      booking_id: "vbooking-1",
      contract_token: "tok-9",
      contract_status: "sent",
      status: "approved",
      guest_email: "priya@example.com",
      hold_expires_at: "2030-05-08T12:00:00",
      email_sent: true,
    });

    await page.goto("contracts/new/?request=vbooking-1");
    await expect(page.getByRole("heading", { name: /Accept Priya Shah/ })).toBeVisible();

    // Starts with the requested package at the request's total.
    await expect(page.getByLabel("Item", { exact: true })).toHaveValue("Full Day Wedding Photography");
    await expect(page.getByLabel(/^Price/)).toHaveValue("2500");
    await page.getByRole("button", { name: "+ Add a custom item" }).click();
    await page.getByLabel("Item", { exact: true }).last().fill("Second shooter");
    await page.getByLabel(/^Price/).last().fill("500");

    // The client's date is shown, not editable.
    await expect(page.getByText("“Can you do a first look?”")).toBeVisible();
    await expect(page.getByLabel("Start time")).toHaveCount(0);

    // The plan follows the total until the vendor edits it.
    await expect(page.getByLabel("Amount ($)").first()).toHaveValue("750");
    await expect(page.getByRole("button", { name: "Save as draft" })).toHaveCount(0);
    await page.getByRole("button", { name: "Accept & send contract" }).click();

    await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
    const [call] = api.requestsTo("POST", "/bookings/vbooking-1/propose");
    expect(call.body).toMatchObject({
      line_items: [
        { kind: "package", service_id: "service-1", unit_price_cents: 250000, quantity: 1 },
        { kind: "custom", name: "Second shooter", unit_price_cents: 50000 },
      ],
      payment_schedule: [{ amount_cents: 75000 }, { amount_cents: 225000 }],
      email_client: true,
    });
    expect(call.body).not.toHaveProperty("date_iso");
  });

  test("an already-answered request can't be accepted again from the builder", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    // A vendor with no packages is sent to the setup wizard, so this one has one.
    api.get("/services", {
      items: [{ service_id: "svc-1", vendor_id: vendor.vendor_id, name: "Reception set", price: 1400, add_ons: [] }],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.get("/contract-templates", { items: [], total: 0 });
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [mockVendorBooking({ status: "approved", contract_token: "tok" })],
      total: 1,
      limit: 100,
      offset: 0,
    });

    await page.goto("contracts/new/?request=vbooking-1");
    await expect(page.getByText(/can't be accepted from here any more/)).toBeVisible();
  });
});
