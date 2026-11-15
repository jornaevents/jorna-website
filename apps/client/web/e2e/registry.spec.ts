import { test, expect, loginAs } from "./support/fixtures";
import type { HandlerArgs } from "./support/api-mock";

// The Registry tab (client redesign PR 9): funds, the gifts recorded against
// them and thank-yous. Tracking only.

const EVENT = { event_id: "event-1", user_id: "user-1", name: "Priya's Wedding", date_iso: "2099-05-22", location: "Edison, NJ" };

type Gift = { gift_id: string; from_name: string; amount_cents: number; thanked: boolean; created_at: string };
type Fund = { fund_id: string; name: string; goal_cents: number | null; gifts: Gift[] };

test("add a fund, record a gift against it, and mark the giver thanked", async ({ page, api }) => {
  const funds: Fund[] = [];
  const registry = () => {
    const gifts = funds.flatMap((f) => f.gifts);
    return {
      event_id: "event-1",
      funds: funds.map((f) => ({ ...f, raised_cents: f.gifts.reduce((n, g) => n + g.amount_cents, 0) })),
      total_cents: gifts.reduce((n, g) => n + g.amount_cents, 0),
      gift_count: gifts.length,
      thanked_count: gifts.filter((g) => g.thanked).length,
    };
  };
  await loginAs(page, api);
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/events", [EVENT]);
  api.get("/bundles", []);
  api.get("/events/event-1/registry", registry);
  api.post("/events/event-1/registry/funds", ({ route }: HandlerArgs) => {
    funds.push({ fund_id: "f1", gifts: [], ...route.request().postDataJSON() });
    return registry();
  });
  api.post("/registry/funds/f1/gifts", ({ route }: HandlerArgs) => {
    funds[0].gifts.push({ gift_id: "g1", thanked: false, created_at: "2026-11-01T00:00:00", ...route.request().postDataJSON() });
    return registry();
  });
  api.patch("/registry/gifts/g1", ({ route }: HandlerArgs) => {
    Object.assign(funds[0].gifts[0], route.request().postDataJSON());
    return registry();
  });

  await page.goto("event/?id=event-1");
  await page.getByRole("link", { name: "Registry" }).click();
  await expect(page).toHaveURL(/tab=registry/);
  await expect(page.getByText("Jorna doesn't process these payments.")).toBeVisible();

  await page.getByLabel("New fund").fill("Honeymoon fund");
  await page.getByLabel("Goal ($, optional)").fill("5,000");
  await page.getByRole("button", { name: "Add fund" }).click();
  const fund = page.getByRole("article", { name: "Honeymoon fund" });
  await expect(fund).toContainText("$0 of $5,000");
  expect(api.requestsTo("POST", "/events/event-1/registry/funds")[0].body).toEqual({ name: "Honeymoon fund", goal_cents: 500000 });

  await fund.getByLabel("Gift from").fill("Rekha Bua");
  await fund.getByLabel("Amount ($)").fill("250");
  await fund.getByRole("button", { name: "Add gift" }).click();
  await expect(fund).toContainText("$250 of $5,000");
  await expect(fund).toContainText("5% funded");
  await expect(page.getByText("1 gift received")).toBeVisible();

  await fund.getByLabel("Thanked Rekha Bua").click();
  await expect(fund.getByLabel("Thanked Rekha Bua")).toBeChecked();
  await expect(page.getByText("1 / 1")).toBeVisible();
  expect(api.requestsTo("PATCH", "/registry/gifts/g1")[0].body).toEqual({ thanked: true });
});
