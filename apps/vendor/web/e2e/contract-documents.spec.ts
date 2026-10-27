import { test, expect, toSigning } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorBooking, mockVendorDetail } from "./support/mock-data";
import type { HandlerArgs } from "./support/api-mock";

// Plan step 7b: the document-style contract editor (title and block order,
// backend 0067), and addenda / cancellation agreements attached to a signed
// booking (backend DECISIONS #21) — written by the vendor, signed by the
// couple on their own link.
test.describe("contract editor and attached documents (step 7b)", () => {
  const services = (vendorId: string) => ({
    items: [{ service_id: "svc-1", vendor_id: vendorId, name: "Reception set", price: 1400, add_ons: [] }],
    total: 1,
    limit: 100,
    offset: 0,
  });

  test("the editor sends its title and block order, and Copy link sends without email", async ({
    page,
    api,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loginAs(page, api);
    const vendor = mockVendorDetail({ f_name: "Sound", l_name: "Studio", default_deposit_percent: 25 });
    api.get("/vendors/me", vendor);
    api.get("/services", services(vendor.vendor_id));
    api.get("/contract-templates", { items: [], total: 0 });
    api.post("/contracts", {
      booking_id: "c-1",
      contract_token: "tok-1",
      status: "approved",
      contract_status: "sent",
      hold_expires_at: "2030-05-08T12:00:00",
    });

    await page.goto("contracts/new/?scratch=1");
    const doc = page.getByRole("article", { name: "Contract document" });
    await doc.getByLabel("Agreement title").fill("Wedding reception DJ agreement");
    await doc.getByLabel("Client name").fill("Meera Iyer");
    await doc.getByLabel("Date", { exact: true }).fill("2030-06-01");
    await doc.getByLabel("Start time").fill("18:00");
    await doc.getByLabel("End time").fill("22:00");
    await doc.getByLabel("Add a package").selectOption("svc-1");

    // The plan is drafted on the usual deposit and follows the total.
    await expect(doc.getByLabel("Amount ($)").first()).toHaveValue("350");
    await expect(page.getByTestId("rail-total")).toHaveText("$1,400.00");

    // A terms section, moved up above the payment schedule.
    await doc.getByRole("button", { name: "+ Meals" }).click();
    // Its ⋯ menu moves it (the arrows used to sit on every block).
    // Each section is named for its own title (2026-10-26).
    const meals = doc.getByRole("region", { name: "Meals" });
    await meals.hover();
    await meals.getByRole("button", { name: "Meals options" }).click();
    await meals.getByRole("menuitem", { name: "Move meals up" }).click();

    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("heading", { name: "Link copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("/app/booking-link?t=tok-1");

    const [call] = api.requestsTo("POST", "/contracts");
    expect(call.body).toMatchObject({
      document_title: "Wedding reception DJ agreement",
      draft: false,
      email_client: false,
      terms_clauses: [{ title: "Meals" }],
    });
    const layout = (call.body as { document_layout: { type: string; title?: string }[] }).document_layout;
    expect(layout.map((b) => b.type)).toEqual(["parties", "event", "items", "terms", "schedule", "signature"]);
    expect(layout[3]).toMatchObject({ title: "Meals" });
  });

  test("an addendum attaches to a signed booking and is sent as a link", async ({ page, api }) => {
    await loginAs(page, api);
    const vendor = mockVendorDetail({ f_name: "Sound", l_name: "Studio" });
    api.get("/vendors/me", vendor);
    api.get("/contract-templates", { items: [], total: 0 });
    api.get(`/bookings/vendor/${vendor.vendor_id}`, {
      items: [
        mockVendorBooking({
          booking_id: "signed-1",
          user_id: null,
          guest_name: "Meera Iyer",
          guest_email: "meera@example.com",
          contract_token: "tok-s",
          signed_at: "2030-01-02T10:00:00",
          status: "approved",
          date_iso: "2030-06-01",
        }),
        mockVendorBooking({ booking_id: "unsigned-1", contract_token: "tok-u", signed_at: null, status: "approved" }),
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });
    api.post("/contracts/signed-1/documents", {
      document_id: "d-1",
      booking_id: "signed-1",
      kind: "addendum",
      title: "Later finish",
      sections: [],
      status: "sent",
      token: "dtok-1",
    });

    // From the gallery: pick which signed booking it's for.
    await page.goto("contracts/document/?kind=addendum");
    const list = page.getByRole("list", { name: "Signed bookings" });
    await expect(list.getByRole("button")).toHaveCount(1);
    await list.getByRole("button", { name: /Meera Iyer/ }).click();

    await expect(page.getByRole("heading", { name: "New service addendum" })).toBeVisible();
    await page.getByLabel("Document title").fill("Later finish");
    await page.getByLabel("Section text").first().fill("The reception now ends at midnight.");
    await page.getByLabel(/Email it to/).uncheck();
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Sent" })).toBeVisible();
    await expect(page.getByText("/app/booking-link?d=dtok-1")).toBeVisible();
    const [call] = api.requestsTo("POST", "/contracts/signed-1/documents");
    expect(call.body).toMatchObject({
      kind: "addendum",
      title: "Later finish",
      send: true,
      email_client: false,
      sections: [{ title: "What changes", body: "The reception now ends at midnight." }, { title: "Everything else stays the same" }],
    });
  });

  test("the couple reads and signs an addendum on its own link", async ({ page, api }) => {
    const base = {
      document_id: "d-1",
      booking_id: "signed-1",
      kind: "addendum",
      title: "Later finish",
      sections: [{ key: "s1", title: "What changes", body: "The reception now ends at midnight." }],
      status: "viewed",
      vendor_display_name: "Sound Studio",
      client_name: "Meera Iyer",
      date_iso: "2030-06-01",
      signed_at: null,
      signer_name: null,
      signed_snapshot_sha256: null,
    };
    api.get("/guest-documents/dtok-1", base);
    api.post("/guest-documents/dtok-1/sign", {
      ...base,
      status: "signed",
      signer_name: "Meera Iyer",
      signed_at: "2030-02-01T10:00:00",
      signed_snapshot_sha256: "abc123",
    });

    await page.goto("booking-link/?d=dtok-1");
    await expect(page.getByRole("heading", { name: "Later finish" })).toBeVisible();
    await expect(page.getByText("The reception now ends at midnight.")).toBeVisible();
    await expect(page.getByText(/doesn.t move any money/)).toBeVisible();

    await toSigning(page);
    await page.getByPlaceholder("Type your full name to sign").fill("Meera Iyer");
    await page.getByRole("button", { name: /Sign the service addendum/ }).click();

    await expect(page.getByText("Signed by Meera Iyer", { exact: false })).toBeVisible();
    await expect(page.getByText(/abc123/)).toBeVisible();
    expect(api.requestsTo("POST", "/guest-documents/dtok-1/sign")[0].body).toEqual({ signer_name: "Meera Iyer" });
    // The contract's own signing endpoints are never touched.
    expect(api.requestsTo("GET", "/guest-bookings/dtok-1")).toHaveLength(0);
  });

  test("a signed contract lists its documents and offers new ones", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/contracts/c-1", {
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
      signed_at: "2030-01-02T10:00:00",
      signer_name: "Meera Iyer",
      status: "approved",
      contract_status: "signed",
      contract_token: "tok-1",
      document_title: "Wedding reception DJ agreement",
      line_items: [],
      payment_schedule: [],
      timeline: [{ at: "2030-01-03T10:00:00", kind: "document_sent", actor: "vendor", detail: { title: "Later finish" } }],
    });
    api.get("/contracts/c-1/documents", {
      items: [
        { document_id: "d-1", booking_id: "c-1", kind: "addendum", title: "Later finish", sections: [], status: "sent", token: "dtok-1" },
      ],
      total: 1,
    });
    api.post("/contract-documents/d-1/void", { document_id: "d-1", status: "voided" });

    await page.goto("contracts/view/?id=c-1");
    await expect(page.getByText("Wedding reception DJ agreement")).toBeVisible();
    await expect(page.getByText("You sent “Later finish”")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add an addendum" })).toHaveAttribute(
      "href",
      /contracts\/document\/?\?kind=addendum&booking=c-1/,
    );
    await expect(page.getByText("Later finish", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Void", exact: true }).click();
    expect(api.requestsTo("POST", "/contract-documents/d-1/void")).toHaveLength(1);
  });
});

test.describe("PDF downloads", () => {
  test("the vendor saves a signed contract as the server names it", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/contracts/c-1", {
      booking_id: "c-1",
      date_iso: "2030-06-01",
      date_end: null,
      time_start: "18:00",
      time_end: "22:00",
      location: "Pines Manor",
      amount_cents: 140000,
      guest_name: "Meera Iyer",
      signed_at: "2030-01-02T10:00:00",
      status: "approved",
      contract_status: "signed",
      contract_token: "tok-1",
      line_items: [],
      payment_schedule: [],
      timeline: [],
    });
    api.get("/contracts/c-1/documents", { items: [], total: 0 });
    api.get("/contracts/c-1/pdf", async ({ route }: HandlerArgs) => {
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        // What the backend's CORS setup sends: the filename header is exposed
        // to scripts, or the save falls back to a generic name.
        headers: {
          "Content-Disposition": 'attachment; filename="reception-agreement-2030-06-01.pdf"',
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Disposition",
        },
        body: "%PDF-1.4 test",
      });
    });

    await page.goto("contracts/view/?id=c-1");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download signed PDF" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("reception-agreement-2030-06-01.pdf");
  });

  test("the couple's copy is a plain link on their signing page", async ({ page, api }) => {
    api.get("/guest-documents/dtok-2", {
      document_id: "d-2",
      kind: "cancellation",
      title: "Cancellation agreement",
      sections: [{ key: "s", title: "Cancellation", body: "Both parties agree to cancel." }],
      status: "signed",
      signer_name: "Meera Iyer",
      signed_at: "2030-02-01T10:00:00",
      vendor_display_name: "Sound Studio",
      date_iso: "2030-06-01",
    });
    await page.goto("booking-link/?d=dtok-2");
    await expect(page.getByRole("link", { name: "Download your signed copy (PDF)" })).toHaveAttribute(
      "href",
      /\/guest-documents\/dtok-2\/pdf$/,
    );
  });
});
