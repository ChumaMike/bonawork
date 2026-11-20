import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, settled, warmUpRoutes } from "./support";

/**
 * Accessibility guardrails for the pages everyone passes through. Runs axe
 * (WCAG 2.x A/AA rules) at phone and desktop width, then checks the three
 * things axe cannot: reduced motion, 200 % zoom and the minimum body size.
 */

const routes = ["/", "/report", "/issues", "/sign-in"] as const;
const widths = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

warmUpRoutes();

for (const route of routes) {
  for (const size of widths) {
    test(`${route} has no axe violations at ${size.name} width`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(route);
      await settled(page);
      const results = await new AxeBuilder({ page })
        .withTags([
          "wcag2a",
          "wcag2aa",
          "wcag21a",
          "wcag21aa",
          "wcag22aa",
          "best-practice",
        ])
        // The Next.js development overlay is not part of the product.
        .exclude("nextjs-portal")
        .analyze();
      const summary = results.violations.map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`,
      );
      expect(summary, summary.join("\n\n")).toEqual([]);
    });
  }
}

test("body text is at least 16 px on a phone", async ({ page }) => {
  await page.setViewportSize(widths[0]);
  await page.goto("/");
  await settled(page);
  const size = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.body).fontSize),
  );
  expect(size).toBeGreaterThanOrEqual(16);
});

test("the home page still fits at 200% zoom on a phone", async ({ page }) => {
  await page.setViewportSize(widths[0]);
  await page.goto("/");
  await settled(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("zoom", "2");
  });
  await expectNoSidewaysScroll(page);
  // The main actions are still reachable.
  await expect(
    page.getByTestId("bottom-nav").getByRole("link", { name: "Report", exact: true }),
  ).toBeVisible();
});

test("reduced motion stops every animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(widths[0]);
  await page.goto("/");
  await settled(page);
  const running = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const style = getComputedStyle(element);
      if (style.animationName !== "none" && parseFloat(style.animationDuration) > 0.001) {
        offenders.push(`${element.tagName.toLowerCase()}.${element.className}`);
      }
      if (
        style.transitionProperty !== "none" &&
        parseFloat(style.transitionDuration) > 0.001
      ) {
        offenders.push(
          `transition ${element.tagName.toLowerCase()}.${element.className}`,
        );
      }
    }
    return offenders;
  });
  expect(running, running.join("\n")).toEqual([]);
});

test("every control on the report form is at least 44 px tall", async ({ page }) => {
  await page.setViewportSize(widths[0]);
  await page.goto("/report");
  await settled(page);
  const small = await page.evaluate(() => {
    const controls = document.querySelectorAll<HTMLElement>(
      "main a[href], main button, main input:not([type=hidden]), main select, main textarea, main [role=button]",
    );
    const offenders: string[] = [];
    for (const control of Array.from(controls)) {
      const rect = control.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // hidden
      if (rect.height < 44 && rect.width < 44) {
        offenders.push(
          `${control.tagName.toLowerCase()} "${control.textContent?.trim().slice(0, 30)}" ${Math.round(rect.width)}×${Math.round(rect.height)}`,
        );
      }
    }
    return offenders;
  });
  expect(small, small.join("\n")).toEqual([]);
});
