import { test, expect, loginAs } from "./support/fixtures";
import { MOCK_API_BASE } from "./support/api-base";

// While a vendor page's data is on its way, it shows its own heading and the
// shape of what's coming (components/vendor/PageSkeleton), not a bare
// "Loading…".
const PAGES = [
  { path: "leads", title: "Leads", status: "Loading your leads…" },
  { path: "my-bookings", title: "Bookings", status: "Loading your bookings…" },
  { path: "contracts", title: "Contracts", status: "Loading your contracts…" },
  { path: "my-calendar", title: "Calendar", status: "Loading your calendar…" },
  { path: "my-earnings", title: "Earnings", status: "Loading your earnings…" },
  { path: "settings", title: "Settings", status: "Loading how clients pay you…" },
  { path: "vendor-profile", title: "Vendor profile", status: "Loading your profile…" },
];

test.describe("vendor pages while they load", () => {
  for (const p of PAGES) {
    test(`${p.title} shows its heading and placeholders`, async ({ page, api }) => {
      await loginAs(page, api);
      // Everything but the session is held, so the page stays loading.
      await page.route(`${MOCK_API_BASE}/**`, (route) =>
        new URL(route.request().url()).pathname === "/me" ? route.fallback() : new Promise<void>(() => {}),
      );

      await page.goto(`${p.path}/`);

      await expect(page.getByRole("heading", { name: p.title, level: 1 })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: p.status })).toBeAttached();
      await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
    });
  }
});
