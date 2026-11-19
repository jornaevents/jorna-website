import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockLead, mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// Version 1 of Contract Builder from Chat: the contract starts from the
// client's inquiry, exactly — no guessing. The package they asked about, as
// much of the place as they gave, the event in the title, and their note.

test.use({ viewport: { width: 1440, height: 900 } });

function future(days = 200): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function mockEditor(api: ApiMock, lead: Record<string, unknown>) {
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  api.get("/services", {
    items: [
      { service_id: "svc-1", vendor_id: vendor.vendor_id, name: "Reception set", price: 1400, price_unit: "event", add_ons: [] },
      { service_id: "svc-2", vendor_id: vendor.vendor_id, name: "Sangeet night", price: 2200, price_unit: "event", add_ons: [] },
    ],
    total: 2,
    limit: 100,
    offset: 0,
  });
  api.get("/contract-templates", { items: [], total: 0 });
  api.get("/leads", { items: [mockLead({ lead_id: "lead-9", ...lead })], total: 1 });
  api.get("/conversations/c1", {
    conversation_id: "c1", subject_type: "enquiry", vendor_id: vendor.vendor_id, has_inquiry: true,
    members: [{ user_id: "user-1", name: "You" }, { user_id: "client-1", name: "Meera Patel" }],
  });
}

const INQUIRY = {
  name: "Meera Patel",
  email: "meera@example.com",
  service_id: "svc-2",
  event_type: "Sangeet",
  event_date_iso: future(),
  guest_count: 180,
  event_location: "Edison, NJ",
  time_start: "16:00",
  time_end: "22:30",
  note: "Can you play a mix of Bollywood and Punjabi?",
};

test.describe("contract from the inquiry", () => {
  test("opens on the package the client asked about, not the first screen", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, INQUIRY);

    await page.goto("contracts/new/?conversation=c1&lead=lead-9");

    await expect(page).toHaveURL(/[?&]package=svc-2/);
    await expect(page.getByRole("button", { name: "Remove Sangeet night" })).toBeVisible();
    await expect(page.getByText("Started from “Sangeet night”.")).toBeVisible();
  });

  test("fills a city-only place and asks for the street", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, INQUIRY);

    await page.goto("contracts/new/?conversation=c1&lead=lead-9&scratch=1");

    await expect(page.getByLabel("City")).toHaveValue("Edison");
    await expect(page.getByLabel("State")).toHaveValue("NJ");
    // The form's times (backend #58).
    await expect(page.getByLabel("Start time — hour")).toHaveValue("4");
    await expect(page.getByLabel("End time — minute")).toHaveValue("30");
    const note = page.getByRole("note");
    await expect(note.getByText("From Meera's inquiry")).toBeVisible();
    await expect(note.getByText("— add the venue's street address below.")).toBeVisible();
    await expect(note.getByText("Can you play a mix of Bollywood and Punjabi?")).toBeVisible();
    // Special requests waits for legal's OK: off unless switched on.
    await expect(page.getByRole("button", { name: "Add as a Special requests section" })).toHaveCount(0);
    await expect(page.getByLabel("Client name")).toHaveValue("Meera Patel");
    // From scratch the title is generated, so it can carry the event. A
    // package's template has a title of its own, which is kept.
    await expect(page.getByLabel("Agreement title")).toHaveValue(/^Meera Patel's Sangeet — /);
  });

  test("a full address needs no prompt", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, { ...INQUIRY, event_location: "12 Maple Ave, Edison, NJ 08817", note: null });

    await page.goto("contracts/new/?conversation=c1&lead=lead-9&scratch=1");

    await expect(page.getByLabel("City")).toHaveValue("Edison");
    await expect(page.getByRole("note").getByText(/add the venue's street address/)).toHaveCount(0);
    await expect(page.getByRole("note").getByText("Sangeet")).toBeVisible();
  });

  test("a package the vendor no longer offers leaves the first screen as it was", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, { ...INQUIRY, service_id: "svc-gone" });

    await page.goto("contracts/new/?conversation=c1&lead=lead-9");

    await expect(page).not.toHaveURL(/[?&]package=/);
  });

  test("Send contract without the lead in its link still starts from the chat's inquiry", async ({ page, api }) => {
    await loginAs(page, api);
    // Messages can know the chat has an inquiry before its Leads list does.
    mockEditor(api, { ...INQUIRY, conversation_id: "c1" });

    await page.goto("contracts/new/?conversation=c1");

    await expect(page).toHaveURL(/[?&]package=svc-2/);
    await expect(page.getByRole("button", { name: "Remove Sangeet night" })).toBeVisible();
    await expect(page.getByRole("note").getByText("From Meera's inquiry")).toBeVisible();
    await expect(page.getByLabel("City")).toHaveValue("Edison");
  });
});

