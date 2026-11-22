/**
 * The procurement demo path, on the fixture data, on a phone.
 *
 * One browser tab plays every role in turn, as a presenter would: the supplier
 * sends a wrong invoice and the rules block it; the supplier sends the right
 * one and it matches; the payment approver finds the release locked; the
 * independent reviewer verifies the repair; the approver authorises the
 * release; and a signed-out visitor sees who did what, with no amounts.
 *
 * It also checks what these screens promise: one main action per screen,
 * nothing that says "paid" or "resolved", no prices for the receiving
 * officer, and no page that scrolls sideways at 390 px.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSidewaysScroll, settled, signIn, viewports } from "./support";

const [mobile] = viewports;

/** The fixture accounts. Set the E2E_* variables to run against seeded accounts instead. */
const accounts = {
  supplier: process.env.E2E_SUPPLIER_EMAIL ?? "supplier@emseni-supplies.demo",
  receiver: process.env.E2E_RECEIVER_EMAIL ?? "receiving@thandolwethu.demo",
  approver: process.env.E2E_APPROVER_EMAIL ?? "approver@vaalridge.demo",
  buyer: process.env.E2E_BUYER_EMAIL ?? "buyer@vaalridge.demo",
  reviewer: process.env.E2E_REVIEWER_EMAIL ?? "reviewer@district.demo",
};

/** Case A of the fixtures: order approved, acknowledged and delivered; the repair is claimed. */
const CASE_A = { id: "issue-124", title: "Broken window panes in the Grade 3 classroom" };
/** A fixture report at the receiving officer's school that still waits for a work order. */
const NEEDS_ORDER = "issue-118";

/** Words these screens must never use. A release is an instruction; a claim is not a verdict. */
const forbidden = /\bpaid\b|payment made|\bresolved?\b|mark (as )?fixed/i;
/** Every amount is printed as rand, e.g. R5 885,00. */
const amount = /R\s?\d/;

// The dev server compiles a route the first time it is asked for. Ask once, before the test.
test.beforeAll(async ({ playwright }, testInfo) => {
  test.setTimeout(300_000);
  const context = await playwright.request.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  for (const route of [
    "/sign-in",
    "/supplier",
    "/payments",
    "/receiving",
    "/buyer",
    "/reviewer",
    `/issues/${CASE_A.id}`,
  ]) {
    await context.get(route, { timeout: 120_000 });
  }
  await context.dispose();
});

async function signOut(page: Page) {
  await page.goto("/sign-in");
  await settled(page);
  await page.getByTestId("account").getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
}

/** Paste one of the two sample invoices, let Bona AI read it, and submit what it filled in. */
async function sendSampleInvoice(page: Page, sample: string, invoiceNumber: string) {
  const form = page.getByTestId("invoice-form");
  await form.getByRole("button", { name: sample, exact: true }).click();
  await expect(form.getByLabel("Invoice text")).toHaveValue(
    new RegExp(`Invoice number: ${invoiceNumber}`),
  );
  await form.getByRole("button", { name: "Read it with Bona AI" }).click();
  // The draft is a suggestion: the banner says so, and the supplier is the one who submits.
  await expect(form.getByTestId("ai-banner")).toContainText(
    "Bona AI does not submit or approve anything.",
  );
  await expect(form.getByLabel("Invoice number")).toHaveValue(invoiceNumber);
  await expect(form.locator("[data-missing]")).toHaveCount(0);
  await form.getByRole("button", { name: "Submit invoice" }).click();
}

