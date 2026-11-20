import { expect, test, type Page } from "@playwright/test";

export const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

export type Viewport = (typeof viewports)[number];

const ROUTES = [
  "/",
  "/schools",
  "/schools/thuto-lesedi-primary",
  "/issues",
  "/issues/issue-118",
  "/issues/issue-118/evidence",
  "/report",
  "/receipts/BB-2026-000118",
  "/track",
  "/assistant",
  "/admin",
  "/reviewer",
  "/verify",
  "/sign-in",
];

/**
 * The dev server compiles each route the first time it is requested, and
 * reloads open pages while it does. Requesting every route once before the
 * tests start keeps that out of the tests themselves.
 */
export function warmUpRoutes() {
  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(300_000);
    const context = await playwright.request.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
    for (const route of ROUTES) await context.get(route, { timeout: 120_000 });
    await context.dispose();
  });
}

/** Fixture references use the current year, exactly as the seed data does. */
export const reference = (number: number) =>
  `BB-${new Date().getUTCFullYear()}-${String(number).padStart(6, "0")}`;

/** Collects console and page errors so a test can assert there were none. */
export function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

/** Wait until the screen is interactive, has its heading and no loading placeholders. */
export async function settled(page: Page) {
  // Generous first wait: the dev server compiles each route the first time it is opened.
  const timeout = 30_000;
  if (new URL(page.url()).pathname !== "/") {
    await expect(page.getByTestId("hydrated").first()).toBeAttached({ timeout });
  }
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout });
  await expect(page.locator("main [role=status]:visible")).toHaveCount(0);
}

export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

export async function shot(
  page: Page,
  name: string,
  viewport: Viewport,
  { fullPage = true }: { fullPage?: boolean } = {},
) {
  // Hide the Next.js dev badge and start from the top so the sticky header sits where it belongs.
  // In a full-page capture the things fixed to the viewport (the phone navigation and
  // the pinned report button) are moved to the end of the page, and the floating
  // Bona buddy is hidden, so they do not cut across the content.
  await page.addStyleTag({
    content:
      "nextjs-portal { display: none !important; }" +
      (fullPage
        ? "body { position: relative; } [data-testid=bottom-nav], [data-testid=report-action] { position: absolute !important; } [data-testid=bona-buddy] { display: none !important; }"
        : ""),
  });
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `docs/screenshots/frontend/${name}-${viewport.width}-${viewport.name}.png`,
    fullPage,
    // Leave the text caret alone: hiding it writes an inline style onto inputs.
    caret: "initial",
  });
}

/**
 * Sign-in accounts. The defaults are the fixture accounts; set the E2E_*
 * variables to run the same specs against a backend with seeded accounts.
 */
export const accounts = {
  admin: process.env.E2E_ADMIN_EMAIL ?? "admin@khanyisa.demo",
  reviewer: process.env.E2E_REVIEWER_EMAIL ?? "reviewer@district.demo",
  reporter: process.env.E2E_REPORTER_EMAIL ?? "parent@community.demo",
};
const password = process.env.E2E_PASSWORD;

/** Sign in through the real form with one of the preview accounts, then land on `next`. */
export async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await settled(page);
  // Already signed in as someone else: sign out first to get the form.
  const account = page.getByTestId("account");
  if (await account.isVisible()) {
    await account.getByRole("button", { name: "Sign out" }).click();
  }
  if (password) {
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  } else {
    // Fixture mode: one tap on the demo account card signs in as that person.
    await page.getByRole("button", { name: new RegExp(email) }).click();
  }
  await page.waitForURL((url) => url.pathname === next);
  await settled(page);
}

export const photo = (content: string) => ({
  name: "problem-photo.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from(content),
});
