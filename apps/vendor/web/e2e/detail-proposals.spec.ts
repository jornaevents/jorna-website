import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// Propose a detail in chat (backend DECISIONS #59), vendor side: the client's
// proposal is agreed from its card, and the vendor proposes an add-on or a
// price (DECISIONS #60), whose unit defaults to the package's.

test.use({ viewport: { width: 1440, height: 900 } });

const now = new Date().toISOString();
const CONV = {
  conversation_id: "c-q", name: "Meera Patel", subject_type: "enquiry", vendor_id: "vendor-1", member_count: 2,
  has_inquiry: true, members: [{ user_id: "user-1", name: "You" }, { user_id: "client-1", name: "Meera Patel" }],
  unread_count: 0, last_message: { content: "Hi", created_at: now }, created_at: now,
};

function mockHub(api: import("./support/api-mock").ApiMock, messages: unknown[]) {
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  api.get(`/bookings/vendor/${vendor.vendor_id}`, { items: [], total: 0, limit: 100, offset: 0 });
  api.get("/leads/pipeline", { items: [], counts: { inquiries: 0, negotiations: 0, needs_you: 0, waiting: 0, archived: 0 } });
  api.get("/conversations", [CONV]);
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/conversations/c-q/messages", { items: messages, total: messages.length, limit: 100, offset: 0 });
  api.get("/services", {
    items: [{ service_id: "svc-1", vendor_id: vendor.vendor_id, name: "Reception set", price: 1400, price_unit: "hour", add_ons: [{ id: "ao-1", name: "Drone coverage", price: 400, price_unit: "event" }] }],
    total: 1, limit: 100, offset: 0,
  });
}

test.describe("detail proposals, vendor side", () => {
  test("the client's proposal is agreed from its card", async ({ page, api }) => {
    await loginAs(page, api);
    const proposal = {
      message_id: "p1", conversation_id: "c-q", sender_id: "client-1", sender_name: "Meera Patel", kind: "detail_proposal",
      created_at: now, content: "Meera proposed a guest count: 150 guests.",
      meta: { field: "guests", value: "150", label: "150 guests", status: "open", proposed_by: "client-1" },
    };
    mockHub(api, [proposal]);
    api.post("/conversations/c-q/details/p1/agree", { ...proposal, meta: { ...proposal.meta, status: "agreed" } });

    await page.goto("messages/?id=c-q");
    await expect(page.getByText("Meera Patel proposed", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Agree" }).click();
    await expect(page.getByText("Agreed", { exact: true })).toBeVisible();
  });

  test("the vendor proposes an add-on from their packages", async ({ page, api }) => {
    await loginAs(page, api);
    mockHub(api, []);
    api.post("/conversations/c-q/details", {
      message_id: "p2", conversation_id: "c-q", sender_id: "user-1", sender_name: "Priya Shah", kind: "detail_proposal",
      created_at: now, content: "Priya Shah proposed an add-on: Drone coverage.",
      meta: { field: "addon", value: "ao-1", label: "Drone coverage", status: "open", proposed_by: "user-1" },
    });

    await page.goto("messages/?id=c-q");
    await page.getByRole("button", { name: "Propose a detail" }).click();
    const form = page.getByRole("form", { name: "Propose a detail" });
    await form.getByRole("radio", { name: "Add-on" }).click();
    await form.getByLabel("Add-on").selectOption("ao-1");
    await form.getByRole("button", { name: "Propose" }).click();

    await expect(page.getByText("You proposed")).toBeVisible();
    expect(api.requestsTo("POST", "/conversations/c-q/details")[0].body).toEqual({ field: "addon", value: "ao-1" });
  });

  test("the vendor proposes a price, per the inquiry's package unless they pick a unit", async ({ page, api }) => {
    await loginAs(page, api);
    const inquiry = {
      message_id: "i1", conversation_id: "c-q", sender_id: "client-1", sender_name: "Meera Patel", kind: "text",
      created_at: now, content: "Inquiry", meta: { inquiry: { service_id: "svc-1", service_name: "Reception set" } },
    };
    mockHub(api, [inquiry]);
    api.post("/conversations/c-q/details", {
      message_id: "p3", conversation_id: "c-q", sender_id: "user-1", sender_name: "Priya Shah", kind: "detail_proposal",
      created_at: now, content: "Priya Shah proposed a price: $2,400 per hour for Reception set.",
      meta: { field: "price", value: "2400", label: "$2,400 per hour for Reception set", status: "open", proposed_by: "user-1", unit: "hour" },
    });

    await page.goto("messages/?id=c-q");
    await page.getByRole("button", { name: "Propose a detail" }).click();
    const form = page.getByRole("form", { name: "Propose a detail" });
    await form.getByRole("radio", { name: "Price" }).click();
    await expect(form.getByLabel("Per").locator("option").first()).toHaveText("hour (Reception set)");
    await form.getByLabel("Price ($)").fill("$2,400");
    await form.getByRole("button", { name: "Propose" }).click();
    await expect(page.getByText("$2,400 per hour for Reception set")).toBeVisible();
    expect(api.requestsTo("POST", "/conversations/c-q/details")[0].body).toEqual({ field: "price", value: "2400" });

    await page.getByRole("button", { name: "Propose a detail" }).click();
    await form.getByRole("radio", { name: "Price" }).click();
    await form.getByLabel("Price ($)").fill("40");
    await form.getByLabel("Per").selectOption("person");
    await form.getByRole("button", { name: "Propose" }).click();
    expect(api.requestsTo("POST", "/conversations/c-q/details")[1].body).toEqual({ field: "price", value: "40", unit: "person" });
  });
});
