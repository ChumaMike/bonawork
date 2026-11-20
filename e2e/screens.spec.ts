import { expect, test } from "@playwright/test";
import {
  accounts,
  expectNoSidewaysScroll,
  settled,
  shot,
  signIn,
  viewports,
  warmUpRoutes,
  watchErrors,
} from "./support";

warmUpRoutes();

/** Every major screen, rendered at phone, tablet and desktop widths. */
const screens: { name: string; path: string; as?: string }[] = [
  { name: "01-landing", path: "/" },
  { name: "02-schools", path: "/schools" },
  { name: "03-school", path: "/schools/thuto-lesedi-primary" },
  { name: "04-issues-feed", path: "/issues" },
  { name: "05-issue-being-addressed", path: "/issues/issue-118" },
  { name: "06-issue-repair-claimed", path: "/issues/issue-124" },
  { name: "07-issue-verified", path: "/issues/issue-97" },
  { name: "08-issue-disputed", path: "/issues/issue-102" },
  { name: "09-add-evidence", path: "/issues/issue-118/evidence" },
  { name: "10-report-start", path: "/report" },
  { name: "11-track", path: "/track" },
  { name: "12-assistant", path: "/assistant" },
  { name: "13-admin-dashboard", path: "/admin", as: accounts.admin },
  { name: "14-reviewer-dashboard", path: "/reviewer", as: accounts.reviewer },
  { name: "15-verify", path: "/verify" },
  { name: "16-sign-in", path: "/sign-in" },
  { name: "17-admin-signed-out", path: "/admin" },
  { name: "18-issue-declined", path: "/issues/issue-126" },
];

for (const viewport of viewports) {
  for (const screen of screens) {
    test(`${screen.name} at ${viewport.width}px`, async ({ page }) => {
      const problems = watchErrors(page);
      await page.setViewportSize(viewport);
      if (screen.as) {
        await signIn(page, screen.as, screen.path);
      } else {
        await page.goto(screen.path);
        await settled(page);
      }

      await expect(page.getByTestId("preview-banner")).toBeVisible();
      await expectNoSidewaysScroll(page);
      await shot(page, screen.name, viewport);
      expect(problems, "no console or page errors").toEqual([]);
    });
  }
}

test("phone navigation is shown on phones and the header links on desktop", async ({
  page,
}) => {
  await page.setViewportSize(viewports[0]);
  await page.goto("/");
  const phoneNav = page.getByTestId("bottom-nav");
  await expect(phoneNav.getByRole("link", { name: "Report", exact: true })).toBeVisible();
  // Three items only: Bona AI moved to the floating Bona buddy.
  await expect(phoneNav.getByRole("link")).toHaveCount(3);
  await expect(phoneNav.getByRole("link", { name: "My reports" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bona buddy/ })).toBeVisible();

  // Tablets keep the thumb-reachable navigation; the header links start at desktop width.
  await page.setViewportSize(viewports[1]);
  await expect(phoneNav).toBeVisible();

  await page.setViewportSize(viewports[2]);
  await expect(phoneNav).toBeHidden();
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Issues" }),
  ).toBeVisible();
});

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: "ok", service: "bona" });
});
