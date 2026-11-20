import { expect, test } from "@playwright/test";
import {
  accounts,
  expectNoSidewaysScroll,
  photo,
  reference,
  settled,
  shot,
  signIn,
  viewports,
  warmUpRoutes,
  watchErrors,
} from "./support";

warmUpRoutes();

const [mobile, , desktop] = viewports;

for (const viewport of [mobile, desktop]) {
  test(`report a problem, get a receipt and check the file (${viewport.name})`, async ({
    page,
  }) => {
    const problems = watchErrors(page);
    await page.setViewportSize(viewport);
    await page.goto("/report");
    await settled(page);

    // 1. School
    await page.getByRole("searchbox", { name: "Find your school" }).fill("Thuto");
    await page.getByRole("button", { name: /Thuto-Lesedi Primary School/ }).click();
    await expect(page.getByText("Chosen school")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // 2. Type of problem — one question on its own screen, checked before moving on
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "What is the problem about?",
    );
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please choose the type of problem.")).toBeVisible();
    await page.getByText("Toilets and sanitation").click();
    await shot(page, "19-report-category", viewport);
    await page.getByRole("button", { name: "Continue" }).click();

    // 3. What is wrong — one sentence is enough; the rest is optional and folded away
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What is wrong?");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByText("Please describe the problem in a few words."),
    ).toBeVisible();
    await page
      .getByLabel("The problem in one sentence")
      .fill("The toilets in Block B are blocked");
    await shot(page, "20-report-describe", viewport);
    await page.getByRole("button", { name: "Continue" }).click();

    // 4. Possible duplicate
    await expect(page.getByTestId("duplicate-suggestion").first()).toBeVisible();
    await expectNoSidewaysScroll(page);
    await shot(page, "21-report-duplicates", viewport);
    await page.getByRole("button", { name: "Mine is different" }).click();

    // 5. Evidence — the fingerprint is computed in the browser
    await page.locator("input[type=file]").setInputFiles(photo("original photo bytes"));
    await expect(page.getByText("1 file chosen")).toBeVisible();
    await shot(page, "22-report-evidence", viewport);
    await page.getByRole("button", { name: "Continue" }).click();

    // 6. Review and submit
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your report");
    await expectNoSidewaysScroll(page);
    await shot(page, "23-report-review", viewport);
    await page.getByRole("button", { name: "Submit report" }).click();

    // Receipt: a reference, and an honest ledger state
    await expect(page.getByTestId("receipt-reference")).toHaveText(/^BB-\d{4}-\d{6}$/);
    await settled(page);
    await expect(page.locator("[data-ledger=none]").first()).toBeVisible();
    await expect(page.locator("[data-ledger=confirmed]")).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await shot(page, "24-receipt", viewport);

    await page.getByRole("link", { name: "Follow this report" }).click();
    await settled(page);
    await expect(page.locator("[data-status=reported]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "You're affected too" })).toBeVisible();

    // The same file matches the record; a changed file does not.
    await page.goto("/verify");
    await settled(page);
    await page.locator("input[type=file]").setInputFiles(photo("original photo bytes"));
    await expect(page.getByTestId("verify-result")).toHaveAttribute("data-match", "true");
    await expectNoSidewaysScroll(page);
    await shot(page, "25-verify-match", viewport);
    await page.getByRole("button", { name: "Check another file" }).click();
    await page.locator("input[type=file]").setInputFiles(photo("edited photo bytes"));
    await expect(page.getByTestId("verify-result")).toHaveAttribute(
      "data-match",
      "false",
    );
    await shot(page, "26-verify-no-match", viewport);

    expect(problems, "no console or page errors").toEqual([]);
  });
}

test("a duplicate becomes an endorsement instead of a second report", async ({
  page,
}) => {
  await page.setViewportSize(mobile);
  await page.goto("/report?school=thuto-lesedi-primary&category=sanitation");
  await settled(page);
  await expect(page.getByText("Chosen school")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  // The link already said "sanitation": the type screen shows it chosen.
  await expect(page.getByRole("radio", { name: "Toilets and sanitation" })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("The problem in one sentence").fill("Toilets blocked in Block B");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "This is my problem too" }).first().click();

  await page.waitForURL(/\/issues\/issue-118$/);
  await settled(page);
  await expect(page.getByRole("button", { name: "You're affected too" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("endorsement-count")).toHaveText("48 people affected");
});

test("I'm affected too updates the count and survives a reload", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto("/issues/issue-131");
  await settled(page);
  await expect(page.getByTestId("endorsement-count")).toHaveText("86 people affected");
  await page.getByRole("button", { name: "I'm affected too" }).click();
  await expect(page.getByTestId("endorsement-count")).toHaveText("87 people affected");
  await page.reload();
  await settled(page);
  await expect(page.getByTestId("endorsement-count")).toHaveText("87 people affected");
});

test("the feed can be searched and filtered by status", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto("/issues");
  await settled(page);
  await expect(page.getByTestId("issue-card")).toHaveCount(9);
  await page.getByRole("button", { name: "Disputed" }).click();
  await expect(page.getByTestId("issue-card")).toHaveCount(1);
  await expect(page.getByTestId("issue-card")).toContainText("Roof leaks");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("searchbox", { name: "Search issues" }).fill("water");
  await expect(page.getByTestId("issue-card")).toHaveCount(1);
});

test("a repair claim stays unverified until an independent reviewer decides", async ({
  page,
}) => {
  await page.setViewportSize(mobile);

  // School administrator submits a repair claim.
  await signIn(page, accounts.admin, "/admin");
  await page
    .getByTestId("queue-item")
    .filter({ hasText: "Not enough desks" })
    .getByRole("button")
    .click();
  // A new report has to be answered before a repair can be claimed.
  await page.getByRole("button", { name: "We are looking into it" }).click();
  await page
    .getByLabel("What will you check, and when?")
    .fill("The caretaker counts the desks on Monday.");
  await page.getByRole("button", { name: "Record assessment" }).click();
  await expect(page.getByText("Recorded.")).toBeVisible();
  await page
    .getByRole("button", { name: "Record something else for this report" })
    .click();
  await page.getByRole("button", { name: "The repair is done" }).click();
  await expect(page.getByTestId("claim-warning")).toBeVisible();
  await page.getByLabel("What was repaired?").fill("Eighteen new desks were delivered.");
  await shot(page, "30-admin-repair-claim", mobile, { fullPage: false });
  await page.getByRole("button", { name: "Submit repair claim" }).click();
  await expect(page.getByText("Recorded.")).toBeVisible();

  // The public page says "Repair claimed" and explicitly not verified.
  await page.goto("/issues/issue-136");
  await settled(page);
  await expect(page.locator("[data-status=repair_claimed]").first()).toBeVisible();
  await expect(page.getByText("Not verified yet")).toBeVisible();
  await expect(page.getByTestId("review-state")).toHaveAttribute(
    "data-review",
    "awaiting",
  );
  await expect(page.locator("[data-status=independently_verified]")).toHaveCount(0);

  // The school tries to verify its own claim and is refused, visibly.
  await page.goto("/admin");
  await settled(page);
  await page
    .locator("[data-group=review]")
    .getByTestId("queue-item")
    .filter({ hasText: "Not enough desks" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Try to verify this repair" }).click();
  await expect(page.getByTestId("probe-refusal")).toBeVisible();
  await expect(page.getByText("SchoolAdminCannotVerify")).toBeVisible();
  await shot(page, "34-admin-verify-refused", mobile);
  await page.goto("/issues/issue-136");
  await settled(page);
  await expect(page.locator("[data-status=repair_claimed]").first()).toBeVisible();

  // Independent reviewer verifies; a note is required.
  await signIn(page, accounts.reviewer, "/reviewer");
  await page
    .getByTestId("review-item")
    .filter({ hasText: "Not enough desks" })
    .getByRole("button")
    .click();
  const card = page.getByTestId("review-card").filter({ hasText: "Not enough desks" });
  // Three checks at the school come first, then the decision.
  for (const question of [
    "I am at the school now",
    "The repair matches what the school says",
    "It is safe for learners to use",
  ]) {
    await card
      .getByRole("radiogroup", { name: question })
      .getByRole("radio", { name: "Yes" })
      .check();
  }
  await card.getByRole("button", { name: /compare and decide/ }).click();
  await card.getByRole("button", { name: "Yes, it is fixed" }).click();
  await expect(card.getByText("Please describe what you found")).toBeVisible();
  await card.getByLabel("What did you see?").fill("I counted 52 desks in Grade 4B.");
  await shot(page, "31-reviewer-decision", mobile);
  await card.getByRole("button", { name: "Yes, it is fixed" }).click();
  await card
    .getByRole("dialog")
    .getByRole("button", { name: "Verify completion" })
    .click();
  await expect(card).toHaveCount(0);

  await page.goto("/issues/issue-136");
  await settled(page);
  await expect(
    page.locator("[data-status=independently_verified]").first(),
  ).toBeVisible();
  await expect(page.getByTestId("review-state")).toHaveAttribute(
    "data-review",
    "verified",
  );
});

test("a reviewer can dispute a repair claim", async ({ page }) => {
  await page.setViewportSize(desktop);
  await signIn(page, accounts.reviewer, "/reviewer");
  await page
    .getByTestId("review-item")
    .filter({ hasText: "Broken window panes" })
    .getByRole("button")
    .click();
  const card = page.getByTestId("review-card").filter({ hasText: "Broken window panes" });
  for (const question of [
    "I am at the school now",
    "The repair matches what the school says",
    "It is safe for learners to use",
  ]) {
    await card
      .getByRole("radiogroup", { name: question })
      .getByRole("radio", { name: "Yes" })
      .check();
  }
  await card.getByRole("button", { name: /compare and decide/ }).click();
  await card.getByLabel("What did you see?").fill("One pane is still broken.");
  await card.getByRole("button", { name: "No, not fixed" }).click();
  await card
    .getByRole("dialog")
    .getByRole("button", { name: "Dispute completion" })
    .click();
  await expect(card).toHaveCount(0);

  await page.goto("/issues/issue-124");
  await settled(page);
  await expect(page.locator("[data-status=disputed]").first()).toBeVisible();
  await expect(page.getByText("One pane is still broken.").first()).toBeVisible();
});

test("track a report by its reference", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto("/track");
  await settled(page);
  await page.getByLabel("Reference number").fill("12345");
  await page.getByRole("button", { name: "Find my report" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "A reference looks like",
  );
  await page.getByLabel("Reference number").fill(reference(118).toLowerCase());
  await page.getByRole("button", { name: "Find my report" }).click();
  await page.waitForURL(/\/issues\/issue-118$/);
});

test("Bona AI suggests existing issues and is labelled as a preview", async ({
  page,
}) => {
  for (const viewport of [mobile, desktop]) {
    await page.setViewportSize(viewport);
    await page.goto("/assistant");
    await settled(page);
    await expect(page.getByTestId("assistant-notice")).toBeVisible();
    await page
      .getByRole("button", { name: "The toilets at Thuto-Lesedi are blocked" })
      .click();
    await expect(page.getByTestId("issue-card").first()).toContainText("Block B");
    await expect(page.getByRole("link", { name: /Mine is different/ })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await shot(page, "32-assistant-conversation", viewport, { fullPage: false });
  }
  await page.getByLabel("Your message").fill("Tell me about Masakhane Secondary");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("school-card")).toContainText(
    "Masakhane Secondary School",
  );
});

test("sample data is never shown as a real blockchain record", async ({ page }) => {
  await page.setViewportSize(desktop);
  for (const id of ["issue-118", "issue-97", "issue-124"]) {
    await page.goto(`/issues/${id}`);
    await settled(page);
    await expect(
      page.locator("[data-ledger=confirmed], [data-ledger=pending]"),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: /block explorer/ })).toHaveCount(0);
  }
  await page.goto("/issues/issue-97");
  await settled(page);
  await page.getByRole("tab", { name: /^Proof/ }).click();
  await page.getByTestId("show-proof").filter({ visible: true }).first().click();
  await expect(
    page.getByRole("dialog").getByText("It is not a real Avalanche transaction."),
  ).toBeVisible();
});

test("a receipt can be copied and taken to BonaBlock Verify", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize(mobile);

  // Nothing written to a ledger: no receipt is offered.
  await page.goto("/issues/issue-140");
  await settled(page);
  await expect(page.getByTestId("receipt-actions")).toHaveCount(0);

  await page.goto("/issues/issue-97");
  await settled(page);
  await page.getByRole("tab", { name: /^Proof/ }).click();
  const evidence = page.getByTestId("evidence-item").filter({ visible: true }).first();
  // The page shows one word about the record; the receipt is behind "Show proof".
  await expect(evidence.getByRole("button", { name: /Copy receipt/ })).toHaveCount(0);
  await evidence.getByTestId("show-proof").click();
  const sheet = page.getByRole("dialog");
  await sheet.getByText("Technical details").click();
  await sheet.getByRole("button", { name: /Copy receipt/ }).click();
  await expect(sheet.getByText("Receipt copied")).toBeVisible();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  // The sample says what it is and carries no transaction.
  expect(copied).toMatchObject({ sample: true, chainId: "bona:memory", txId: null });
  await expect(
    sheet
      .getByTestId("receipt-actions")
      .getByRole("link", { name: "Open in BonaBlock Verify" }),
  ).toHaveAttribute("href", process.env.NEXT_PUBLIC_VERIFY_URL || "/verify");
  // A sample has no transaction, so there is no link or code to the independent verifier.
  await expect(sheet.getByTestId("verify-link")).toHaveCount(0);

  // A report is checked against its commitment document, so that is offered too.
  // An evidence file is its own input, so it has no document.
  await expect(sheet.getByRole("button", { name: /Copy document/ })).toHaveCount(0);
  await shot(page, "27-copy-receipt", mobile, { fullPage: false });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Show proof: Problem reported" }).click();
  await sheet.getByText("Technical details").click();
  await sheet.getByRole("button", { name: "Copy document: Problem reported" }).click();
  await expect(sheet.getByText("Document copied")).toBeVisible();
  const document = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(document).toMatchObject({ sample: true, type: "report", salt: null });
  await page.keyboard.press("Escape");
  await expectNoSidewaysScroll(page);
});

