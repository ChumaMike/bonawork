/**
 * Staff and verifier screens: sign-in, the school's short list and its
 * one-report-at-a-time answers, the independent reviewer's checks and decision,
 * and the in-app file check. The 17-step demo flows themselves live in
 * journeys.spec.ts; this file checks the shape of these screens and the honesty
 * rules they carry: no button ever resolves or marks fixed, a school is refused
 * when it tries to verify its own repair, the reviewer sees exactly what will
 * be recorded before confirming, and a parent sees the three steps of a file check.
 */
import { expect, test, type Locator } from "@playwright/test";
import {
  accounts,
  expectNoSidewaysScroll,
  photo,
  settled,
  shot,
  signIn,
  viewports,
  warmUpRoutes,
  watchErrors,
} from "./support";

warmUpRoutes();

const [mobile, tablet, desktop] = viewports;

/** The fixture administrator whose school already has a repair waiting for review. */
const adminWithClaim = "admin@thuto-lesedi.demo";

/** Words that would turn a claim into a verdict. None of them may appear on a button. */
const forbidden = /resolve|mark (as )?fixed|close issue/i;

/** Answer one of the reviewer's three checks. */
async function answer(card: Locator, question: string, choice: "Yes" | "No") {
  await card
    .getByRole("radiogroup", { name: question })
    .getByRole("radio", { name: choice })
    .check();
}

test("sign-in shows demo accounts as role cards that sign in with one tap", async ({
  page,
}) => {
  const problems = watchErrors(page);
  await page.setViewportSize(mobile);
  await page.goto("/sign-in");
  await settled(page);

  // Each card names the role, what it can do, and the address it signs in with.
  const cards = page.getByRole("button", { name: /@[a-z-]+\.demo/ });
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  const demo = page.locator("section[aria-labelledby=sample-accounts]");
  await expect(demo.getByText("Independent reviewer", { exact: true })).toBeVisible();

  // The typed form is still there for people with their own account.
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await expectNoSidewaysScroll(page);
  await shot(page, "40-sign-in-role-cards", mobile);

  // One tap on a card signs in as that person.
  await page.getByRole("button", { name: new RegExp(accounts.reviewer) }).click();
  await page.waitForURL((url) => url.pathname === "/reviewer");
  expect(problems, "no console or page errors").toEqual([]);
});