test("the demo path: blocked invoice, matched invoice, locked gate, verification, release", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize(mobile);

  /* 1. The supplier: one order waits for an invoice. */
  await signIn(page, accounts.supplier, "/supplier");
  const next = page.getByTestId("next-card");
  await expect(next.getByRole("heading", { name: CASE_A.title })).toBeVisible();
  await expect(next.getByTestId("stage-pill")).toHaveText("Order acknowledged");
  await expect(page.getByTestId("testnet-note")).toHaveText(
    "Test network only. No real money moves.",
  );
  await expectNoSidewaysScroll(page);
  await next.getByRole("button", { name: "Send your invoice" }).click();

  const task = page.getByTestId("case-task");
  await expect(task.getByRole("heading", { level: 1, name: CASE_A.title })).toBeVisible();
  // The fields stay closed until the text is read or the supplier chooses to type them.
  await expect(task.getByRole("button", { name: "Submit invoice" })).toHaveCount(0);
  await expect(
    task.getByRole("button", { name: "Type the fields myself" }),
  ).toBeVisible();
  // Bona AI reads at most 6 000 characters, so the box takes no more.
  await expect(task.getByLabel("Invoice text")).toHaveAttribute("maxlength", "6000");

  /* 2. The wrong invoice is blocked, with the rule reasons first. */
  await sendSampleInvoice(page, "Use sample invoice with a mistake", "INV-2041");
  const result = task.getByTestId("match-result");
  await expect(result).toHaveAttribute("data-outcome", "blocked");
  await expect(result.getByRole("heading", { name: "Invoice blocked" })).toBeVisible();
  await expect(result).toContainText("The rules found 4 problems. Nothing was approved.");
  const reasons = result.getByTestId("match-reasons").getByRole("listitem");
  await expect(reasons).toHaveCount(4);
  await expect(reasons.nth(0)).toHaveText("GLASS-4MM: 4 invoiced, but only 3 arrived.");
  await expect(reasons.nth(1)).toHaveText("GLASS-4MM: 4 invoiced, 3 ordered.");
  // Under the result, set apart: the explanation, labelled as written by code.
  const explanation = result.getByTestId("match-explanation");
  await expect(explanation).toHaveAttribute("data-source", "rules");
  await expect(explanation).toContainText("In plain words");
  await expect(explanation).toContainText("This explains what the rules found.");
  await expect(task.getByTestId("stage-pill")).toHaveText("Invoice blocked");
  await expect(task.getByTestId("invoice-form")).toBeHidden();
  await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
  await expectNoSidewaysScroll(page);

  /* 3. The corrected invoice matches. The typed fields were kept. */
  await result.getByRole("button", { name: "Send a corrected invoice" }).click();
  await expect(task.getByLabel("Invoice number")).toHaveValue("INV-2041");
  await sendSampleInvoice(page, "Use sample invoice", "INV-2042");
  await expect(result).toHaveAttribute("data-outcome", "matched");
  await expect(result.getByRole("heading", { name: "Invoice matched" })).toBeVisible();
  await expect(result).toContainText("Next: an independent reviewer checks the repair.");
  await expect(task.getByTestId("stage-pill")).toHaveText("Waiting for reviewer");
  // Matched is not verified: the report itself still says the repair is only claimed.
  await expect(task.locator("[data-status=repair_claimed]")).toBeVisible();
  await expect(task.getByTestId("invoice-form")).toHaveCount(0);
  await expectNoSidewaysScroll(page);

  // Nothing is left for the supplier.
  await task.getByRole("button", { name: "Back to your list" }).click();
  await expect(page.getByText("No orders are waiting for you.")).toBeVisible();

  /* 4. The payment approver: the gate is locked, and says who it waits for. */
  await signIn(page, accounts.approver, "/payments");
  const gate = page.getByTestId("release-gate");
  await expect(gate).toHaveAttribute("data-gate", "locked");
  await expect(gate.getByRole("heading", { name: "Release locked" })).toBeVisible();
  await expect(gate.getByTestId("gate-summary")).toHaveText("1 thing must happen first.");
  const checklist = gate.getByTestId("gate-checklist");
  await expect(checklist.locator("[data-check=invoice]")).toHaveAttribute(
    "data-kind",
    "done",
  );
  await expect(checklist.locator("[data-check=repair]")).toContainText(
    "Waiting for the independent reviewer.",
  );
  await expect(gate.getByRole("button", { name: "Authorise release" })).toHaveCount(0);
  const locked = gate.getByRole("button", { name: "Release locked" });
  await expect(locked).toHaveAttribute("aria-disabled", "true");
  // It is not a working button, but a keyboard still reaches it. Pressing it
  // changes nothing; it points at what must happen first.
  await locked.focus();
  await page.keyboard.press("Enter");
  await expect(checklist.locator("[data-check=repair]")).toBeFocused();
  await expect(gate).toHaveAttribute("data-gate", "locked");
  await expect(gate).not.toContainText(amount);

  // One question for Bona AI, answered beside the checklist and never instead of it.
  const ask = page.getByTestId("ask-bona-ai");
  await ask
    .getByRole("button", { name: /^What is blocking payment on BB-\d{4}-\d{6}\?$/ })
    .click();
  await expect(ask.getByTestId("bona-ai-answer")).toContainText("Bona AI");
  await expect(gate).toHaveAttribute("data-gate", "locked");
  await expectNoSidewaysScroll(page);

  /* 5. The independent reviewer verifies the repair. Only this changes the report status. */
  await signIn(page, accounts.reviewer, "/reviewer");
  await page
    .getByTestId("review-item")
    .filter({ hasText: CASE_A.title })
    .getByRole("button")
    .click();
  const card = page.getByTestId("review-card").filter({ hasText: CASE_A.title });
  // The reviewer sees who ordered, delivered and invoiced, by name, and no price.
  const staffTrail = card.getByTestId("staff-trail");
  await expect(staffTrail).toHaveAttribute("data-prices", "hidden");
  await expect(staffTrail.getByTestId("trail-person").first()).toBeVisible();
  await expect(staffTrail).not.toContainText(amount);
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
  await expect(card).toHaveAttribute("data-step", "decide");
  await card.getByLabel("What did you see?").fill("All three panes are in and sealed.");
  await card.getByRole("button", { name: "Yes, it is fixed" }).click();
  await card
    .getByRole("dialog")
    .getByRole("button", { name: "Verify completion" })
    .click();
  await expect(page.getByTestId("review-decided")).toContainText(
    "You verified this repair.",
  );

  /* 6. The approver again: the gate is open. One button, behind a confirmation. */
  await signIn(page, accounts.approver, "/payments");
  await expect(gate).toHaveAttribute("data-gate", "open");
  await expect(gate.getByRole("heading", { name: "Ready to authorise" })).toBeVisible();
  await expect(page.getByTestId("next-card").getByTestId("stage-pill")).toHaveText(
    "Ready for release",
  );
  await gate.getByRole("button", { name: "Authorise release" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("Authorise the release for BB-");
  await expect(confirm).toContainText("No money moves.");
  await expectNoSidewaysScroll(page);
  await confirm.getByRole("button", { name: "Authorise release" }).click();

  await expect(gate).toHaveAttribute("data-gate", "authorised");
  await expect(gate.getByRole("heading", { name: "Release authorised" })).toBeVisible();
  await expect(gate.getByTestId("gate-summary")).toContainText("Authorised by you on");
  await expect(page.getByTestId("task-success")).toHaveText(
    "Release authorised. This is an instruction. No money moved on this test network.",
  );
  await expect(gate.getByRole("button", { name: "Authorise release" })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(forbidden);
  await expectNoSidewaysScroll(page);

  /* 7. Signed out: who did what, and the proof. No amounts, no names, no documents. */
  await signOut(page);
  await page.goto(`/issues/${CASE_A.id}`);
  await settled(page);
  await expect(
    page.locator("[data-status=independently_verified]").first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Trail" }).click();
  const trail = page.getByTestId("public-trail");
  await expect(
    trail.getByRole("heading", { name: "Who did what, and the proof" }),
  ).toBeVisible();
  const rows = trail.getByTestId("trail-row");
  await expect(rows).toHaveCount(8);
  await expect(trail.locator("[data-testid=trail-row][data-state=done]")).toHaveCount(8);
  await expect(rows.nth(1)).toContainText("Work order approved");
  await expect(rows.nth(1)).toContainText("Funder");
  await expect(rows.nth(5)).toContainText("Bona Chain rules");
  await expect(rows.nth(5)).toContainText(
    "The invoice matches the order and the delivery.",
  );
  await expect(rows.nth(5)).toContainText("1 earlier invoice was blocked.");
  await expect(rows.nth(7)).toContainText(
    "Release authorised. An instruction, not a payment.",
  );
  await expect(trail).not.toContainText(amount);
  await expect(trail).not.toContainText(/Dlamini|Zulu|Ngcobo|van Wyk|Emseni|INV-|SUP-/);
  await expect(trail.getByTestId("trail-person")).toHaveCount(0);
  await expect(page.getByTestId("staff-trail")).toHaveCount(0);
  await expect(trail).not.toContainText(forbidden);
  await expectNoSidewaysScroll(page);

  // The procurement steps are on the trail only. The timeline stays the report's own story.
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByTestId("timeline-finance")).toHaveCount(0);
  await expect(page.locator("#issue-panel-timeline")).not.toContainText(amount);
  await expect(page.locator("#issue-panel-timeline")).not.toContainText(
    /Dlamini|Zulu|Ngcobo|van Wyk|Emseni/,
  );
});

test("each role home shows only that role's work, and the receiving officer never sees a price", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize(mobile);

  // Signed out, a role home is a prompt to sign in, not data.
  await page.goto("/payments");
  await settled(page);
  await expect(page.getByTestId("role-gate")).toBeVisible();
  await expect(page.getByTestId("release-gate")).toHaveCount(0);

  // The sign-in cards: the three roles of the live demo first, then everyone else.
  // The four new roles are all there, each with its step on the trail.
  await page.goto("/sign-in");
  await settled(page);
  const demoCards = page.locator("[data-testid=card-group][data-group=demo]");
  await expect(demoCards.getByRole("button")).toHaveText([
    /Supplier.*Steps 2 and 3/,
    /Independent reviewer.*Step 6/,
    /Payment approver.*Step 7/,
  ]);
  // Whatever other accounts exist, the two remaining trail roles follow, in step order.
  const moreCards = page.locator("[data-testid=card-group][data-group=more]");
  await expect(moreCards.getByRole("button").filter({ hasText: /Step \d/ })).toHaveText([
    /Funder.*Step 1/,
    /Receiving officer.*Step 4/,
  ]);
  await expect(
    moreCards.getByRole("button").filter({ hasText: "School administrator" }).first(),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);

  // The buyer: reports that wait for a work order, and a form whose total is computed.
  await signIn(page, accounts.buyer, "/buyer");
  await expect(page.getByTestId("role-home")).toHaveAttribute("data-role", "buyer");
  const next = page.getByTestId("next-card");
  await expect(next).toHaveAttribute("data-action", "approve_order");
  await expect(next.getByRole("button", { name: "Write the work order" })).toBeVisible();
  await page.goto(`/buyer?case=${NEEDS_ORDER}`);
  await settled(page);
  const form = page.getByTestId("order-form");
  await form.getByLabel("Supplier reference").fill("SUP-2026-0417");
  await form.getByLabel("Scope of work").fill("Supply and fit two concrete pit covers.");
  await form.getByLabel("Code").fill("PIT-CVR");
  await form.getByLabel("Description").fill("Concrete pit cover");
  await form.getByLabel("Quantity").fill("2");
  await form.getByLabel("Unit price in rand").fill("1450.50");
  await expect(form.getByTestId("order-form-total")).toHaveText("R2 901,00");
  await expectNoSidewaysScroll(page);
  await form.getByRole("button", { name: "Approve work order" }).click();
  await expect(page.getByTestId("task-success")).toHaveText(
    "Work order approved. The supplier has been asked to acknowledge it.",
  );
  await expect(page.getByTestId("staff-trail")).toHaveAttribute("data-prices", "visible");
  await expect(page.getByTestId("trail-order-summary")).toHaveText("1 line · R2 901,00");

  // The supplier acknowledges it; then the receiving officer is asked to count the delivery.
  await signIn(page, accounts.supplier, "/supplier");
  await page
    .getByRole("button", { name: /See the order|Order to acknowledge/ })
    .first()
    .click();
  const acknowledge = page.getByTestId("acknowledge-order");
  await expect(acknowledge.getByTestId("order-total")).toHaveText("R2 901,00");
  await acknowledge.getByRole("button", { name: "Acknowledge order" }).click();
  await expect(page.getByTestId("task-success")).toHaveText(
    "Order acknowledged. You can now send your invoice.",
  );

  await signIn(page, accounts.receiver, "/receiving");
  await expect(page.locator("main")).not.toContainText(amount);
  await page.getByRole("button", { name: "Record the delivery" }).click();
  const receipt = page.getByTestId("receipt-form");
  await expect(receipt.getByTestId("receipt-line")).toContainText("Ordered: 2");
  // The count starts empty: it is never filled in with the ordered quantity.
  const arrived = receipt.getByLabel("Arrived: Concrete pit cover");
  await expect(arrived).toHaveValue("");
  await receipt.getByRole("button", { name: "Record delivery" }).click();
  await expect(receipt.getByRole("alert").first()).toBeVisible();
  await arrived.fill("2");
  await expect(page.locator("main")).not.toContainText(amount);
  await expectNoSidewaysScroll(page);
  await receipt.getByRole("button", { name: "Record delivery" }).click();
  await expect(page.getByTestId("task-success")).toHaveText(
    "Delivery recorded. 2 of 2 Concrete pit cover.",
  );
  await expect(page.getByTestId("staff-trail")).toHaveAttribute("data-prices", "hidden");
  await expect(page.locator("main")).not.toContainText(amount);
  await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
});
