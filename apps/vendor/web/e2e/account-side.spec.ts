import { test, expect } from "./support/fixtures";
import { mockTokenPair, mockUser, mockVendorDetail } from "./support/mock-data";
import type { Page } from "@playwright/test";

// What an account is comes with the account (GET /me's is_vendor and
// signup_side, backend #53), so each app knows which side to draw the moment
// it knows who's signed in — no flash of the other one while a second request
// answers, and an unfinished vendor goes back to onboarding from any sign-in.

const VENDOR = { is_vendor: true, signup_side: "vendor" };
const UNFINISHED_VENDOR = { is_vendor: false, signup_side: "vendor" };
const CLIENT = { is_vendor: false, signup_side: "client" };

async function signIn(page: Page, url: string) {
  await page.goto(url);
  await page.getByLabel("Email or username").fill("priya");
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
}

function stubClientApp(page: Page) {
  return page.route("https://jornaevents.com/client/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "client app" }),
  );
}

test.describe("which side an account is on", () => {
  test("a vendor lands on the dashboard from what /me says", async ({ page, api }) => {
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser(VENDOR));
    api.get("/vendors/me", mockVendorDetail({ user_id: "user-1" }));

    await signIn(page, "login/");

    await expect(page).toHaveURL(/\/app\/overview\/?$/);
  });

  test("a vendor who quit before onboarding goes back to it from the plain Sign in", async ({ page, api }) => {
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser(UNFINISHED_VENDOR));
    api.error("GET", "/vendors/me", 404, "Vendor profile not found for this user");
    api.get("/vendors/categories", { categories: [] });
    api.get("/bundles", []);

    // No ?role=vendor: the header's "Sign in", which used to send them to
    // the client app's Plan wizard.
    await signIn(page, "login/");

    await expect(page).toHaveURL(/\/app\/vendor-onboarding\/?$/);
  });

  test("a client who signed up as one isn't sent to vendor setup by a vendor-side link", async ({ page, api }) => {
    await stubClientApp(page);
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser(CLIENT));
    api.get("/bundles", []);
    api.get("/events", []);

    await signIn(page, "login/?role=vendor");

    await expect(page).toHaveURL("https://jornaevents.com/client/plan/");
  });

  test("a signed-in vendor never sees the no-vendor tabs while the page loads", async ({ page, api }) => {
    // Records whether "Browse vendors" — a no-vendor tab — was ever drawn,
    // however briefly, before the vendor tabs.
    await page.addInitScript(() => {
      const w = window as unknown as { __sawNoVendorTabs: boolean };
      w.__sawNoVendorTabs = false;
      new MutationObserver(() => {
        const nav = document.querySelector('nav[aria-label="Primary"]');
        if (nav?.textContent?.includes("Browse vendors")) w.__sawNoVendorTabs = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.addInitScript((t) => {
      window.localStorage.setItem("jorna_access", t.access_token);
      window.localStorage.setItem("jorna_refresh", t.refresh_token);
    }, mockTokenPair());
    // Slow, so the old way round (tabs first, role after) would have shown.
    api.get("/me", async () => {
      await new Promise((r) => setTimeout(r, 400));
      return mockUser(VENDOR);
    });
    api.get("/vendors/me", mockVendorDetail({ user_id: "user-1" }));
    api.get("/conversations/unread-count", { unread_count: 0 });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("how-it-works/");

    await expect(page.locator('nav[aria-label="Primary"]').getByRole("link", { name: "Bookings" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sawNoVendorTabs: boolean }).__sawNoVendorTabs)).toBe(false);
  });

  test("signing up records the vendor side", async ({ page, api }) => {
    api.post("/auth/register", { user_id: "user-1", email: "raj@example.com" });
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser(UNFINISHED_VENDOR));
    api.get("/vendors/categories", { categories: [] });
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/bundles", []);

    await page.goto("login/?mode=register");
    await page.getByLabel("First name").fill("Raj");
    await page.getByLabel("Last name").fill("Mehta");
    await page.getByLabel("Email").fill("raj@example.com");
    await page.getByLabel("Password").fill("Celebrate2025");
    await page.getByLabel(/I agree to the Terms of Service/).check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/app\/vendor-onboarding\/?$/);
    const [call] = api.requestsTo("POST", "/auth/register");
    expect((call.body as { side?: string }).side).toBe("vendor");
  });
});

test.describe("Google from the shared sign-in page", () => {
  // The Supabase session the OAuth handshake would have left behind, so the
  // callback can read it without a real Google round trip.
  async function seedGoogleSession(page: Page) {
    await page.addInitScript(() => {
      const now = Math.floor(Date.now() / 1000);
      window.localStorage.setItem(
        "sb-ddfjhfqrrgvzphwiinch-auth-token",
        JSON.stringify({
          access_token: "google-access",
          refresh_token: "google-refresh",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          user: { id: "sb-user-1", email: "asha@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {} },
        }),
      );
    });
  }

  test("a new identity is asked which side it's on before the account is made", async ({ page, api }) => {
    await seedGoogleSession(page);
    api.post("/auth/google/lookup", {
      access_token: null, token_type: "bearer", user_id: null, email: "asha@example.com", is_new_user: true,
    });
    api.post("/auth/google/register", { ...mockTokenPair(), user_id: "user-1", email: "asha@example.com", is_new_user: true });
    api.get("/me", mockUser(UNFINISHED_VENDOR));
    api.get("/vendors/categories", { categories: [] });
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/bundles", []);

    await page.goto("auth/callback/");

    await expect(page.getByText("Are you planning an event, or a vendor?")).toBeVisible();
    expect(api.requestsTo("POST", "/auth/google/register")).toHaveLength(0);

    await page.getByRole("button", { name: "I'm a vendor" }).click();

    await expect(page).toHaveURL(/\/app\/vendor-onboarding\/?$/);
    const [call] = api.requestsTo("POST", "/auth/google/register");
    expect((call.body as { side?: string }).side).toBe("vendor");
  });

  test("an existing account signs straight in, with no question", async ({ page, api }) => {
    await seedGoogleSession(page);
    api.post("/auth/google/lookup", { ...mockTokenPair(), user_id: "user-1", email: "asha@example.com", is_new_user: false });
    api.get("/me", mockUser(VENDOR));
    api.get("/vendors/me", mockVendorDetail({ user_id: "user-1" }));

    await page.goto("auth/callback/");

    await expect(page).toHaveURL(/\/app\/overview\/?$/);
    expect(api.requestsTo("POST", "/auth/google/register")).toHaveLength(0);
  });
});
