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

  test("a draft is sent in the chat, and there's no link to copy", async ({ page, api }) => {
    await loginAs(page, api);
    mockLeads(api);
    api.post("/contracts/d1/send", { booking_id: "d1", contract_status: "sent", email_sent: true });

    await page.goto("leads/");
    await page.getByRole("button", { name: /Dev Patel/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("button", { name: "Copy link" })).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Send by email" })).toHaveCount(0);
    await drawer.getByRole("button", { name: "Send in chat" }).click();

    await expect(page.getByText("Sent in your chat — we emailed Dev Patel to open it there.")).toBeVisible();
    expect(api.requestsTo("POST", "/contracts/d1/send")).toHaveLength(1);
  });

  test("a sent contract can be resent, but not copied as a link", async ({ page, api }) => {
    await loginAs(page, api);
    mockLeads(api);

    await page.goto("leads/");
    await page.getByRole("tab", { name: /Negotiations/ }).click();
    // A sent contract opens into the negotiation; the lead's own actions are a click away.
    await page.getByRole("button", { name: /Sana Omar/ }).click();
    await page.getByRole("dialog", { name: "Contract negotiation" }).getByRole("button", { name: "Lead details" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("link", { name: "View contract" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Resend" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Copy link" })).toHaveCount(0);
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
  test("a lead's next steps are message, contract or not going ahead — no Archive", async ({ page, api }) => {
    await loginAs(page, api);
    const lead = item({
      id: "lead:l2",
      source: "lead",
      booking_id: null,
      lead_id: "l2",
      conversation_id: "conv-9",
      name: "Neha Patel",
      attention_reason: "new_lead",
      lead_status: "new",
      lead_source: "inquiry_form",
    });
    api.get("/vendors/me", mockVendorDetail());
    api.get("/leads/pipeline", { items: [lead], counts: { inquiries: 1, negotiations: 0, needs_you: 1, waiting: 0, archived: 0 } });
    api.patch("/leads/l2", { lead_id: "l2", status: "lost" });

    await page.goto("leads/");
    await page.getByRole("button", { name: /Neha Patel/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("link", { name: "Message client" })).toHaveAttribute("href", /conversation\/?\?id=conv-9$/);
    await expect(drawer.getByRole("link", { name: "Create contract" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Archive" })).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "Mark as contacted" })).toHaveCount(0);

    await drawer.getByRole("button", { name: "Mark as not going ahead" }).click();
    await expect(page.getByText("Moved to Archived.")).toBeVisible();
    expect(api.requestsTo("PATCH", "/leads/l2")[0].body).toEqual({ status: "lost" });
  });

  test("a lead marked not going ahead can be unarchived, back as new", async ({ page, api }) => {
    await loginAs(page, api);
    const closed = item({
      id: "lead:l3",
      source: "lead",
      booking_id: null,
      lead_id: "l3",
      name: "Kiran Rao",
      attention: null,
      attention_reason: null,
      archived: true,
      outcome: "not_going_ahead",
      lead_status: "lost",
    });
    api.get("/vendors/me", mockVendorDetail());
    api.get("/leads/pipeline", { items: [closed], counts: { inquiries: 0, negotiations: 0, needs_you: 0, waiting: 0, archived: 1 } });
    api.patch("/leads/l3", { lead_id: "l3", status: "new" });

    await page.goto("leads/");
    await page.getByRole("tab", { name: /Archived/ }).click();
    await page.getByRole("button", { name: /Kiran Rao/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Not going ahead").first()).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Mark as not going ahead" })).toHaveCount(0);
    await drawer.getByRole("button", { name: "Unarchive" }).click();

    await expect(page.getByText("Back in your active leads.")).toBeVisible();
    expect(api.requestsTo("PATCH", "/leads/l3")[0].body).toEqual({ status: "new", archived: false });
  });

  test("New on Leads only shares the inquiry form: no contract, no adding a client by hand", async ({ page, api }) => {
    await loginAs(page, api);
    mockLeads(api);

    await page.goto("leads/");
    await page.getByRole("button", { name: "New", exact: true }).click();
    const items = page.getByRole("menu", { name: "New" }).getByRole("menuitem");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Share inquiry form");
    // Contracts are sent from a lead or a chat, not from New (2026-11-07).
    await expect(page.getByRole("menuitem", { name: /Send a contract/ })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /Add a client/ })).toHaveCount(0);

    await items.first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Your inquiry form" })).toBeVisible();
  });
});
