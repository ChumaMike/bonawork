/**
 * The 17-step demo (docs/hackathon/DEMO_GUIDE.md) run against a LIVE deployment:
 * real API, real database, whatever ledger the server is configured with.
 *
 *   LIVE_BASE_URL=https://bona.example pnpm e2e:live
 *
 * Optional: LIVE_PASSWORD (default bona-demo-2026), LIVE_CRON_SECRET (re-seeds the demo
 * case through /api/demo/reset at the end so the deployment is left demo-ready).
 *
 * Screenshots go to docs/screenshots/release/. Nothing here asserts that a receipt is
 * a real Solana transaction unless the server itself reports a live ledger.
 */
import { expect, test, type Page } from "@playwright/test";

const password = process.env.LIVE_PASSWORD ?? "bona-demo-2026";
const accounts = {
  reporter: "zanele@community.demo",
  admin: "admin@thandolwethu.demo",
  reviewer: "reviewer@vaalridge.demo",
};
const DEMO_REFERENCE = "BB-2026-000042";

const widths = [
  { name: "small-phone", width: 375, height: 667 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/** A real (tiny) PNG so the server's magic-number check accepts it. */
const png = (tag: string) => ({
  name: `demo-${tag}.png`,
  mimeType: "image/png",
  buffer: Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`bonablock-live-${tag}-${Date.now()}`),
  ]),
});

const DEMO_TITLE = "Girls' toilet block";

async function settled(page: Page) {
  // The landing page has no hydration marker; every other screen renders one.
  if (new URL(page.url()).pathname !== "/") {
    await expect(page.getByTestId("hydrated").first()).toBeAttached({ timeout: 30_000 });
  }
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  // A cold serverless instance can take a while to migrate and seed its database.
  await expect(page.locator("main [role=status]:visible")).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string) {
  const width = page.viewportSize()?.width ?? 0;
  await page.addStyleTag({
    content:
      "nextjs-portal { display: none !important; } body { position: relative; } [data-testid=bottom-nav] { position: absolute !important; }",
  });
  await page.screenshot({
    path: `docs/screenshots/release/${name}-${width}.png`,
    fullPage: true,
    caret: "initial",
  });
}

async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await settled(page);
  const account = page.getByTestId("account");
  if (await account.isVisible()) {
    await account.getByRole("button", { name: "Sign out" }).click();
  }
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === next, { timeout: 30_000 });
  await settled(page);
}

let issueId: string;
let ledgerLive = false;

test.beforeAll(async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok(), "GET /api/health").toBe(true);
  const ledger = await (await request.get("/api/ledger")).json();
  ledgerLive = ledger.data.live === true;
  const issue = await (await request.get(`/api/issues/${DEMO_REFERENCE}`)).json();
  issueId = issue.data.id;
  expect(issue.data.status, "demo case must start in repair_claimed").toBe(
    "repair_claimed",
  );
});

test.afterAll(async ({ request }) => {
  const secret = process.env.LIVE_CRON_SECRET;
  if (!secret) return;
  const reset = await request.post("/api/demo/reset", {
    headers: { "x-cron-secret": secret },
    timeout: 120_000,
  });
  expect(reset.ok(), "demo reset").toBe(true);
});

test("screens at 375 / 390 / 768 / 1440 have no sideways scroll or page errors", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  const screens = [
    ["01-landing", "/"],
    ["02-school", "/schools/thandolwethu-primary"],
    ["03-issues", "/issues"],
    ["04-issue", `/issues/${DEMO_REFERENCE}`],
    ["05-report", "/report"],
    ["06-assistant", "/assistant"],
    ["07-sign-in", "/sign-in"],
    ["08-verify", "/verify"],
  ] as const;
  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    for (const [name, path] of screens) {
      await page.goto(path);
      await settled(page);
      await noSidewaysScroll(page);
      await shot(page, name);
    }
  }
  expect(problems, "no page errors").toEqual([]);
});

