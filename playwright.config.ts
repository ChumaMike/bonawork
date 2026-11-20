import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  // e2e/live runs against a deployment via playwright.live.config.ts.
  testIgnore: ["**/live/**"],
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    // Uses the locally installed Chrome, so no browser download is needed.
    channel: "chrome",
  },
  webServer: {
    command: "pnpm dev",
    // This suite asserts fixture behaviour; a developer's .env.local may say "live".
    env: { NEXT_PUBLIC_API_SOURCE: "fixtures" },
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
