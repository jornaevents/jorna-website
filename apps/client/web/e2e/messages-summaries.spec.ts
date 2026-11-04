import { test, expect, loginAs } from "./support/fixtures";
import { mockUser } from "./support/mock-data";

// AI summary lines in the inbox (backend summary_service, DECISIONS #42). The
// server decides which rows get one; the page draws it in place of the last
// message, and never on a row with nothing unread. Plus the account setting
// that turns them off.

const now = new Date().toISOString();

function thread(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    conversation_id: id,
    subject_type: "enquiry",
    name,
    type: "direct",
    member_count: 2,
    members: [
      { user_id: "user-1", name: "Priya Shah" },
      { user_id: `vendor-${id}`, name },
    ],
    unread_count: 0,
    last_message: { content: `Last message from ${name}`, kind: "text", created_at: now },
    created_at: now,
    ...extra,
  };
}

test.describe("inbox AI summaries (/messages)", () => {
  test("a row with a summary shows it instead of the last message", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/conversations/unread-count", { unread_count: 4 });
    api.get("/conversations", [
      thread("c1", "Saffron Caterers", {
        unread_count: 4,
        summary: { text: "Saffron Caterers confirmed the menu; waiting on the client's guest count", generated_at: now },
      }),
      thread("c2", "DJ Beats"),
    ]);

    await page.goto("messages/");
    const summary = page.getByText("Saffron Caterers confirmed the menu; waiting on the client's guest count");
    await expect(summary).toBeVisible();
    // Labelled as AI for screen readers and on hover.
    await expect(page.getByText("AI summary, may miss details:")).toHaveCount(1);
    await expect(page.locator('[title="AI summary · may miss details"]')).toHaveCount(1);
    await expect(page.getByText("Last message from Saffron Caterers")).toHaveCount(0);
    // A row without one is unchanged.
    await expect(page.getByText("Last message from DJ Beats")).toBeVisible();
  });

  test("an old server with no summary field shows the inbox as before", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/conversations/unread-count", { unread_count: 3 });
    api.get("/conversations", [thread("c1", "Saffron Caterers", { unread_count: 3 })]);

    await page.goto("messages/");
    await expect(page.getByText("Last message from Saffron Caterers")).toBeVisible();
    await expect(page.getByText("AI summary, may miss details:")).toHaveCount(0);
  });

  test("a summary on a row with nothing unread isn't shown", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/conversations/unread-count", { unread_count: 0 });
    api.get("/conversations", [
      thread("c1", "Saffron Caterers", { summary: { text: "Saffron Caterers confirmed the menu", generated_at: now } }),
    ]);

    await page.goto("messages/");
    await expect(page.getByText("Last message from Saffron Caterers")).toBeVisible();
    await expect(page.getByText("Saffron Caterers confirmed the menu")).toHaveCount(0);
  });
});

test.describe("Show AI summaries (/account)", () => {
  test("is on by default and saves when turned off", async ({ page, api }) => {
    const user = await loginAs(page, api, mockUser({ ai_summaries_enabled: true }));
    api.patch("/me", { ...user, ai_summaries_enabled: false });

    await page.goto("account/");
    const box = page.getByRole("checkbox", { name: /Show AI summaries/ });
    await expect(box).toBeChecked();
    await box.uncheck();
    await expect(box).not.toBeChecked();
    expect(api.requestsTo("PATCH", "/me")[0].body).toEqual({ ai_summaries_enabled: false });
  });

  test("a user from an older server, with no setting, reads as on", async ({ page, api }) => {
    await loginAs(page, api);
    await page.goto("account/");
    await expect(page.getByRole("checkbox", { name: /Show AI summaries/ })).toBeChecked();
  });

  test("a failed save says so and leaves the box as it was", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ ai_summaries_enabled: true }));
    api.error("PATCH", "/me", 500, "Server error");

    await page.goto("account/");
    const box = page.getByRole("checkbox", { name: /Show AI summaries/ });
    await box.click();
    await expect(page.getByText("Couldn't save that. Try again.")).toBeVisible();
    await expect(box).toBeChecked();
  });
});
