import { test, expect } from "./support/fixtures";
import { mockVendorSearchResponse } from "./support/mock-data";

// Jorna's own calendar (packages/shared/components/DateField), here in
// Explore's Filters: a click opens it, days before today can't be picked,
// a day picked or typed lands in the field, the keyboard works, and Escape
// closes the calendar without closing the dialog around it.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

test("the date field opens Jorna's calendar and takes a picked, keyed or typed day", async ({ page, api }) => {
  api.get("/vendors/search", mockVendorSearchResponse([]));
  await page.goto("marketplace/");
  await page.getByRole("button", { name: /^Filters/ }).click();
  const filters = page.getByRole("dialog", { name: "Filters" });
  const field = filters.getByLabel("Date", { exact: true });

  await field.click();
  const calendar = page.getByRole("dialog", { name: "Choose Date" });
  const now = new Date();
  await expect(calendar.getByRole("grid", { name: `${MONTHS[now.getMonth()]} ${now.getFullYear()}` })).toBeVisible();
  // Before today is out of reach (the filter's min).
  if (now.getDate() > 1) {
    await expect(calendar.getByRole("button", { name: new RegExp(`${MONTHS[now.getMonth()]} 1, ${now.getFullYear()}$`) })).toBeDisabled();
  }

  // Next month, the 15th.
  await calendar.getByRole("button", { name: "Next month" }).click();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  await calendar.getByRole("button", { name: new RegExp(`${MONTHS[next.getMonth()]} 15, ${next.getFullYear()}$`) }).click();
  await expect(calendar).toHaveCount(0);
  await expect(field).toHaveValue(`${MONTHS[next.getMonth()].slice(0, 3)} 15, ${next.getFullYear()}`);

  // Keyboard: open into the grid, a day on, Enter.
  await field.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue(`${MONTHS[next.getMonth()].slice(0, 3)} 16, ${next.getFullYear()}`);

  // Escape closes the calendar, not the Filters around it.
  await field.click();
  await expect(calendar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(filters).toBeVisible();

  // Typed, in the usual US form.
  await field.fill(`12/25/${now.getFullYear() + 1}`);
  await field.blur();
  await expect(field).toHaveValue(`Dec 25, ${now.getFullYear() + 1}`);
});