test("steps 1–8: community journey on a phone", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize(widths[0]);

  // 1–2. Landing and the participating school.
  await page.goto("/");
  await settled(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "From the report to the release, every step checked.",
  );
  await expect(
    page.getByRole("searchbox", { name: "Which school is it about?" }),
  ).toBeVisible();
  await page.goto("/schools/thandolwethu-primary");
  await settled(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Thandolwethu");

  // 3–4. Bona AI finds the existing case.
  await page.goto("/assistant");
  await settled(page);
  await page
    .getByLabel("Your message")
    .fill("The girls' toilets are blocked and the floor is wet");
  await page.getByRole("button", { name: "Send" }).click();
  const card = page.getByTestId("issue-card").filter({ hasText: DEMO_TITLE });
  await expect(card.first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "10-assistant-finds-case");

  // 5. "I'm affected too" needs an account: 7 → 8 → 7.
  await signIn(page, accounts.reporter, `/issues/${issueId}`);
  const count = page.getByTestId("endorsement-count");
  await expect(count).toHaveText("7 people affected");
  await page.getByRole("button", { name: "I'm affected too" }).click();
  await expect(count).toHaveText("8 people affected");
  await shot(page, "11-affected-too");
  await page.getByRole("button", { name: "You're affected too" }).click();
  await expect(count).toHaveText("7 people affected");

  // 6–7. Add evidence; the fingerprint is computed on the device; honest ledger label.
  const before = await page.getByTestId("evidence-item").count();
  await page.goto(`/issues/${issueId}/evidence`);
  await settled(page);
  await page.locator("input[type=file]").setInputFiles(png("evidence"));
  await expect(page.getByText("1 file chosen")).toBeVisible();
  await page.getByRole("button", { name: "Add to this issue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evidence added", {
    timeout: 60_000,
  });
  await shot(page, "12-evidence-added");
  await page.getByRole("link", { name: "Back to the issue" }).click();
  await settled(page);
  await expect
    .poll(() => page.getByTestId("evidence-item").count(), { timeout: 30_000 })
    .toBeGreaterThan(before);
  if (!ledgerLive) {
    // Memory ledger: the UI must never call this a Solana transaction.
    await expect(page.locator("[data-ledger=confirmed]")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /block explorer|Snowtrace/i }),
    ).toHaveCount(0);
  }

  // 8. Timeline: repair claimed, not verified.
  await expect(page.locator("[data-status=repair_claimed]").first()).toBeVisible();
  await expect(page.getByText("Not verified yet")).toBeVisible();
  await page.getByRole("tab", { name: /^Timeline/ }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: /^Timeline/ })
      .getByText("Repair claimed")
      .first(),
  ).toBeVisible();
  await shot(page, "13-timeline-repair-claimed");
});

test("steps 9–12: the school administrator is refused by app and contract", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize(widths[3]);
  await signIn(page, accounts.admin, "/admin");
  await shot(page, "20-admin-dashboard");
  // The short list has no action buttons: the demo case sits under "Waiting for a
  // reviewer", and opening it shows the report on its own.
  const item = page
    .locator("[data-group=review]")
    .getByTestId("queue-item")
    .filter({ hasText: DEMO_TITLE })
    .first();
  await expect(item).toBeVisible();
  await item.getByRole("button").click();
  const report = page.getByTestId("guided-report");
  await expect(report.getByRole("heading", { level: 1 })).toContainText(DEMO_TITLE);
  // A school has no answer left on its own claim. It can try to verify, and is refused.
  await report.getByRole("button", { name: "Try to verify this repair" }).click();
  const refusal = report.getByTestId("probe-refusal");
  await expect(refusal).toBeVisible({ timeout: 30_000 });
  await expect(refusal).toContainText("SchoolAdminCannotVerify");
  await expect(refusal).toContainText("Nothing was changed");
  await expect(report.locator("[data-status=repair_claimed]")).toBeVisible();
  await shot(page, "21-admin-verify-refused");

  // Reviewer and admin dashboards are role-gated.
  await page.goto("/reviewer");
  await settled(page);
  await expect(page.getByTestId("role-gate")).toBeVisible();
});

