import { defineConfig } from "@playwright/test";

/**
 * Browser run of the demo against a LIVE deployment (no dev server is started).
 *
 *   LIVE_BASE_URL=https://bona-….vercel.app pnpm e2e:live
 */
const baseURL = process.env.LIVE_BASE_URL;
if (!baseURL) throw new Error("Set LIVE_BASE_URL to the deployment under test.");

export default defineConfig({
  testDir: "e2e/live",
  reporter: "list",
  workers: 1,
  retries: 0,
  use: { baseURL, channel: "chrome" },
});
