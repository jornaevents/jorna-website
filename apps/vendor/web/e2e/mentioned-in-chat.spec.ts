import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// "Mentioned in chat" (Contract Builder from Chat, version 1): what the chat
// said since the inquiry, beside the contract, each with its words. Nothing
// changes until the vendor clicks Use.

test.use({ viewport: { width: 1440, height: 900 } });

const now = Date.now();
const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

function mockEditor(api: ApiMock, messages: unknown[]) {
  const vendor = mockVendorDetail();
  api.get("/vendors/me", vendor);
  // A package, or the vendor shell sends a vendor with none to setup (#162).
  api.get("/services", {
    items: [{ service_id: "svc-1", vendor_id: vendor.vendor_id, name: "Reception set", price: 1400, add_ons: [] }],
    total: 1, limit: 100, offset: 0,
  });
  api.get("/contract-templates", { items: [], total: 0 });
  api.get("/conversations/c1/messages", { items: messages, total: messages.length, limit: 100, offset: 0 });
}

const msg = (id: string, content: string, at: string, extra: Record<string, unknown> = {}) => ({
  message_id: id, conversation_id: "c1", sender_id: "client-1", sender_name: "Meera Patel",
  kind: "text", content, created_at: at, ...extra,
});

test.describe("mentioned in chat", () => {
  test("lists what the chat said, and Use puts it on the contract", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, [
      msg("m1", "Inquiry: Reception set", ago(5), { meta: { inquiry: { lead_id: "l1", guest_count: 300 } } }),
      msg("m2", "Can we start at 4:30pm? We're now about 180 guests.", ago(2)),
      msg("m3", "Six hours is fine, and $1,800 works for us.", ago(1), { sender_name: "Arjun Kapoor", sender_id: "user-1" }),
    ]);

    await page.goto("contracts/new/?conversation=c1&scratch=1");

    const panel = page.getByText("3 details mentioned in chat");
    await expect(panel).toBeVisible();
    await panel.click();
    const list = page.getByRole("list", { name: "Mentioned in chat" });
    // Both the start time and the guest count came from this message.
    await expect(list.getByText("We're now about 180 guests.", { exact: false })).toHaveCount(2);
    // The inquiry is already on the contract; its 300 isn't repeated here.
    await expect(list.getByText("300 guests")).toHaveCount(0);
    // An amount is shown, not applied: what it was for is the vendor's call.
    await expect(list.getByText("Amount: $1,800")).toBeVisible();
    await expect(list.getByRole("button", { name: "Use $1,800" })).toHaveCount(0);

    await list.getByRole("button", { name: "Use 180 guests" }).click();
    await expect(page.getByLabel("Guest count (optional)")).toHaveValue("180");
    await expect(list.getByRole("button", { name: "Use 180 guests" })).toHaveText("Used");

    await list.getByRole("button", { name: "Use Starts 4:30 PM" }).click();
    await expect(page.getByLabel("Start time — hour")).toHaveValue("4");
  });

  test("a chat with nothing to use shows no panel", async ({ page, api }) => {
    await loginAs(page, api);
    mockEditor(api, [msg("m1", "Thanks, talk soon!", ago(1))]);

    await page.goto("contracts/new/?conversation=c1&scratch=1");

    await expect(page.getByRole("heading", { name: "New contract" })).toBeVisible();
    await expect(page.getByText(/mentioned in chat/)).toHaveCount(0);
  });
});
