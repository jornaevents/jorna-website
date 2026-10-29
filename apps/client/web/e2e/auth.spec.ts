import { test, expect, loginAs } from "./support/fixtures";
import { mockBundleDetail, mockTokenPair, mockUser } from "./support/mock-data";

test.describe("authentication", () => {
  test("a client who hasn't started planning signs in and lands on /plan", async ({ page, api }) => {
    const user = mockUser();
    api.post("/auth/login", mockTokenPair());
    api.get("/me", user);
    api.get("/bundles", []);
    api.get("/events", []);

    await page.goto("login/");
    await page.getByLabel("Email or username").fill(user.username);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app\/plan\/?$/);

    const loginCalls = api.requestsTo("POST", "/auth/login");
    expect(loginCalls).toHaveLength(1);
    expect(loginCalls[0].body).toMatchObject({ identifier: user.username });
  });

  // Back at step one of a celebration they'd already planned was the old
  // behavior; a returning client goes to the dashboard (lib/landing.ts).
  test("a client with a plan signs in and lands on the dashboard", async ({ page, api }) => {
    const user = mockUser();
    api.post("/auth/login", mockTokenPair());
    api.get("/me", user);
    api.get("/bundles", [mockBundleDetail()]);
    api.get("/events", []);

    await page.goto("login/");
    await page.getByLabel("Email or username").fill(user.username);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app\/bundles\/?$/);
  });

  test("a sign-in sent from a page goes back to that page, plan or not", async ({ page, api }) => {
    const user = mockUser();
    api.post("/auth/login", mockTokenPair());
    api.get("/me", user);
    api.get("/bundles", [mockBundleDetail()]);
    api.get("/events", []);

    await page.goto("login/?next=/marketplace");
    await page.getByLabel("Email or username").fill(user.username);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app\/marketplace\/?$/);
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

  test("sign-up here is for hosts, and points vendors to jornaevents.com", async ({ page }) => {
    await page.goto("login/?mode=register");

    await expect(page.getByRole("button", { name: /^Vendor/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign up on jornaevents.com" })).toHaveAttribute(
      "href",
      "https://jornaevents.com/app/login?mode=register&role=vendor",
    );
  });

  test("an old become-a-vendor link goes to the vendor site's sign-up", async ({ page }) => {
    await page.route("https://jornaevents.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "vendor site" }),
    );
    await page.goto("login/?mode=register&role=vendor");

    await expect(page).toHaveURL("https://jornaevents.com/app/login?mode=register&role=vendor");
  });

  test("a vendor account signed in here is sent to jornaevents.com", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", { vendor_id: "vendor-1", user_id: "user-1" });
    api.get("/bundles", []);
    api.get("/conversations/unread-count", { unread_count: 0 });

    await page.goto("bundles/");

    await expect(page.getByRole("heading", { name: "This is a vendor account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to jornaevents.com" })).toHaveAttribute(
      "href",
      "https://jornaevents.com/app/overview",
    );
  });

  test("redirects a signed-out visitor away from a protected page, preserving the return path", async ({
    page,
  }) => {
    await page.goto("bundles/");

    await expect(page).toHaveURL(/\/app\/login\/?\?next=\/bundles/);
  });
});
