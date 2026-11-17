import { test, expect, loginAs } from "./support/fixtures";
import type { ApiMock } from "./support/api-mock";

// Suggest vendors (client redesign PR 5): two questions, then one vendor per
// open slot in three plans. Adding a plan keeps it on the event as drafts and
// discards the other two; nothing is sent to a vendor here.

const EVENT = {
  event_id: "event-1", user_id: "user-1", name: "Anaya's Birthday", date_iso: "2099-12-12", location: "Jersey City, NJ",
  guest_count: 60, budget: 5000, services_needed: ["photography", "floral_decor"],
};
const item = (category: string, vendor: string, price: number) => ({
  category, vendor_id: `v-${vendor}`, service_id: `s-${vendor}`, service_name: "Celebration package", vendor_name: vendor,
  price_min: price, price_max: price, price_unit: "event", price_pending_quantity: false, rating: 4.8, match_reason: "Highly rated at 4.8★",
});
const option = (label: string, id: string, items: unknown[], unfilled: string[] = []) => ({
  label, description: "", factors: [], bundle_id: id,
  bundle: { items, estimated_total_min: (items as { price_min: number }[]).reduce((n, i) => n + i.price_min, 0), estimated_total_max: 0, pending_quantity_count: 0, unfilled_categories: unfilled },
});

function mock(api: ApiMock) {
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/events", [EVENT]);
  api.get("/bundles", []);
  api.post("/chatbot/bundles", {
    options: [
      option("Budget", "b-budget", [item("photography", "Little Moments", 1200)], ["floral_decor"]),
      option("Balanced", "b-balanced", [item("photography", "Storybook Photo", 1800), item("floral_decor", "Peachy Parties", 1500)]),
      option("Top Rated", "b-top", [item("photography", "Lens & Light", 3200), item("floral_decor", "Bloom & Diya", 2600)]),
    ],
  });
  api.delete("/bundles/:id", {});
}

test("asks budget and style, then suggests a vendor per open slot in three plans", async ({ page, api }) => {
  await loginAs(page, api);
  mock(api);
  await page.goto("suggest/?event=event-1");

  await expect(page.getByText("Open: Photography, Floral & Decor")).toBeVisible();
  await expect(page.getByLabel("Total vendor budget")).toHaveValue("5000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Playful" }).click();
  await page.getByRole("button", { name: "Suggest vendors" }).click();

  // The design's three loading steps tick over before the results, even when
  // the answer comes back at once.
  const loading = page.getByRole("status");
  await expect(loading.getByRole("heading", { name: "Finding your best matches" })).toBeVisible();
  const steps = loading.getByRole("list", { name: "Progress" }).getByRole("listitem");
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
  await expect(steps.nth(1)).toContainText("Balancing 2 categories within $5,000");
  await expect(steps.nth(2)).toContainText("Matching your style: playful");
  await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
  await expect(steps.nth(0).getByLabel("Done")).toBeVisible();

  const [call] = api.requestsTo("POST", "/chatbot/bundles");
  expect(call.body).toMatchObject({
    event_id: "event-1", needed_categories: ["photography", "floral_decor"], budget_tier: "custom", budget_amount: "5000", style: ["playful"],
  });

  // Balanced first: within the budget.
  await expect(page.getByRole("tab", { name: "Balanced" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("$3,300 of $5,000 budget")).toBeVisible();
  await expect(page.getByText("Within budget")).toBeVisible();

  // Top rated runs over, and says by how much.
  await page.getByRole("tab", { name: "Top rated" }).click();
  await expect(page.getByRole("heading", { name: "Lens & Light" })).toBeVisible();
  await expect(page.getByText("$800 over", { exact: true })).toBeVisible();

  // Best value couldn't fill decor: it says so and points to Explore.
  await page.getByRole("tab", { name: "Best value" }).click();
  await expect(page.getByRole("link", { name: "Browse Floral & Decor in Explore" })).toHaveAttribute("href", /marketplace\/?\?category=floral_decor$/);
});

test("Add to my event keeps the chosen plan and discards the other two", async ({ page, api }) => {
  await loginAs(page, api);
  mock(api);
  await page.goto("suggest/?event=event-1");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Suggest vendors" }).click();
  await page.getByRole("button", { name: "Add to my event" }).click();

  await expect(page).toHaveURL(/\/event\/?\?id=event-1$/);
  expect(api.requestsTo("DELETE", "/bundles/b-budget")).toHaveLength(1);
  expect(api.requestsTo("DELETE", "/bundles/b-top")).toHaveLength(1);
  expect(api.requestsTo("DELETE", "/bundles/b-balanced")).toHaveLength(0);
  expect(api.requestsTo("POST", "/bundles/b-balanced/select")).toHaveLength(0);
});

test("an event with every slot filled has nothing to suggest", async ({ page, api }) => {
  await loginAs(page, api);
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/events", [{ ...EVENT, services_needed: [] }]);
  api.get("/bundles", []);
  await page.goto("suggest/?event=event-1");
  await expect(page.getByRole("heading", { name: "Every slot has a vendor" })).toBeVisible();
});
