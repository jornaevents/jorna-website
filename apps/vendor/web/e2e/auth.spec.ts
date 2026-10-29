import { test, expect } from "./support/fixtures";
import { mockTokenPair, mockUser, mockVendorDetail } from "./support/mock-data";

test.describe("authentication", () => {
  test("signs in with a valid identifier/password and lands on /overview", async ({ page, api }) => {
    const user = mockUser();
    api.post("/auth/login", mockTokenPair());
    api.get("/me", user);
    api.get("/vendors/me", mockVendorDetail({ user_id: user.user_id }));

    await page.goto("login/");
    await page.getByLabel("Email or username").fill(user.username);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app\/overview\/?$/);

    const loginCalls = api.requestsTo("POST", "/auth/login");
    expect(loginCalls).toHaveLength(1);
    expect(loginCalls[0].body).toMatchObject({ identifier: user.username });
  });

  test("an account without a vendor profile lands in vendor onboarding", async ({
    page,
    api,
  }) => {
    const user = mockUser();
    api.post("/auth/login", mockTokenPair());
    api.get("/me", user);
    api.error("GET", "/vendors/me", 404, "Vendor profile not found for this user");

    await page.goto("login/");
    await page.getByLabel("Email or username").fill(user.username);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app\/vendor-onboarding\/?$/);
  });

  test("a failed vendor check isn't read as 'not a vendor'", async ({ page, api }) => {
    const user = mockUser();
    api.post("/auth/login", mockTokenPair());
    api.get("/me", user);
    api.error("GET", "/vendors/me", 503, "Service unavailable");

    await page.goto("login/");
    await page.getByLabel("Email or username").fill(user.username);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app\/overview\/?$/);
  });

  test("an explicit next still wins over the role default", async ({ page, api }) => {
    const user = mockUser();
    api.post("/auth/login", mockTokenPair());
    api.get("/me", user);
    api.error("GET", "/vendors/me", 404, "Vendor profile not found for this user");

    await page.goto("login/?next=/account");
    await page.getByLabel("Email or username").fill(user.username);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app\/account\/?$/);
  });

  test("shows the backend's error message on invalid credentials", async ({ page, api }) => {
    api.error("POST", "/auth/login", 401, "Invalid email/username or password.");

    await page.goto("login/");
    await page.getByLabel("Email or username").fill("nobody");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email/username or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/login\/?$/);
  });

  test("sign-up is a vendor sign-up, and points couples at the client app", async ({ page }) => {
    await page.goto("login/?mode=register");

    await expect(page.getByRole("heading", { name: "List your business on Jorna" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account & continue" })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Host/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign up as a client" })).toHaveAttribute(
      "href",
      /\/client\/login\/?\?mode=register$/,
    );
  });

  test("signing out lands on a plain /login, not back on the page you left", async ({ page, api }) => {
    const user = mockUser();
    api.get("/me", user);
    api.get("/vendors/me", mockVendorDetail({ user_id: user.user_id }));
    await page.addInitScript((t) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("jorna_access", t.access_token);
        localStorage.setItem("jorna_refresh", t.refresh_token);
      }
    }, mockTokenPair());

    await page.goto("account/");
    await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/app\/login\/?$/);
    expect(await page.evaluate(() => localStorage.getItem("jorna_access"))).toBeNull();
  });

  test("redirects a signed-out visitor away from a protected page, preserving the return path", async ({
    page,
  }) => {
    await page.goto("vendor-profile/");

    await expect(page).toHaveURL(/\/app\/login\/?\?next=\/vendor-profile/);
  });
});