test("the school's short list has no action buttons; opening a report gives its answers", async ({
  page,
}) => {
  const problems = watchErrors(page);
  await page.setViewportSize(mobile);
  await signIn(page, accounts.admin, "/admin");

  // The answer first, then three groups by urgency with one line per report.
  await expect(page.getByTestId("queue-headline")).toHaveText(
    /^\d+ reports? needs? your reply\.$/,
  );
  for (const group of ["Reply needed", "Being fixed", "Waiting for a reviewer"]) {
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(`^${group}`) }),
    ).toBeVisible();
  }
  const reply = page.locator("[data-group=reply]");
  const row = reply.getByTestId("queue-item").filter({ hasText: "Not enough desks" });
  await expect(row).toHaveCount(1);
  await expect(row.getByText(/Waiting \d+ days?|Came in today/)).toBeVisible();
  // A repair that a reviewer disputed needs a reply too, and is marked late.
  const disputed = reply.getByTestId("queue-item").filter({ hasText: "Roof leaks" });
  await expect(disputed.locator("[data-late]")).toHaveText(
    "A reviewer said it is not fixed",
  );
  // Each row is one button that opens the report. Nothing in the list records anything.
  await expect(row.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
  await expectNoSidewaysScroll(page);
  await shot(page, "41-admin-list", mobile);

  // Opening a report: the report, how long it has waited, people affected, two answers.
  await row.getByRole("button").click();
  const report = page.getByTestId("guided-report");
  await expect(report.getByRole("heading", { level: 1 })).toHaveText(
    "Not enough desks in Grade 4B",
  );
  await expect(report.getByTestId("waited")).toHaveText(
    /Waiting \d+ days?|Came in today/,
  );
  await expect(report.getByTestId("affected")).toHaveText("5 people affected");
  await expect(
    report.getByRole("button", { name: "We are looking into it" }),
  ).toBeVisible();
  await expect(
    report.getByRole("button", { name: "This is not ours to fix" }),
  ).toBeVisible();
  // A new report can only be answered or declined: a repair cannot be claimed yet.
  await expect(report.getByRole("button", { name: "The repair is done" })).toHaveCount(0);
  await expect(report.getByRole("button", { name: "Other answers" })).toHaveCount(0);
  await expect(
    report.getByRole("button", { name: /^Skip to the next one · \d+ more/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
  await expectNoSidewaysScroll(page);
  await shot(page, "42-admin-one-report", mobile);

  // One decision at a time: choosing an answer asks only for the words that go with it.
  await report.getByRole("button", { name: "We are looking into it" }).click();
  const form = report.getByTestId("answer-form");
  await expect(form).toHaveAttribute("data-action", "assess");
  await form.getByRole("button", { name: "Record assessment" }).click();
  await expect(form.getByRole("alert")).toContainText("Please fill this in.");
  await form
    .getByLabel("What will you check, and when?")
    .fill("The caretaker counts the desks on Monday.");
  await form.getByRole("button", { name: "Record assessment" }).click();
  const recorded = report.getByTestId("answer-recorded");
  await expect(recorded.getByRole("heading", { name: "Recorded." })).toBeVisible();
  await expect(recorded).toContainText("Under assessment");
  await expect(report.locator("[data-status=under_assessment]")).toBeVisible();

  // On to the next report that needs a reply, then back to the list.
  await recorded.getByRole("button", { name: /^Next report/ }).click();
  await expect(report.getByRole("heading", { level: 1 })).toHaveText(/Roof leaks/);
  await expect(report.getByText("A reviewer said this is not fixed")).toBeVisible();
  await report.getByRole("button", { name: "All reports", exact: true }).click();
  await expect(
    page
      .locator("[data-group=fixing]")
      .getByTestId("queue-item")
      .filter({ hasText: "Not enough desks" }),
  ).toHaveCount(1);

  // The same list on a tablet and on a desktop.
  for (const viewport of [tablet, desktop]) {
    await page.setViewportSize(viewport);
    await expectNoSidewaysScroll(page);
    await shot(page, "43-admin-list", viewport);
  }
  expect(problems, "no console or page errors").toEqual([]);
});

test("a school cannot verify its own repair: the ledger refuses and nothing changes", async ({
  page,
}) => {
  await page.setViewportSize(mobile);
  await signIn(page, adminWithClaim, "/admin");
  const row = page
    .locator("[data-group=review]")
    .getByTestId("queue-item")
    .filter({ hasText: "Broken window panes" });
  await expect(row).toHaveCount(1);
  await expect(row.getByText(/^You said fixed/)).toBeVisible();
  await row.getByRole("button").click();

  // A report that waits for review has no answers left for the school.
  const report = page.getByTestId("guided-report");
  await expect(
    report.getByRole("heading", { name: "You said this is fixed" }),
  ).toBeVisible();
  await expect(report.getByText("Only an independent reviewer can verify")).toBeVisible();
  await expect(report.getByRole("heading", { name: "What is your answer?" })).toHaveCount(
    0,
  );
  await expect(report.getByRole("button", { name: forbidden })).toHaveCount(0);

  // The demo moment: the school tries anyway and sees the refusal.
  await report.getByRole("button", { name: "Try to verify this repair" }).click();
  const refusal = report.getByTestId("probe-refusal");
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText("Nothing was changed");
  await expect(refusal).toContainText("SchoolAdminCannotVerify");
  await expect(refusal).toContainText("SCHOOL_ADMIN_ROLE");
  await expect(page.locator("[data-status=independently_verified]")).toHaveCount(0);
  await expect(report.locator("[data-status=repair_claimed]")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await shot(page, "44-admin-verify-refused", mobile);
});

test("the reviewer answers three checks, compares, and sees exactly what is recorded", async ({
  page,
}) => {
  const problems = watchErrors(page);
  await page.setViewportSize(mobile);
  await signIn(page, accounts.reviewer, "/reviewer");
  await expect(page.getByTestId("review-headline")).toHaveText(/repairs? to check\./);
  const item = page.getByTestId("review-item").filter({ hasText: "Broken window panes" });
  await expect(item).toHaveCount(1);
  await expectNoSidewaysScroll(page);
  await shot(page, "45-reviewer-list", mobile);
  await item.getByRole("button").click();

  // Step 1: three checks at the school and an optional photo. No decision yet.
  const card = page.getByTestId("review-card").filter({ hasText: "Broken window panes" });
  await expect(card).toHaveAttribute("data-step", "checks");
  await expect(card.getByText("The school says", { exact: true })).toBeVisible();
  await expect(card.getByRole("radiogroup")).toHaveCount(3);
  await expect(
    card.getByRole("button", { name: /Take a photo of what you see/ }),
  ).toBeVisible();
  await expect(card.getByRole("button", { name: /fixed/i })).toHaveCount(0);
  await card.getByRole("button", { name: /compare and decide/ }).click();
  await expect(card.getByRole("alert")).toContainText("Please answer all three first.");
  await answer(card, "I am at the school now", "Yes");
  await answer(card, "The repair matches what the school says", "No");
  await answer(card, "It is safe for learners to use", "No");
  await expectNoSidewaysScroll(page);
  await shot(page, "47-reviewer-checks", mobile);
  await card.getByRole("button", { name: /compare and decide/ }).click();

  // Step 2: the problem and the school's repair side by side, a note, two answers.
  await expect(card).toHaveAttribute("data-step", "decide");
  await expect(card.getByText("The problem", { exact: true })).toBeVisible();
  await expect(card.getByText("The school's repair", { exact: true })).toBeVisible();
  await expect(card.getByText("The school says", { exact: true })).toBeVisible();
  await expect(card.getByTestId("checks-line")).toHaveText(
    "At the school: yes. Repair matches the claim: no. Safe to use: no.",
  );
  await expect(card.getByRole("button", { name: "Yes, it is fixed" })).toBeVisible();
  await expect(card.getByRole("button", { name: "No, not fixed" })).toBeVisible();
  await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);

  // A note is required, and nothing is recorded before the confirm step.
  await card.getByRole("button", { name: "No, not fixed" }).click();
  await expect(card.getByText("Please describe what you found")).toBeVisible();
  await card.getByLabel("What did you see?").fill("One pane is still broken.");
  await expectNoSidewaysScroll(page);
  await shot(page, "48-reviewer-decide", mobile);
  await card.getByRole("button", { name: "No, not fixed" }).click();

  // The confirm step shows exactly what will be recorded: the note with the three answers
  // as its last line. The technical part stays behind a button.
  const confirm = card.getByRole("dialog");
  await expect(confirm.getByText("Disputed. The repair is not fixed.")).toBeVisible();
  await expect(confirm.getByTestId("review-note")).toHaveText(
    /One pane is still broken\.\s+At the school: yes\. Repair matches the claim: no\. Safe to use: no\./,
  );
  await expect(confirm.getByText(/not saved anywhere else/)).toBeVisible();
  await confirm.getByText("Technical details").click();
  await expect(confirm.getByTestId("ledger-statement")).toContainText("fingerprint");
  await expect(confirm.getByText(/Not written: your name/)).toBeVisible();
  await expect(confirm.getByText(/sample record/i)).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Dispute completion" })).toBeVisible();
  await shot(page, "49-reviewer-confirm", mobile, { fullPage: false });
  await confirm.getByRole("button", { name: "Go back" }).click();
  await expect(confirm).toBeHidden();

  // The decision screen on a desktop.
  await page.setViewportSize(desktop);
  await expectNoSidewaysScroll(page);
  await shot(page, "50-reviewer-decide", desktop);
  await page.setViewportSize(mobile);

  // Recording the dispute returns to the list, and the three answers are part of the note.
  await card.getByRole("button", { name: "No, not fixed" }).click();
  await confirm.getByRole("button", { name: "Dispute completion" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId("review-decided")).toContainText(
    "You disputed this repair.",
  );
  const done = page.getByTestId("review-done").filter({ hasText: "Broken window panes" });
  await expect(done).toContainText("One pane is still broken.");
  await expect(done).toContainText("Safe to use: no.");
  await expect(done.locator("[data-status=disputed]")).toBeVisible();
  expect(problems, "no console or page errors").toEqual([]);
});

test("checking a file shows three plain steps and one answer, with the codes folded away", async ({
  page,
}) => {
  const problems = watchErrors(page);
  await page.setViewportSize(mobile);
  await page.goto("/verify");
  await settled(page);
  // The link to the separate verifier is under "How this works", not on the first screen.
  await expect(page.getByRole("link", { name: "Open Bona Chain Verify" })).toBeHidden();

  await page.locator("input[type=file]").setInputFiles(photo("a file nobody recorded"));
  await expect(page.getByTestId("verify-result")).toHaveAttribute("data-match", "false");
  await expect(page.getByText("You chose a file")).toBeVisible();
  await expect(page.getByText("Your phone made its fingerprint")).toBeVisible();
  await expect(page.getByText("No record has this fingerprint.")).toBeVisible();
  await expect(page.getByRole("main").getByText("No matching record")).toBeVisible();
  // The fingerprint itself is one tap away, not on the screen by default.
  await expect(page.getByTestId("computed-digest")).toBeHidden();
  await page.getByText("Fingerprint of your file").click();
  await expect(page.getByTestId("computed-digest")).toHaveText(/^0x[0-9a-f]{64}$/);
  await expect(page.locator("[data-ledger=confirmed]")).toHaveCount(0);
  await expectNoSidewaysScroll(page);
  await shot(page, "46-verify-steps", mobile);

  await page.getByRole("button", { name: "Check another file" }).click();
  await expect(page.locator("input[type=file]")).toHaveCount(1);
  expect(problems, "no console or page errors").toEqual([]);
});

test.describe("staff see their own work, not the community's actions", () => {
  test.use({ viewport: mobile });

  for (const who of [
    { email: accounts.admin, home: "/admin", workspace: "My dashboard" },
    { email: accounts.reviewer, home: "/reviewer", workspace: "My reviews" },
  ]) {
    test(`${who.workspace}: no reporting, no "I'm affected too", no adding photos`, async ({
      page,
    }) => {
      const errors = watchErrors(page);
      await signIn(page, who.email, who.home);

      const nav = page.getByTestId("bottom-nav");
      await expect(nav.getByRole("link", { name: who.workspace })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Report", exact: true })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "My reports" })).toHaveCount(0);

      await page.goto("/");
      await settled(page);
      const tiles = page.getByTestId("home-tiles");
      await expect(
        tiles.getByRole("link", { name: /My (dashboard|reviews)/ }),
      ).toBeVisible();
      await expect(tiles.getByRole("link", { name: /Report a problem/ })).toHaveCount(0);

      await page.goto("/issues/issue-118");
      await settled(page);
      await expect(page.getByTestId("staff-note")).toBeVisible();
      await expect(page.getByRole("button", { name: /affected too/ })).toHaveCount(0);
      await expect(page.getByTestId("endorsement-count")).toBeVisible();
      await page.getByRole("tab", { name: /^Proof/ }).click();
      await expect(page.getByRole("link", { name: "Add evidence" })).toHaveCount(0);

      for (const path of ["/report", "/track", "/issues/issue-118/evidence"]) {
        await page.goto(path);
        await settled(page);
        await expect(page.getByTestId("community-gate")).toBeVisible();
        await expect(
          page.getByRole("link", { name: `Go to ${who.workspace}` }),
        ).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }

  test("a community reporter still has everything", async ({ page }) => {
    await signIn(page, accounts.reporter, "/");
    const nav = page.getByTestId("bottom-nav");
    await expect(nav.getByRole("link", { name: "Report", exact: true })).toBeVisible();
    await page.goto("/issues/issue-118");
    await settled(page);
    await expect(page.getByRole("button", { name: /affected too/ })).toBeVisible();
    await page.goto("/report");
    await settled(page);
    await expect(page.getByTestId("community-gate")).toHaveCount(0);
  });
});
