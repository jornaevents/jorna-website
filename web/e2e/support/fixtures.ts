import { test as base, expect, type Page } from "@playwright/test";
import { ApiMock } from "./api-mock";
import { mockTokenPair, mockUser } from "./mock-data";

export const test = base.extend<{ api: ApiMock }>({
  // Second param renamed from Playwright's usual "use" — eslint's
  // react-hooks plugin treats any identifier starting with "use" as a hook
  // call, which misfires here since this file has nothing to do with React.
  api: async ({ page }, provide) => {
    const api = new ApiMock(page);
    await api.install();
    await provide(api);
  },
});

export { expect };

/**
 * Seeds a signed-in session without driving the real login form: writes the
 * token pair auth.tsx reads on boot (see ACCESS_KEY/REFRESH_KEY in
 * web/src/lib/auth.tsx) via an init script, and registers the /me response
 * the AuthProvider fetches to hydrate `user`. Call before the first
 * page.goto() in a test — addInitScript only affects documents navigated to
 * afterwards.
 */
export async function loginAs(page: Page, api: ApiMock, user = mockUser()) {
  const tokens = mockTokenPair();
  await page.addInitScript((t) => {
    window.localStorage.setItem("jorna_access", t.access_token);
    window.localStorage.setItem("jorna_refresh", t.refresh_token);
  }, tokens);
  api.get("/me", user);
  return user;
}
