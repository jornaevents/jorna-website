import { test, expect, loginAs } from "./support/fixtures";
import type { HandlerArgs } from "./support/api-mock";

// Plan a new event (client redesign PR 3): four steps, nothing saved until
// the last, an end date only for a multi-day event, and two ways to finish.

test.beforeEach(async ({ page, api }) => {
  await loginAs(page, api);
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/events", []);
  api.get("/bundles", []);
  api.post("/events", ({ route }: HandlerArgs) => ({ event_id: "event-9", user_id: "user-1", ...route.request().postDataJSON() }));
  await page.goto("bundles/");
  await page.getByRole("button", { name: "Plan your first event" }).click();
});

test("each step waits for what it needs, and the event is created with its categories", async ({ page, api }) => {
  const dialog = page.getByRole("dialog");
  const next = dialog.getByRole("button", { name: "Continue" });

  await expect(next).toBeDisabled();
  await dialog.getByLabel("Event type").selectOption("Other");
  await dialog.getByLabel("What kind of event?").fill("Housewarming");
  await dialog.getByLabel("Event name").fill("Our new home");
  await next.click();

  await expect(next).toBeDisabled();
  await dialog.getByLabel("Event date").fill("2099-05-22");
  await dialog.getByLabel("City").fill("Edison, NJ");
  // A multi-day event's end can't come before its start.
  await dialog.getByRole("button", { name: /Add end date/ }).click();
  await dialog.getByLabel("Ends").fill("2099-05-20");
  await expect(dialog.getByText("The end date is before the start date.")).toBeVisible();
  await expect(next).toBeDisabled();
  await dialog.getByLabel("Ends").fill("2099-05-24");
  await next.click();
  await next.click();

  // Suggestions need at least one category; creating doesn't.
  await expect(dialog.getByRole("button", { name: "Create and suggest vendors" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Photography" }).click();
  await dialog.getByRole("button", { name: "Catering" }).click();
  await expect(dialog.getByText("2 vendor categories selected")).toBeVisible();
  expect(api.requestsTo("POST", "/events")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Create event" }).click();

  await expect(dialog).toHaveCount(0);
  const [call] = api.requestsTo("POST", "/events");
  expect(call.body).toMatchObject({
    name: "Our new home",
    event_type: "Housewarming",
    date_iso: "2099-05-22",
    date_end: "2099-05-24",
    location: "Edison, NJ",
    services_needed: ["photography", "catering"],
  });
});

test("Create and suggest vendors goes on to the builder for that event", async ({ page }) => {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event type").selectOption("Birthday");
  await dialog.getByLabel("Event name").fill("Anaya's 1st Birthday");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByLabel("Event date").fill("2099-12-12");
  await dialog.getByLabel("City").fill("Jersey City, NJ");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Floral & Decor" }).click();
  await dialog.getByRole("button", { name: "Create and suggest vendors" }).click();

  await expect(page).toHaveURL(/\/plan\/?\?event_id=event-9&date=2099-12-12/);
});

test("closing it saves nothing", async ({ page, api }) => {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event name").fill("Never mind");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.requestsTo("POST", "/events")).toHaveLength(0);
});
