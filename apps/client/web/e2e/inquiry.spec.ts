import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockTokenPair, mockUser, mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// The inquiry form (backend DECISIONS #32, #45, #47): the link a vendor
// shares, /inquire, and "Send an inquiry" on their page. Anyone can fill it
// in; sending needs a client account with a confirmed email, a package and a
// date, and what was typed waits through sign-up. What the event is and where
// are required too, and a guest count for a per-guest package (#52).
const VENDOR = mockVendorDetail({ user_id: "vendor-user-1", f_name: "Arjun", l_name: "Kapoor", location: "Edison, NJ", pfp_url: null });

const PACKAGE = { service_id: "svc-1", name: "Sangeet coverage", vendor_id: "vendor-1", price: 2500, price_unit: "event" };

/** The vendor and their packages — one by default, which the form picks for you. */
function mockVendor(api: ApiMock, packages: unknown[] = [PACKAGE]) {
  api.get("/vendors/vendor-1", VENDOR);
  api.get("/services", { items: packages, total: packages.length, limit: 50, offset: 0 });
}

const DATE = "2027-05-14";

const SENT = { received: true, vendor_name: "Arjun Kapoor", conversation_id: "conv-1" };

/** What every inquiry needs besides the package: when, what and where. */
async function fillRequired(scope: import("@playwright/test").Page | import("@playwright/test").Locator) {
  await scope.getByLabel("Event date").fill(DATE);
  await scope.getByLabel("What's the event?").fill("Sangeet");
  await scope.getByLabel("City & state").fill("Edison, NJ");
}

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
    // No phone: the vendor replies in the thread.
    await expect(page.getByLabel(/Phone/)).toHaveCount(0);
    // Their only package is already picked.
    await expect(page.getByLabel("Package")).toHaveValue("svc-1");
    await fillRequired(page);
    await page.getByLabel("Guest count (optional)").fill("180");
    await page.getByLabel("Message (optional)").fill("Looking for sangeet coverage in Edison.");
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page.getByRole("status")).toContainText("Arjun Kapoor will reply in your messages");
    await expect(page.getByRole("link", { name: "Open the conversation" })).toHaveAttribute("href", /conversation\/?\?id=conv-1$/);
    const [sent] = api.requestsTo("POST", "/vendors/vendor-1/inquiries");
    expect(sent.body).toEqual({
      event_date_iso: DATE,
      event_type: "Sangeet",
      location_kind: "city",
      location_street: null,
      location_city: "Edison",
      location_state: "NJ",
      location_zip: null,
      service_id: "svc-1",
      guest_count: 180,
      note: "Looking for sangeet coverage in Edison.",
      website: "",
    });
  });

  test("one of the client's events fills the form, and times go with it when both are given", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api);
    api.get("/events", [
      { event_id: "ev-1", name: "Meera's Sangeet", date_iso: DATE, location: "Edison, NJ", event_type: "Sangeet", guest_count: 180 },
      { event_id: "ev-old", name: "Last year's party", date_iso: "2020-01-01", location: "Edison, NJ" },
    ]);
    api.post("/vendors/vendor-1/inquiries", SENT);

    await page.goto("inquire/?vendor=vendor-1");
    const picker = page.getByLabel("Which event is this for?");
    // A past event isn't offered.
    await expect(picker.locator("option")).toHaveText(["Pick one of your events, or fill it in below", "Meera's Sangeet"]);
    await picker.selectOption("ev-1");
    await expect(page.getByLabel("Event date")).toHaveValue("May 14, 2027");
    await expect(page.getByLabel("What's the event?")).toHaveValue("Sangeet");
    await expect(page.getByLabel("City & state")).toHaveValue("Edison, NJ");
    await expect(page.getByLabel("Guest count (optional)")).toHaveValue("180");

    // Half a range says so, and nothing is sent.
    const start = (part: string) => page.getByLabel(`Starts (optional) — ${part}`);
    const end = (part: string) => page.getByLabel(`Ends (optional) — ${part}`);
    await start("hour").selectOption("4");
    await start("minute").selectOption("00");
    await start("hour").locator("xpath=ancestor::div[1]").getByRole("button", { name: "PM", exact: true }).click();
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("Add both a start and an end time, or leave both out")).toBeVisible();
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")).toHaveLength(0);

    await end("hour").selectOption("10");
    await end("minute").selectOption("30");
    await end("hour").locator("xpath=ancestor::div[1]").getByRole("button", { name: "PM", exact: true }).click();
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page.getByRole("status")).toContainText("Arjun Kapoor will reply in your messages");
    const [sent] = api.requestsTo("POST", "/vendors/vendor-1/inquiries");
    expect(sent.body).toMatchObject({ event_date_iso: DATE, guest_count: 180, time_start: "16:00", time_end: "22:30" });
  });

  test("with several packages one has to be picked, and a date, the event and a place given", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api, [PACKAGE, { ...PACKAGE, service_id: "svc-2", name: "Full wedding day" }]);
    api.post("/vendors/vendor-1/inquiries", SENT);

    await page.goto("inquire/?vendor=vendor-1");
    const pick = page.getByLabel("Package");
    await expect(pick.locator("option")).toHaveText(["Choose a package", "Sangeet coverage", "Full wedding day"]);
    await expect(pick).toHaveValue("");

    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("Pick the package you're asking about")).toBeVisible();
    await expect(page.getByText("Add your event date")).toBeVisible();
    await expect(page.getByText("Add what the event is")).toBeVisible();
    await expect(page.getByText("Pick the city from the list, or type it as City, ST")).toBeVisible();
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")).toHaveLength(0);

    await pick.selectOption({ label: "Full wedding day" });
    await page.getByLabel("Event date").fill(DATE);
    await page.getByLabel("What's the event?").fill("Wedding");
    // A venue is a full address.
    await page.getByRole("radio", { name: "Venue" }).click();
    await page.getByLabel("Street address").fill("1 Oak Tree Rd");
    await page.getByLabel("City", { exact: true }).fill("Edison");
    await page.getByLabel("State", { exact: true }).selectOption("NJ");
    await page.getByLabel("ZIP code").fill("08820");
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page.getByRole("status")).toBeVisible();
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")[0].body).toMatchObject({
      location_kind: "venue",
      location_street: "1 Oak Tree Rd",
      location_city: "Edison",
      location_state: "NJ",
      location_zip: "08820",
      service_id: "svc-2",
      event_date_iso: DATE,
    });
  });

  test("a vendor with no packages listed can't be sent one here", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api, []);

    await page.goto("inquire/?vendor=vendor-1");
    await expect(page.getByText("Arjun Kapoor hasn't listed any packages yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send inquiry" })).toBeDisabled();
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
    await fillRequired(page);
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
    await expect(page.getByLabel("Event date")).toHaveValue("May 14, 2027");
    await expect(page.getByLabel("What's the event?")).toHaveValue("Sangeet");
    await expect(page.getByLabel("City & state")).toHaveValue("Edison, NJ");
    await expect(page.getByLabel("Message (optional)")).toHaveValue("Looking for sangeet coverage in Edison.");
    // Nothing went out on its own.
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")).toHaveLength(0);

    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByRole("status")).toContainText("will reply in your messages");
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")[0].body).toMatchObject({
      event_type: "Sangeet",
      event_date_iso: DATE,
      service_id: "svc-1",
      note: "Looking for sangeet coverage in Edison.",
    });
  });

  test("an account that hasn't confirmed its email confirms it first", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: false }));
    mockVendor(api);
    api.post("/auth/email/send-code", { email_verified: false, sent_to: "p••••@example.com", expires_in_minutes: 10 });

    await page.goto("inquire/?vendor=vendor-1");
    await fillRequired(page);
    await page.getByLabel("Message (optional)").fill("Are you free in March?");
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page).toHaveURL(/\/client\/verify-email\/?\?next=%2Finquire%3Fvendor%3Dvendor-1$/);
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")).toHaveLength(0);
  });

  test("the server's refusal lands under the field it's about, and what was typed stays", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api);
    api.error("POST", "/vendors/vendor-1/inquiries", 422, "Add a guest count — Sangeet coverage is priced per guest");
    await page.goto("inquire/?vendor=vendor-1");
    await fillRequired(page);
    await page.getByLabel("Message (optional)").fill("Hello");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByLabel("Guest count (optional)")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Sangeet coverage is priced per guest")).toBeVisible();
    await expect(page.getByLabel("Message (optional)")).toHaveValue("Hello");
  });

  test("a vendor's daily cap is said in their words", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api);
    api.error("POST", "/vendors/vendor-1/inquiries", 429, "Arjun Kapoor has had a lot of inquiries today — try again tomorrow");
    await page.goto("inquire/?vendor=vendor-1");
    await fillRequired(page);
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
    api.get("/reviews/vendor/vendor-1", { items: [], total: 0, limit: 50, offset: 0 });
    api.post("/vendors/vendor-1/inquiries", SENT);

    await page.goto("vendor/?id=vendor-1");
    await page.getByRole("button", { name: "Get quote" }).click();
    const sheet = page.getByRole("dialog", { name: "Send Arjun Kapoor an inquiry" });
    await expect(sheet.getByText("Sending as Priya Shah")).toBeVisible();
    await fillRequired(sheet);
    await sheet.getByRole("button", { name: "Send inquiry" }).click();
    await expect(sheet.getByRole("status")).toContainText("will reply in your messages");
  });

  test("a package's Send an inquiry on the vendor's page picks that package", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    const OTHER = { ...PACKAGE, service_id: "svc-2", name: "Mehndi coverage" };
    mockVendor(api, [PACKAGE, OTHER]);
    api.get("/reviews/vendor/vendor-1", { items: [], total: 0, limit: 50, offset: 0 });

    await page.goto("vendor/?id=vendor-1");
    await expect(page.getByRole("link", { name: "Book this" })).toHaveCount(0);
    // Each package card holds its own button.
    const card = page.locator(".group").filter({ hasText: "Mehndi coverage" });
    await card.getByRole("button", { name: "Send an inquiry" }).click();
    const sheet = page.getByRole("dialog", { name: "Send Arjun Kapoor an inquiry" });
    await expect(sheet.getByLabel("Package")).toHaveValue("svc-2");
  });

  test("a package priced per guest needs a guest count, and the slider sets it", async ({ page, api }) => {
    await loginAs(page, api, mockUser({ email_verified: true }));
    mockVendor(api, [{ ...PACKAGE, price_unit: "person" }]);
    api.post("/vendors/vendor-1/inquiries", SENT);

    await page.goto("inquire/?vendor=vendor-1");
    await expect(page.getByText("This package is priced per guest")).toBeVisible();
    await fillRequired(page);
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("Add a guest count — this package is priced per guest")).toBeVisible();
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")).toHaveLength(0);

    await page.getByLabel("Guest count slider").fill("250");
    await expect(page.getByLabel("Guest count", { exact: true })).toHaveValue("250");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")[0].body).toMatchObject({ guest_count: 250 });
  });
});
