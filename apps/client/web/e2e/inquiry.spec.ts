import { test, expect } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { ApiMock } from "./support/api-mock";

// The public inquiry form (backend DECISIONS #32): the link a vendor shares,
// /inquire, and "Send an inquiry" on their page. Works signed out.
const VENDOR = mockVendorDetail({ user_id: "vendor-user-1", f_name: "Arjun", l_name: "Kapoor", location: "Edison, NJ", pfp_url: null });

function mockVendor(api: ApiMock) {
  api.get("/vendors/vendor-1", VENDOR);
}

test.describe("inquiry form", () => {
  test("a signed-out visitor sends one from the shared link", async ({ page, api }) => {
    mockVendor(api);
    api.post("/vendors/vendor-1/inquiries", { received: true, vendor_name: "Arjun Kapoor" });

    await page.goto("inquire/?vendor=vendor-1");
    await expect(page.getByRole("heading", { name: "Ask Arjun Kapoor" })).toBeVisible();
    await page.getByLabel("Your name").fill("Neha Patel");
    await page.getByLabel("Email").fill("neha@example.com");
    await page.getByLabel("What's the event? (optional)").fill("Sangeet");
    await page.getByLabel("Rough guest count (optional)").fill("180");
    await page.getByLabel("Message (optional)").fill("Looking for sangeet coverage in Edison.");
    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page.getByRole("status")).toContainText("Arjun Kapoor will reply to neha@example.com.");
    const [sent] = api.requestsTo("POST", "/vendors/vendor-1/inquiries");
    expect(sent.body).toMatchObject({
      name: "Neha Patel",
      email: "neha@example.com",
      event_type: "Sangeet",
      guest_count: 180,
      note: "Looking for sangeet coverage in Edison.",
      event_date_iso: null,
      phone: null,
      website: "",
    });
  });

  test("a missing email is said under the field, and nothing is sent", async ({ page, api }) => {
    mockVendor(api);
    await page.goto("inquire/?vendor=vendor-1");
    await page.getByLabel("Your name").fill("Neha Patel");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("Add your email so they can reply")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    expect(api.requestsTo("POST", "/vendors/vendor-1/inquiries")).toHaveLength(0);
  });

  test("the server's refusal lands under the field it's about, and what was typed stays", async ({ page, api }) => {
    mockVendor(api);
    api.error("POST", "/vendors/vendor-1/inquiries", 422, "That phone number doesn't look right — check it, or leave it blank");
    await page.goto("inquire/?vendor=vendor-1");
    await page.getByLabel("Your name").fill("Neha Patel");
    await page.getByLabel("Email").fill("neha@example.com");
    await page.getByLabel("Phone (optional)").fill("12");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByLabel("Phone (optional)")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("That phone number doesn't look right")).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveValue("Neha Patel");
  });

  test("a vendor's daily cap is said in their words", async ({ page, api }) => {
    mockVendor(api);
    api.error("POST", "/vendors/vendor-1/inquiries", 429, "Arjun Kapoor has had a lot of inquiries today — try again tomorrow");
    await page.goto("inquire/?vendor=vendor-1");
    await page.getByLabel("Your name").fill("Neha Patel");
    await page.getByLabel("Email").fill("neha@example.com");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "try again tomorrow" })).toBeVisible();
  });

  test("an unknown vendor's link says so", async ({ page, api }) => {
    api.error("GET", "/vendors/nope", 404, "Vendor not found");
    await page.goto("inquire/?vendor=nope");
    await expect(page.getByRole("heading", { name: "We couldn't find that vendor" })).toBeVisible();
  });

  test("on the vendor's page it opens in a sheet, filled in for a signed-in client", async ({ page, api }) => {
    await loginAs(page, api);
    mockVendor(api);
    api.get("/services", { items: [], total: 0, limit: 50, offset: 0 });
    api.get("/reviews/vendor/vendor-1", { items: [], total: 0, limit: 50, offset: 0 });
    api.post("/vendors/vendor-1/inquiries", { received: true, vendor_name: "Arjun Kapoor" });

    await page.goto("vendor/?id=vendor-1");
    await page.getByRole("button", { name: "Send an inquiry" }).click();
    const sheet = page.getByRole("dialog", { name: "Send Arjun Kapoor an inquiry" });
    await expect(sheet.getByLabel("Your name")).toHaveValue("Priya Shah");
    await expect(sheet.getByLabel("Email")).toHaveValue("priya@example.com");
    await sheet.getByRole("button", { name: "Send inquiry" }).click();
    await expect(sheet.getByRole("status")).toContainText("will reply to priya@example.com");
  });
});
