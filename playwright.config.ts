import { defineConfig, devices } from "@playwright/test";

/**
 * Local browsers may already exist when the Playwright CDN is unreachable;
 * point this at a Chromium binary to reuse it instead of downloading one.
 */
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    ...(chromiumExecutable
      ? { launchOptions: { executablePath: chromiumExecutable } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @nama/api dev",
      url: "http://localhost:3001/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @nama/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // SSE opens one HTTP stream per subscription (TD-060); six live widgets
      // exhaust the browser's HTTP/1.1 per-origin connections and later API
      // calls never leave the queue. Run the documented WebSocket transport.
      env: { NEXT_PUBLIC_NAMA_WS_URL: "ws://localhost:3001" },
    },
  ],
});
