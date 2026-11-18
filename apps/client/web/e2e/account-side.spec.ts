import { test, expect, loginAs } from "./support/fixtures";
import { mockUser } from "./support/mock-data";

// What an account is comes with the account (GET /me, backend #53), so a
// vendor who opens a client page is shown the notice that sends them home —
// never the client app first, header and tabs included.

test.describe("a vendor account in the client app", () => {
  test("never sees the client app's pages or tabs, even for a moment", async ({ page, api }) => {
    // Records whether the client tabs ("My Events") were ever drawn.
    await page.addInitScript(() => {
      const w = window as unknown as { __sawClientApp: boolean };
      w.__sawClientApp = false;
      new MutationObserver(() => {
        if (document.body?.innerText.includes("My Events")) w.__sawClientApp = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await loginAs(page, api, mockUser({ is_vendor: true, signup_side: "vendor" }));
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations/unread-count", { unread_count: 0 });

    await page.goto("bundles/");

    await expect(page.getByRole("heading", { name: "This is a vendor account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to jornaevents.com" })).toHaveAttribute(
      "href",
      "https://jornaevents.com/app/overview/",
    );
    expect(await page.evaluate(() => (window as unknown as { __sawClientApp: boolean }).__sawClientApp)).toBe(false);
  });

  test("one that hasn't finished setting up is sent to finish", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ is_vendor: false, signup_side: "vendor" }));
    api.get("/bundles", []);
    api.get("/events", []);

    await page.goto("bundles/");

    await expect(page.getByRole("link", { name: "Finish setting up" })).toHaveAttribute(
      "href",
      "https://jornaevents.com/app/vendor-onboarding/",
    );
  });

  test("a client's pages draw as usual", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ is_vendor: false, signup_side: "client" }));
    api.get("/bundles", []);
    api.get("/events", []);
    api.get("/conversations/unread-count", { unread_count: 0 });

    await page.goto("bundles/");

    await expect(page.getByRole("heading", { name: "This is a vendor account" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "My Events" }).first()).toBeVisible();
  });
});
