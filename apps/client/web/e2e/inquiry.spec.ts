import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockTokenPair, mockUser, mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// The inquiry form (backend DECISIONS #32, #45): the link a vendor shares,
// /inquire, and "Send an inquiry" on their page. Anyone can fill it in;
// sending needs a client account with a confirmed email, and what was typed
// waits through sign-up.
const VENDOR = mockVendorDetail({ user_id: "vendor-user-1", f_name: "Arjun", l_name: "Kapoor", location: "Edison, NJ", pfp_url: null });

function mockVendor(api: ApiMock) {
  api.get("/vendors/vendor-1", VENDOR);
}

const SENT = { received: true, vendor_name: "Arjun Kapoor", conversation_id: "conv-1" };

test.describe("inquiry form", () => {
  test("a signed-in client sends one as their account and is pointed to the thread", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true, phone: "(732) 555-0100" }));
    mockVendor(api);
    api.post("/vendors/vendor-1/inquiries", SENT);

    await page.goto("inquire/?vendor=vendor-1");
    await expect(page.getByRole("heading", { name: "Ask Arjun Kapoor" })).toBeVisible();
    await expect(page.getByText("Sending as Priya Shah · priya@example.com.")).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(page.getByLabel("Phone (optional)")).toHaveValue("(732) 555-0100");
    await page.getByLabel("What's the event? (optional)").fill("Sangeet");
    await page.getByLabel("Rough guest count (optional)").fill("180");
    await page.getByLabel("Message (optional)").fill("Looking for sangeet coverage in Edison.");
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page.getByRole("status")).toContainText("Arjun Kapoor will reply in your messages");
    await expect(page.getByRole("link", { name: "Open the conversation" })).toHaveAttribute("href", /conversation\/?\?id=conv-1$/);
    const [sent] = api.requestsTo("POST", "/vendors/vendor-1/inquiries");
    expect(sent.body).toEqual({
      phone: "(732) 555-0100",
      event_date_iso: null,
      event_type: "Sangeet",
      event_location: null,
      service_id: null,
      guest_count: 180,
      note: "Looking for sangeet coverage in Edison.",
      website: "",
    });
  });

  test("it can say where the event is and which package, or not sure yet", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api);
    api.get("/services", {
      items: [
        { service_id: "svc-1", name: "Sangeet coverage", vendor_id: "vendor-1", price: 2500, price_unit: "event" },
        { service_id: "svc-2", name: "Full wedding day", vendor_id: "vendor-1", price: 6000, price_unit: "event" },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
    api.post("/vendors/vendor-1/inquiries", SENT);

    await page.goto("inquire/?vendor=vendor-1");
    const pick = page.getByLabel("Package (optional)");
    await expect(pick).toHaveValue("");
    await expect(pick.locator("option")).toHaveText(["Not sure yet", "Sangeet coverage", "Full wedding day"]);
    await pick.selectOption({ label: "Full wedding day" });
    await page.getByLabel("Where's the event? (optional)").fill("Oak Tree Manor, Edison");
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page.getByRole("status")).toBeVisible();
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")[0].body).toMatchObject({
      event_location: "Oak Tree Manor, Edison",
      service_id: "svc-2",
    });
  });

  test("signed out, it's kept through sign-up and the code, then sent from the same form", async ({ page, api }) => {
    mockVendor(api);
    api.post("/auth/register", { user_id: "user-1", email: "priya@example.com" });
    api.post("/auth/login", mockTokenPair());
    api.get("/me", mockUser({ email_verified: false }));
    api.post("/auth/email/send-code", { email_verified: false, sent_to: "p••••@example.com", expires_in_minutes: 10 });
    api.post("/auth/email/verify", { email_verified: true, email: "priya@example.com" });
    api.post("/vendors/vendor-1/inquiries", SENT);

    await page.goto("inquire/?vendor=vendor-1");
    await page.getByLabel("What's the event? (optional)").fill("Sangeet");
    await page.getByLabel("Message (optional)").fill("Looking for sangeet coverage in Edison.");
    await page.getByRole("button", { name: "Create an account to send" }).click();

    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await page.getByLabel("Email").fill("priya@example.com");
    await page.getByLabel("First name").fill("Priya");
    await page.getByLabel("Last name").fill("Shah");
    await page.getByLabel("Password").fill("Celebrate2025");
    await page.getByLabel(/I agree to the Terms of Service/).check();
    await page.getByRole("button", { name: "Create account" }).click();

    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Confirm email" }).click();

    await expect(page).toHaveURL(/\/client\/inquire\/?\?vendor=vendor-1$/);
    await expect(page.getByLabel("What's the event? (optional)")).toHaveValue("Sangeet");
    await expect(page.getByLabel("Message (optional)")).toHaveValue("Looking for sangeet coverage in Edison.");
    // Nothing went out on its own.
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")).toHaveLength(0);

    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByRole("status")).toContainText("will reply in your messages");
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")[0].body).toMatchObject({
      event_type: "Sangeet",
      note: "Looking for sangeet coverage in Edison.",
    });
  });

  test("an account that hasn't confirmed its email confirms it first", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: false }));
    mockVendor(api);
    api.post("/auth/email/send-code", { email_verified: false, sent_to: "p••••@example.com", expires_in_minutes: 10 });

    await page.goto("inquire/?vendor=vendor-1");
    await page.getByLabel("Message (optional)").fill("Are you free in March?");
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page).toHaveURL(/\/client\/verify-email\/?\?next=%2Finquire%3Fvendor%3Dvendor-1$/);
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")).toHaveLength(0);
  });

  test("the server's refusal lands under the field it's about, and what was typed stays", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api);
    api.error("POST", "/vendors/vendor-1/inquiries", 422, "That phone number doesn't look right — check it, or leave it blank");
    await page.goto("inquire/?vendor=vendor-1");
    await page.getByLabel("Phone (optional)").fill("12");
    await page.getByLabel("Message (optional)").fill("Hello");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByLabel("Phone (optional)")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("That phone number doesn't look right")).toBeVisible();
    await expect(page.getByLabel("Message (optional)")).toHaveValue("Hello");
  });

  test("a vendor's daily cap is said in their words", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api);
    api.error("POST", "/vendors/vendor-1/inquiries", 429, "Arjun Kapoor has had a lot of inquiries today — try again tomorrow");
    await page.goto("inquire/?vendor=vendor-1");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "try again tomorrow" })).toBeVisible();
  });

  test("an unknown vendor's link says so", async ({ page, api }) => {
    api.error("GET", "/vendors/nope", 404, "Vendor not found");
    await page.goto("inquire/?vendor=nope");
    await expect(page.getByRole("heading", { name: "We couldn't find that vendor" })).toBeVisible();
  });

  test("on the vendor's page it opens in a sheet for a signed-in client", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api);
    api.get("/services", { items: [], total: 0, limit: 50, offset: 0 });
    api.get("/reviews/vendor/vendor-1", { items: [], total: 0, limit: 50, offset: 0 });
    api.post("/vendors/vendor-1/inquiries", SENT);

    await page.goto("vendor/?id=vendor-1");
    await page.getByRole("button", { name: "Send an inquiry" }).click();
    const sheet = page.getByRole("dialog", { name: "Send Arjun Kapoor an inquiry" });
    await expect(sheet.getByText("Sending as Priya Shah")).toBeVisible();
    await sheet.getByRole("button", { name: "Send inquiry" }).click();
    await expect(sheet.getByRole("status")).toContainText("will reply in your messages");
  });
});
