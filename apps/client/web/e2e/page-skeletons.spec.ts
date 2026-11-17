import { test, expect, loginAs } from "./support/fixtures";
import { MOCK_API_BASE } from "./support/api-base";

// While a page's data is on its way, it shows the shape of what's coming
// (components/Skeletons) and says what's loading, not a bare "Loading…".
const PAGES = [
  { path: "bundles/", status: "Loading your events…" },
  { path: "event/?id=event-1", status: "Loading your event…" },
  { path: "messages/", status: "Loading your messages…" },
  { path: "conversation/?id=c1", status: "Loading the conversation…" },
  { path: "vendor/?id=vendor-1", status: "Loading the vendor…" },
  { path: "service/?id=svc-1", status: "Loading the package…" },
  { path: "contract/?id=b1", status: "Loading the contract…" },
  { path: "compare/", status: "Loading your saved packages…" },
  { path: "activity/", status: "Loading what needs you…" },
  { path: "suggest/?event=event-1", status: "Loading your event…" },
  { path: "bundle/?id=bundle-1", status: "Loading your plan…" },
];

test.describe("client pages while they load", () => {
  for (const p of PAGES) {
    test(`${p.path} shows its placeholders`, async ({ page, api }) => {
      await loginAs(page, api);
      // Everything but the session is held, so the page stays loading.
      await page.route(`${MOCK_API_BASE}/**`, (route) =>
        new URL(route.request().url()).pathname === "/me" ? route.fallback() : new Promise<void>(() => {}),
      );

      await page.goto(p.path);

      await expect(page.getByRole("status").filter({ hasText: p.status }).first()).toBeAttached();
      await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
    });
  }
});
