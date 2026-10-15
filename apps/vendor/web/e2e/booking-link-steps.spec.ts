import { test, expect, pastLinkSteps } from "./support/fixtures";

// The client's link as steps (lib/linkSteps): email, their details, the
// contract — where they can ask for changes — then their signature.
test.describe("client link steps", () => {
  const booking = (overrides: Record<string, unknown> = {}) => ({
    booking_id: "c-1",
    vendor_display_name: "Priya Lens",
    service_name: "Wedding photography",
    status: "approved",
    contract_status: "viewed",
    date_iso: "2030-06-25",
    time_start: "10:00",
    time_end: "22:00",
    location: "TBD",
    guest_count: null,
    amount_cents: 600000,
    signed_at: null,
    payment_status: "unpaid",
    guest_name: "Asha Mehta",
    guest_email: "asha@example.com",
    revision: 2,
    ...overrides,
  });

  test("a first visit gives an email, then details, then reads the contract — and a return visit starts there", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", booking());
    api.patch("/guest-bookings/tok-1", booking({ guest_email: "asha.m@example.com" }));

    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByText("Where should we send your copy?")).toBeVisible();
    // Nothing of the contract yet, and no jumping ahead.
    await expect(page.getByText("What you're agreeing to")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Steps" }).getByRole("button")).toHaveCount(0);

    const email = page.getByLabel("Your email");
    await expect(email).toHaveValue("asha@example.com");
    await email.fill("asha.m@example.com");
    await expect(page.getByText("Priya Lens had asha@example.com. They'll see you changed it.")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByLabel("Your full name")).toHaveValue("Asha Mehta");
    expect(api.requestsTo("PATCH", "/guest-bookings/tok-1")[0].body).toEqual({ guest_email: "asha.m@example.com" });
    await page.getByLabel("Phone (optional)").fill("732 555 0100");
    await page.getByLabel("Venue address").fill("The Grand Hall");
    await page.getByRole("button", { name: "Continue to the contract" }).click();

    await expect(page.getByRole("button", { name: "Looks good — sign it" })).toBeVisible();
    expect(api.requestsTo("PATCH", "/guest-bookings/tok-1")[1].body).toEqual({
      guest_name: "Asha Mehta",
      guest_phone: "732 555 0100",
      location: "The Grand Hall",
      guest_count: null,
    });

    await page.reload();
    await expect(page.getByRole("button", { name: "Looks good — sign it" })).toBeVisible();
    await expect(page.getByText("Where should we send your copy?")).toHaveCount(0);
  });

  test("an email that can't be right is caught before it's saved, and an unchanged one isn't saved again", async ({ page, api }) => {
    api.get("/guest-bookings/tok-2", booking({ guest_email: null }));
    api.patch("/guest-bookings/tok-2", booking());

    await page.goto("booking-link/?t=tok-2");
    await page.getByLabel("Your email").fill("asha@example");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter the email you'd like your copy sent to." })).toBeVisible();
    expect(api.requestsTo("PATCH", "/guest-bookings/tok-2")).toHaveLength(0);

    await page.getByLabel("Your email").fill("asha@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Your full name")).toBeVisible();

    // Back keeps what they typed, and going forward again saves nothing new.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByLabel("Your email")).toHaveValue("asha@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    expect(api.requestsTo("PATCH", "/guest-bookings/tok-2")).toHaveLength(1);
  });

  test("a name is needed before the contract", async ({ page, api }) => {
    api.get("/guest-bookings/tok-3", booking({ guest_name: null }));

    await page.goto("booking-link/?t=tok-3");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue to the contract" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Add your full name." })).toBeVisible();
  });

  test("the contract's steps can be revisited from the step bar", async ({ page, api }) => {
    api.get("/guest-bookings/tok-4", booking());
    await pastLinkSteps(page, "tok-4");

    await page.goto("booking-link/?t=tok-4");
    await page.getByRole("button", { name: "Looks good — sign it" }).click();
    await expect(page.getByPlaceholder("Type your full name to sign")).toBeVisible();
    await page.getByRole("navigation", { name: "Steps" }).getByRole("button", { name: /Details/ }).click();
    await expect(page.getByLabel("Your full name")).toHaveValue("Asha Mehta");
  });
});
