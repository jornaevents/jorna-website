import { test, expect } from "./support/fixtures";
import { mockTokenPair, mockUser } from "./support/mock-data";

test.describe("authentication", () => {
  test("signs in with a valid identifier/password and lands on /plan", async ({ page, api }) => {
    const user = mockUser();
    api.post("/auth/login", mockTokenPair());
    api.get("/me", user);

    await page.goto("login/");
    await page.getByLabel("Email or username").fill(user.username);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/app\/plan\/?$/);

    const loginCalls = api.requestsTo("POST", "/auth/login");
    expect(loginCalls).toHaveLength(1);
    expect(loginCalls[0].body).toMatchObject({ identifier: user.username });
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

  test("blocks registration until a role (host/vendor) is chosen", async ({ page }) => {
    await page.goto("login/?mode=register");

    const submit = page.getByRole("button", { name: "Create account" });
    await expect(submit).toBeDisabled();

    await page.getByRole("button", { name: /^Host/ }).click();
    await expect(submit).toBeEnabled();
  });

  test("redirects a signed-out visitor away from a protected page, preserving the return path", async ({
    page,
  }) => {
    await page.goto("my-availability/");

    await expect(page).toHaveURL(/\/app\/login\/?\?next=\/my-availability/);
  });
});
