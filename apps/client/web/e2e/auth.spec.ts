import { test, expect, loginAs } from "./support/fixtures";
import { mockTokenPair, mockUser } from "./support/mock-data";

test.describe("authentication", () => {
  // Signing in is one page for both sides now, on the main site (2026-10-29):
  // this app's sign-in hands off there, keeping where it was headed. Where a
  // client lands after it is the vendor app's e2e/auth.spec.
  test("signing in hands off to the shared sign-in, keeping the page it was headed for", async ({ page }) => {
    await page.route("https://jornaevents.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "shared sign-in" }),
    );
    await page.goto("login/?next=/bundle?id=b1");

    await expect(page).toHaveURL("https://jornaevents.com/app/login/?next=%2Fclient%2Fbundle%2F%3Fid%3Db1");
  });

  test("signing up asks only a name, email and password, then opens the Plan wizard", async ({ page, api }) => {
    api.post("/auth/register", { user_id: "user-1", email: "priya@example.com" });
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser());
    api.get("/bundles", []);
    api.get("/events", []);

    await page.goto("login/?mode=register");
    await expect(page.getByLabel("Username")).toHaveCount(0);
    await expect(page.getByLabel("Age")).toHaveCount(0);
    await page.getByLabel("Email").fill("priya@example.com");
    await page.getByLabel("First name").fill("Priya");
    await page.getByLabel("Last name").fill("Shah");
    await page.getByLabel("Password").fill("Celebrate2025");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/client\/plan\/?$/);
    expect(api.requestsTo("POST", "/auth/register")[0].body).toEqual({
      email: "priya@example.com",
      password: "Celebrate2025",
      f_name: "Priya",
      l_name: "Shah",
    });
  });

  test("sign-up here is for hosts, and points vendors to jornaevents.com", async ({ page }) => {
    await page.goto("login/?mode=register");

    await expect(page.getByRole("button", { name: /^Vendor/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign up on jornaevents.com" })).toHaveAttribute(
      "href",
      "https://jornaevents.com/app/login/?mode=register&role=vendor",
    );
  });

  test("an old become-a-vendor link goes to the vendor site's sign-up", async ({ page }) => {
    await page.route("https://jornaevents.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "vendor site" }),
    );
    await page.goto("login/?mode=register&role=vendor");

    await expect(page).toHaveURL("https://jornaevents.com/app/login/?mode=register&role=vendor");
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
      "https://jornaevents.com/app/overview/",
    );
  });

  test("redirects a signed-out visitor away from a protected page, preserving the return path", async ({
    page,
  }) => {
    await page.route("https://jornaevents.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "shared sign-in" }),
    );
    await page.goto("bundles/");

    // Via this app's sign-in, which hands off to the shared one.
    await expect(page).toHaveURL("https://jornaevents.com/app/login/?next=%2Fclient%2Fbundles%2F");
  });
});
