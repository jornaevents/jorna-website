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

  // One sign-in for both sides (2026-10-29): an account with no vendor
  // profile is a client, and lands on the client side of the site.
  async function signIn(page: import("@playwright/test").Page, url: string) {
    await page.goto(url);
    await page.getByLabel("Email or username").fill("priya");
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  test("a client who hasn't started planning lands on the Plan wizard", async ({ page, api }) => {
    await page.route("https://jornaevents.com/client/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "client app" }),
    );
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser());
    api.error("GET", "/vendors/me", 404, "Vendor profile not found for this user");
    api.get("/bundles", []);
    api.get("/events", []);

    await signIn(page, "login/");

    await expect(page).toHaveURL("https://jornaevents.com/client/plan/");
  });

  test("a client with a plan lands on their dashboard", async ({ page, api }) => {
    await page.route("https://jornaevents.com/client/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "client app" }),
    );
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser());
    api.error("GET", "/vendors/me", 404, "Vendor profile not found for this user");
    api.get("/bundles", [{ bundle_id: "b1" }]);
    api.get("/events", []);

    await signIn(page, "login/");

    await expect(page).toHaveURL("https://jornaevents.com/client/bundles/");
  });

  test("a vendor-side sign-in with no vendor profile yet finishes setup", async ({ page, api }) => {
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser());
    api.error("GET", "/vendors/me", 404, "Vendor profile not found for this user");
    api.get("/vendors/categories", { categories: [] });
    api.get("/bundles", []);

    await signIn(page, "login/?role=vendor");

    await expect(page).toHaveURL(/\/app\/vendor-onboarding\/?$/);
  });

  test("a sign-in handed over from the client app goes back to its page", async ({ page, api }) => {
    await page.route("https://jornaevents.com/client/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "client app" }),
    );
    await page.route("http://localhost:*/client/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "client app" }),
    );
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser());

    await signIn(page, "login/?next=%2Fclient%2Fbundle%2F%3Fid%3Db1");

    await expect(page).toHaveURL(/\/client\/bundle\/\?id=b1$/);
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

  test("sign-up is a vendor sign-up, and points clients at the client app", async ({ page }) => {
    await page.goto("login/?mode=register");

    await expect(page.getByRole("heading", { name: "Create your vendor account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
    // The design's fields: no username, age or city here (backend #154);
    // where the vendor is based is asked in onboarding.
    await expect(page.getByLabel("Username")).toHaveCount(0);
    await expect(page.getByLabel("Age")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign up as a client" })).toHaveAttribute(
      "href",
      /\/client\/login\/?\?mode=register$/,
    );
  });

  test("signing up sends only name, email, phone and password, then opens onboarding", async ({ page, api }) => {
    api.post("/auth/register", { user_id: "user-1", email: "raj@example.com" });
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser());
    api.error("GET", "/vendors/me", 404, "Not a vendor");
    api.get("/vendors/categories", { categories: [] });
    api.get("/bundles", []);

    await page.goto("login/?mode=register");
    await page.getByLabel("First name").fill("Raj");
    await page.getByLabel("Last name").fill("Mehta");
    await page.getByLabel("Email").fill("raj@example.com");
    await page.getByLabel("Phone").fill("(732) 555-0184");
    await page.getByLabel("Password").fill("Celebrate2025");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/app\/vendor-onboarding\/?$/);
    const [call] = api.requestsTo("POST", "/auth/register");
    expect(call.body).toEqual({
      email: "raj@example.com",
      password: "Celebrate2025",
      f_name: "Raj",
      l_name: "Mehta",
      phone: "(732) 555-0184",
    });
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
