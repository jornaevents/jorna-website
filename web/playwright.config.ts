import { defineConfig, devices } from "@playwright/test";
import { MOCK_API_BASE } from "./e2e/support/api-base";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    // Trailing slash matters: relative goto()s like "login/" are resolved
    // against this with plain URL semantics, and a bare "/" would replace
    // the whole /app path instead of extending it.
    baseURL: `http://localhost:${PORT}/app/`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    // Next 16's dev server only trusts the origin it was started against
    // (see allowedDevOrigins) — 127.0.0.1 gets a 403 on every asset even
    // though it's the same machine, so this must be "localhost" too.
    url: `http://localhost:${PORT}/app/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_BASE_URL: MOCK_API_BASE,
    },
  },
});