test("steps 13–14: an independent reviewer disputes the claim", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(widths[1]);
  await signIn(page, accounts.reviewer, "/reviewer");
  await page
    .getByTestId("review-item")
    .filter({ hasText: DEMO_TITLE })
    .first()
    .getByRole("button")
    .click();
  const card = page.getByTestId("review-card").filter({ hasText: DEMO_TITLE });
  await expect(card).toHaveCount(1);

  // Three checks at the school. They are guidance: the answers travel in the note.
  const checks = [
    ["I am at the school now", "Yes"],
    ["The repair matches what the school says", "No"],
    ["It is safe for learners to use", "No"],
  ] as const;
  for (const [question, choice] of checks) {
    await card
      .getByRole("radiogroup", { name: question })
      .getByRole("radio", { name: choice })
      .check();
  }
  await shot(page, "29-reviewer-checks");
  await card.getByRole("button", { name: /compare and decide/ }).click();

  // The problem and the school's repair side by side, a note, two answers.
  await expect(card).toHaveAttribute("data-step", "decide");
  await card
    .getByLabel("What did you see?")
    .fill("Two toilets still not flushing; cubicle 3 door still off its hinges.");
  await shot(page, "30-reviewer-decision");
  await card.getByRole("button", { name: "No, not fixed" }).click();

  // The confirm step shows exactly what will be recorded, then records it.
  const confirm = card.getByRole("dialog");
  await expect(confirm.getByTestId("review-note")).toContainText(
    "Two toilets still not flushing",
  );
  await expect(confirm.getByTestId("review-note")).toContainText(
    "At the school: yes. Repair matches the claim: no. Safe to use: no.",
  );
  await confirm.getByRole("button", { name: "Dispute completion" }).click();
  await expect(card).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByTestId("review-decided")).toContainText(
    "You disputed this repair.",
  );

  await page.goto(`/issues/${issueId}`);
  await settled(page);
  await expect(page.locator("[data-status=disputed]").first()).toBeVisible();
  // The reviewer's words are on the first screen.
  await expect(page.getByText("Two toilets still not flushing").first()).toBeVisible();
  // The claim is not erased: it stays in the timeline next to the dispute.
  await page.getByRole("tab", { name: /^Timeline/ }).click();
  const timeline = page.getByRole("tabpanel", { name: /^Timeline/ });
  await expect(timeline.getByText("Repair claimed").first()).toBeVisible();
  await expect(
    timeline.getByText("Two toilets still not flushing").first(),
  ).toBeVisible();
  await shot(page, "31-issue-disputed");
});

test("steps 16–17 (in-app): the same file matches, a changed file does not", async ({
  page,
}) => {
  await page.setViewportSize(widths[0]);
  const original = png("verify");
  // Register the file as evidence through the API first.
  const form = new FormData();
  form.append("purpose", "problem");
  form.append(
    "evidence",
    new Blob([original.buffer], { type: "image/png" }),
    original.name,
  );
  const added = await page.request.post(`/api/issues/${issueId}/evidence`, {
    multipart: form,
  });
  expect(added.status()).toBe(201);

  await page.goto("/verify");
  await settled(page);
  await page.locator("input[type=file]").setInputFiles(original);
  await expect(page.getByTestId("verify-result")).toHaveAttribute("data-match", "true", {
    timeout: 30_000,
  });
  await shot(page, "40-verify-match");
  await page.getByRole("button", { name: "Check another file" }).click();
  await page.locator("input[type=file]").setInputFiles({
    ...original,
    buffer: Buffer.concat([original.buffer, Buffer.from("!")]),
  });
  await expect(page.getByTestId("verify-result")).toHaveAttribute("data-match", "false");
  await shot(page, "41-verify-mismatch");
});
