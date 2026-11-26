import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, settled, shot, viewports, watchErrors } from "./support";

/**
 * The guided demo's front door: the home page offers it above the fold, and
 * /demo tells the repair's story with the money path before anything starts.
 * Starting the demo is not clicked here: it makes a case, and funding it would
 * spend devnet SOL (scripts and the live suite cover the chain).
 */
for (const viewport of viewports) {
  test(`guided demo entry at ${viewport.width}px`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(viewport);

    await page.goto("/");
    await settled(page);
    const entry = page.getByTestId("try-demo");
    await expect(entry).toBeInViewport();

    await page.goto("/demo");
    await settled(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("toilets leak");
    await expect(page.getByRole("button", { name: /start the demo/i })).toBeVisible();
    await expect(page.getByTestId("money-path")).toBeVisible();
    await expect(page.getByTestId("path-check-1")).toContainText("R3 000");
    await expect(page.getByTestId("path-check-2")).toContainText("R2 000");
    await expect(page.getByTestId("guide-strip")).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await shot(page, "40-demo-start", viewport);
    expect(errors).toEqual([]);
  });
}