test("the signed-in header fits on a small phone", async ({ page }) => {
  // 375px is narrower than the main phone size; a long name must truncate, not widen the page.
  await page.setViewportSize({ width: 375, height: 667 });
  await signIn(page, accounts.admin, "/admin");
  await expectNoSidewaysScroll(page);
  await page.goto("/issues");
  await settled(page);
  await expect(page.getByTestId("account-area").filter({ visible: true })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("add evidence to an existing issue", async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto("/issues/issue-140/evidence");
  await settled(page);
  await page.getByRole("button", { name: "Add to this issue" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose at least one file.",
  );
  await page.locator("input[type=file]").setInputFiles(photo("wires photo"));
  await page.getByRole("button", { name: "Add to this issue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evidence added");
  await shot(page, "33-evidence-added", mobile);
  await page.getByRole("link", { name: "Back to the issue" }).click();
  await settled(page);
  // The previous page stays mounted but hidden after navigation, so count visible items only.
  await page.getByRole("tab", { name: /^Proof/ }).click();
  await expect(page.getByTestId("evidence-item").filter({ visible: true })).toHaveCount(
    2,
  );
  await page.getByRole("tab", { name: /^Timeline/ }).click();
  // In the timeline the addition is one line that points at the evidence, with no
  // second receipt button; the evidence item carries the detail.
  const entry = page.getByTestId("timeline-evidence").filter({ visible: true }).first();
  await expect(entry).toContainText("Evidence added");
  await expect(entry.getByRole("link")).toHaveAttribute("href", /^#evidence-/);
  await expect(entry.getByRole("button")).toHaveCount(0);
  await expectNoSidewaysScroll(page);
});

test("staff pages ask for the right sign-in and there is no role switch", async ({
  page,
}) => {
  await page.setViewportSize(desktop);

  // Signed out: both dashboards show a prompt, not data.
  for (const path of ["/admin", "/reviewer"]) {
    await page.goto(path);
    await settled(page);
    await expect(page.getByTestId("role-gate")).toBeVisible();
    await expect(page.getByTestId("issue-card")).toHaveCount(0);
  }

  // Wrong details are refused.
  await page.goto("/sign-in");
  await settled(page);
  await page.getByLabel("Email address").fill(accounts.admin);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("not right");

  // A school administrator sees the dashboard and their name, but not the reviewer page.
  await signIn(page, accounts.admin, "/admin");
  await expect(page.getByTestId("account-area").first()).toContainText("School admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("School dashboard");
  await page.goto("/reviewer");
  await settled(page);
  await expect(page.getByTestId("role-gate")).toContainText(
    "only for an independent reviewer",
  );

  // Signing out closes the dashboard again.
  await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  // Wait for the sign-out to finish; leaving the page first would cancel it.
  await expect(page.getByTestId("account-area")).toHaveCount(0);
  await page.goto("/admin");
  await settled(page);
  await expect(page.getByTestId("role-gate")).toBeVisible();
});

test("a school can decline a report with a public reason", async ({ page }) => {
  await page.setViewportSize(mobile);
  await signIn(page, accounts.admin, "/admin");
  await page
    .getByTestId("queue-item")
    .filter({ hasText: "Not enough desks" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "This is not ours to fix" }).click();
  await page.getByRole("button", { name: "Decline report" }).click();
  await expect(page.getByTestId("answer-form").getByRole("alert")).toContainText(
    "Please fill this in.",
  );
  await page
    .getByLabel("Why is the school declining this report?")
    .fill("New desks arrive next term.");
  await page.getByRole("button", { name: "Decline report" }).click();
  await expect(page.getByText("Recorded.")).toBeVisible();

  await page.goto("/issues/issue-136");
  await settled(page);
  await expect(page.locator("[data-status=declined]").first()).toBeVisible();
  await expect(page.getByTestId("decline-reason")).toHaveText(
    "New desks arrive next term.",
  );
});

test("sign-in never leaves this site, whatever the return address says", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  // The first value is slash-backslash: browsers read it as "//evil.example".
  for (const next of ["/\\evil.example", "//evil.example", "https://evil.example"]) {
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
    await settled(page);
    const account = page.getByTestId("account");
    if (await account.isVisible()) {
      await account.getByRole("button", { name: "Sign out" }).click();
    }
    await page.getByLabel("Email address").fill(accounts.admin);
    await page.getByLabel("Password").fill(process.env.E2E_PASSWORD ?? "bona-demo-2026");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    // An unsafe return address is ignored and the role home page is used instead.
    await page.waitForURL((url) => url.pathname === "/admin");
    expect(page.url()).not.toContain("evil.example");
  }
});
