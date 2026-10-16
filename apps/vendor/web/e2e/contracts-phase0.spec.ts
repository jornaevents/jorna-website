import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockLead, mockVendorBooking, mockVendorDetail } from "./support/mock-data";

// Contract fixes from the booking-flow audit's Phase 0: per-unit packages
// no longer pre-fill their rate as the whole contract's total, a vendor can
// name the client and venue up front, a lead's "Set up booking" converts
// that lead, an unsigned contract can be voided (and its link says so), and
// a client's "Book this" leaves for the client app instead of 404ing.
test.describe("contracts — Phase 0", () => {
  const services = (vendorId: string) => ({
    items: [
      { service_id: "svc-flat", vendor_id: vendorId, name: "Reception set", price: 1400, price_unit: "event" },
      { service_id: "svc-pp", vendor_id: vendorId, name: "Chaat counter", price: 45, price_unit: "person" },
    ],
    total: 2,
    limit: 100,
    offset: 0,
  });

  test("a per-person package totals rate × guests, and client details are sent", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get("/services", services(vendor.vendor_id));
    api.get("/contract-templates", { items: [], total: 0 });
    api.post("/contracts", {
      booking_id: "c-1",
      contract_token: "tok-1",
      status: "approved",
      contract_status: "sent",
    });

    await page.goto("contracts/new/?scratch=1");
    await page.getByLabel("Client name").fill("Meera Iyer");
    await page.getByLabel("Client email").fill("meera@example.com");
    await page.getByLabel("Date", { exact: true }).fill("2030-06-01");
    await page.getByLabel("Start time").fill("18:00");
    await page.getByLabel("End time").fill("22:00");
    await page.getByLabel("Venue (optional)").fill("Pines Manor");

    // A per-person package is its rate times the head count, not the rate.
    await page.getByLabel("Add a package").selectOption("svc-pp");
    await expect(page.getByLabel("Price ($ per guest)")).toHaveValue("45");
    await page.getByLabel("Qty").fill("200");
    await expect(page.getByText("$9,000.00").first()).toBeVisible();

    await page.getByRole("button", { name: "Pay in full" }).click();
    await expect(page.getByTestId("rail-total")).toHaveText("$9,000.00");
    await page.getByLabel(/Email it to/).uncheck();
    await page.getByRole("button", { name: "Send & hold date" }).click();

    await expect(page.getByRole("heading", { name: "Send this link" })).toBeVisible();
    const [call] = api.requestsTo("POST", "/contracts");
    expect(call.body).toMatchObject({
      line_items: [{ kind: "package", service_id: "svc-pp", unit_price_cents: 4500, quantity: 200 }],
      payment_schedule: [{ amount_cents: 900000, due_type: "on_signing" }],
      guest_name: "Meera Iyer",
      guest_email: "meera@example.com",
      location: "Pines Manor",
      date_end: null,
      draft: false,
      email_client: false,
    });
  });

  test("setting up a booking from a lead pre-fills it and converts the lead", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get("/services", services(vendor.vendor_id));
    api.get("/contract-templates", { items: [], total: 0 });
    api.get("/leads", {
      items: [mockLead({ lead_id: "lead-9", name: "Rohan Das", email: "rohan@example.com" })],
      total: 1,
    });
    api.post("/leads/lead-9/convert", {
      booking_id: "c-2",
      contract_token: "tok-2",
      status: "approved",
      contract_status: "sent",
      guest_email: "rohan@example.com",
      email_sent: true,
    });

    await page.goto("contracts/new/?lead=lead-9&scratch=1");
    await expect(page.getByLabel("Client name")).toHaveValue("Rohan Das");
    await expect(page.getByLabel("Client email")).toHaveValue("rohan@example.com");

    await page.getByLabel("Date", { exact: true }).fill("2030-07-01");
    await page.getByLabel("Start time").fill("18:00");
    await page.getByLabel("End time").fill("22:00");
    // Adding the package drafts the usual payment plan — nothing more to set.
    await page.getByLabel("Add a package").selectOption("svc-flat");
    await page.getByRole("button", { name: "Send & hold date" }).click();

    await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible();
    expect(api.requestsTo("POST", "/leads/lead-9/convert")).toHaveLength(1);
    expect(api.requestsTo("POST", "/leads/lead-9/convert")[0].body).toMatchObject({ email_client: true });
    expect(api.requestsTo("POST", "/contracts")).toHaveLength(0);
  });

  test("when the email can't be sent, the vendor is told to share the link themselves", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get("/services", services(vendor.vendor_id));
    api.get("/contract-templates", { items: [], total: 0 });
    api.get("/leads", {
      items: [mockLead({ lead_id: "lead-9", name: "Rohan Das", email: "rohan@example.com" })],
      total: 1,
    });
    api.post("/leads/lead-9/convert", {
      booking_id: "c-2",
      contract_token: "tok-2",
      status: "approved",
      contract_status: "sent",
      guest_email: "rohan@example.com",
      email_sent: false,
    });

    await page.goto("contracts/new/?lead=lead-9&scratch=1");
    await expect(page.getByLabel("Client name")).toHaveValue("Rohan Das");
    await expect(page.getByLabel("Client email")).toHaveValue("rohan@example.com");

    await page.getByLabel("Date", { exact: true }).fill("2030-07-01");
    await page.getByLabel("Start time").fill("18:00");
    await page.getByLabel("End time").fill("22:00");
    // Adding the package drafts the usual payment plan — nothing more to set.
    await page.getByLabel("Add a package").selectOption("svc-flat");
    await page.getByRole("button", { name: "Send & hold date" }).click();

    await expect(page.getByRole("heading", { name: "Send this link" })).toBeVisible();
    await expect(page.getByText(/We couldn't email rohan@example.com/)).toBeVisible();
    await expect(page.getByText(/We emailed the link/)).toHaveCount(0);
    expect(api.requestsTo("POST", "/leads/lead-9/convert")).toHaveLength(1);
    expect(api.requestsTo("POST", "/leads/lead-9/convert")[0].body).toMatchObject({ email_client: true });
    expect(api.requestsTo("POST", "/contracts")).toHaveLength(0);
  });

  test("voiding an unsigned contract asks first, then marks it cancelled", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail();
    api.get("/vendors/me", vendor);
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "c-void",
          contract_token: "tok-void",
          user_id: null,
          client_name: null,
          guest_name: "Anita Shah",
          status: "approved",
          amount_cents: 120000,
        }),
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
    api.post("/contracts/c-void/void", { booking_id: "c-void", status: "rejected" });

    await page.goto("contracts/");
    await page.getByRole("button", { name: "Void", exact: true }).click();
    await expect(page.getByText("The link stops working")).toBeVisible();
    await page.getByRole("button", { name: "Void contract" }).click();

    await page.getByRole("tab", { name: /Declined & void/ }).click();
    const row = page.getByRole("region", { name: "Document library" }).locator("li").first();
    await expect(row).toContainText("Anita Shah");
    await expect(row).toContainText("Void");
    expect(api.requestsTo("POST", "/contracts/c-void/void")).toHaveLength(1);
  });

  test("a voided contract's link tells the client it was withdrawn", async ({ page, api }) => {
    api.get("/guest-bookings/tok-dead", {
      booking_id: "c-dead",
      vendor_display_name: "Arjun Kapoor",
      status: "rejected",
      date_iso: "2030-06-01",
      time_start: "18:00",
      time_end: "22:00",
      location: "TBD",
      amount_cents: 100000,
      signed_at: null,
      payment_status: "unpaid",
    });

    await page.goto("booking-link/?t=tok-dead");
    await expect(
      page.getByRole("heading", { name: "Arjun Kapoor withdrew this booking offer" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirm booking/ })).toHaveCount(0);
  });

  test("a client's Book this goes to the client app, not a 404 here", async ({ page, api }) => {
    const vendor = mockVendorDetail();
    api.get(`/vendors/${vendor.vendor_id}`, vendor);
    api.get("/services", services(vendor.vendor_id));
    api.get(`/reviews/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 20, offset: 0 });

    await page.goto(`vendor/?id=${vendor.vendor_id}`);
    const book = page.getByRole("link", { name: "Book this" }).first();
    await expect(book).toHaveAttribute(
      "href",
      "https://book.jornaevents.com/app/book?service=svc-flat",
    );
  });
});
