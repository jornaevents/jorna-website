import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { HandlerArgs } from "./support/api-mock";

// Leads (redesign step 2): the backend's one pipeline, drawn — tiles, filters,
// and a drawer whose actions follow the lead's stage.

function item(overrides: Record<string, unknown>) {
  return {
    id: "booking:b1",
    source: "request",
    stage: "inquiry",
    booking_id: "b1",
    lead_id: null,
    conversation_id: null,
    name: "Meera Shah",
    email: "meera@example.com",
    phone: null,
    event_name: "Meera & Arjun",
    event_date: "2027-10-01",
    event_date_end: null,
    location: "Pines Manor",
    service_name: "Reception set",
    estimated_value_cents: 250000,
    contract_status: null,
    hold_expires_at: null,
    attention: "needs_you",
    attention_reason: "new_request",
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const PIPELINE = {
  items: [
    item({}),
    item({
      id: "booking:c1",
      source: "contract",
      stage: "negotiation",
      booking_id: "c1",
      name: "Sana Omar",
      event_name: null,
      contract_status: "sent",
      attention: "waiting",
      attention_reason: "sent",
      estimated_value_cents: 400000,
    }),
    item({
      id: "booking:d1",
      source: "contract",
      stage: "inquiry",
      booking_id: "d1",
      name: "Dev Patel",
      event_name: null,
      contract_status: "draft",
      attention_reason: "draft",
    }),
    item({
      id: "lead:l1",
      source: "lead",
      booking_id: null,
      lead_id: "l1",
      name: "Instagram Couple",
      event_name: null,
      event_date: "fall 2027",
      location: null,
      service_name: null,
      estimated_value_cents: null,
      attention: null,
      attention_reason: null,
      archived: true,
      lead_status: "contacted",
    }),
  ],
  counts: { inquiries: 2, negotiations: 1, needs_you: 2, waiting: 1, archived: 1 },
};

function mockLeads(api: import("./support/api-mock").ApiMock) {
  api.get("/vendors/me", mockVendorDetail());
  api.get("/leads/pipeline", PIPELINE);
  api.get("/contracts/:id", ({ url }: HandlerArgs) => ({
    booking_id: url.pathname.split("/").pop(),
    contract_token: `tok-${url.pathname.split("/").pop()}`,
    timeline: [{ at: new Date().toISOString(), kind: "sent", actor: "vendor", detail: null }],
  }));
}

test.describe("vendor leads (/leads)", () => {
  test("tiles, stage filters and the archived tab come from the pipeline", async ({ page, api }) => {
    await loginAs(page, api);
    mockLeads(api);

    await page.goto("leads/");

    await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();
    const list = page.getByRole("region", { name: "Pipeline" });
    await expect(list.getByText("Meera Shah")).toBeVisible();
    await expect(list.getByText("Needs your attention").first()).toBeVisible();
    await expect(list.getByText("Instagram Couple")).toHaveCount(0);

    await page.getByRole("tab", { name: /Negotiations/ }).click();
    await expect(list.getByText("Sana Omar")).toBeVisible();
    await expect(list.getByText("Meera Shah")).toHaveCount(0);

    await page.getByRole("tab", { name: /Archived/ }).click();
    await expect(list.getByText("Instagram Couple")).toBeVisible();
    await expect(list.getByText("fall 2027")).toBeVisible();
  });

  test("a request opens with Create contract, and Decline asks first", async ({ page, api }) => {
    await loginAs(page, api);
    mockLeads(api);
    api.put("/bookings/b1/status", { booking_id: "b1", status: "rejected" });

    await page.goto("leads/");
    await page.getByRole("button", { name: /Meera Shah/ }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("New request — they're waiting for your reply")).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Create contract" })).toHaveAttribute(
      "href",
      /\/contracts\/new\/?\?request=b1/,
    );
    await expect(drawer.getByRole("button", { name: "Send with my usual terms" })).toBeVisible();

    await drawer.getByRole("button", { name: "Decline", exact: true }).click();
    expect(api.requestsTo("PUT", "/bookings/b1/status")).toHaveLength(0);
    await drawer.getByRole("button", { name: "Decline request" }).click();
    await expect(drawer.getByText("Declined.")).toBeVisible();
    expect(api.requestsTo("PUT", "/bookings/b1/status")[0].body).toMatchObject({ status: "rejected" });
  });

  test("copying a draft's link sends it, so it becomes a negotiation", async ({ page, api }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (t: string) => ((window as unknown as { copied: string }).copied = t, Promise.resolve()) },
      });
    });
    await loginAs(page, api);
    mockLeads(api);
    api.post("/contracts/d1/send", { booking_id: "d1", contract_status: "sent" });

    await page.goto("leads/");
    await page.getByRole("button", { name: /Dev Patel/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Copy link" }).click();

    await expect(page.getByText("Link copied — the date is now on hold for them.")).toBeVisible();
    expect(api.requestsTo("POST", "/contracts/d1/send")).toHaveLength(1);
    expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toContain("booking-link?t=tok-d1");
  });

  test("a sent contract's link is copied without resending", async ({ page, api }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.resolve() } });
    });
    await loginAs(page, api);
    mockLeads(api);

    await page.goto("leads/");
    await page.getByRole("tab", { name: /Negotiations/ }).click();
    // A sent contract opens into the negotiation; the lead's own actions are a click away.
    await page.getByRole("button", { name: /Sana Omar/ }).click();
    await page.getByRole("dialog", { name: "Contract negotiation" }).getByRole("button", { name: "Lead details" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("link", { name: "View contract" })).toBeVisible();
    await drawer.getByRole("button", { name: "Copy link" }).click();

    await expect(drawer.getByText("Link copied.")).toBeVisible();
    expect(api.requestsTo("POST", "/contracts/c1/send")).toHaveLength(0);
  });

  test("a contract with proposed changes opens the negotiation, and the drawer leads back to it", async ({
    page,
    api,
  }) => {
    await loginAs(page, api);
    mockLeads(api);
    api.get("/leads/pipeline", {
      ...PIPELINE,
      items: [
        item({
          id: "booking:c1",
          source: "contract",
          stage: "negotiation",
          booking_id: "c1",
          name: "Sana Omar",
          contract_status: "viewed",
          proposal_status: "open",
          attention: "needs_you",
          attention_reason: "changes_proposed",
        }),
      ],
    });

    await page.goto("leads/");
    await page.getByRole("button", { name: /Sana Omar/ }).click();
    const panel = page.getByRole("dialog", { name: "Contract negotiation" });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Lead details" }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("They proposed changes to the contract")).toBeVisible();
    await expect(drawer.getByRole("link", { name: "View contract" })).toBeVisible();
    await drawer.getByRole("button", { name: "Review changes" }).click();
    await expect(page.getByRole("dialog", { name: "Contract negotiation" })).toBeVisible();
  });

  test("a hard load sends the token with the page's first requests", async ({ page, api }) => {
    // The api client used to be wired in AuthProvider's effect, which runs
    // after its children's: a reload of /leads sent the pipeline request with
    // no token and showed "Not authenticated".
    await loginAs(page, api);
    mockLeads(api);
    api.get("/leads/pipeline", async ({ route }: HandlerArgs) => {
      if (!route.request().headers().authorization) {
        await route.fulfill({ status: 401, contentType: "application/json", body: '{"detail":"Not authenticated"}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PIPELINE) });
    });

    await page.goto("leads/");
    await expect(page.getByRole("region", { name: "Pipeline" }).getByText("Meera Shah")).toBeVisible();
    await expect(page.getByText("Not authenticated")).toHaveCount(0);
  });

  test("archiving a request hides it without declining", async ({ page, api }) => {
    await loginAs(page, api);
    mockLeads(api);
    api.post("/bookings/b1/archive", { booking_id: "b1", vendor_archived_at: new Date().toISOString() });

    await page.goto("leads/");
    await page.getByRole("button", { name: /Meera Shah/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();

    await expect(page.getByText("Archived.")).toBeVisible();
    expect(api.requestsTo("POST", "/bookings/b1/archive")[0].body).toMatchObject({ archived: true });
    expect(api.requestsTo("PUT", "/bookings/b1/status")).toHaveLength(0);
  });
  test("New on Leads offers the inquiry form first, and no way to add a client by hand", async ({ page, api }) => {
    await loginAs(page, api);
    mockLeads(api);

    await page.goto("leads/");
    await page.getByRole("button", { name: "New", exact: true }).click();
    const items = page.getByRole("menu", { name: "New" }).getByRole("menuitem");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("Share inquiry form");
    await expect(items.nth(1)).toHaveAttribute("href", /\/contracts\/new\/?$/);
    await expect(page.getByRole("menuitem", { name: /Add a client/ })).toHaveCount(0);

    await items.first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Your inquiry form" })).toBeVisible();
  });
});
