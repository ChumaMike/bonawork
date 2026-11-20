import { describe, expect, it } from "vitest";
import { matchThreeWay, ruleExplanation } from "@/shared";
import type { BonaApi } from "../api";
import type { MoneyTrail, SubmitInvoiceInput } from "../types";
import { createFixtureApi } from "./fixture-api";
import { draftInvoiceFromText } from "./invoice-text";
import { ReleaseBlockedError } from "../http-api";
import { buildSampleProcurement, CASE_A_LINES } from "./procurement-seed";
import {
  buildSampleIssues,
  CASE_A_ISSUE_ID as CASE_A,
  CASE_B_ISSUE_ID as CASE_B,
  isFinanceEvent,
  SAMPLE_ACCOUNTS,
  SAMPLE_PASSWORD,
} from "./seed";

const BUYER = "buyer@vaalridge.demo";
const SUPPLIER = "supplier@emseni-supplies.demo";
const RECEIVER = "receiving@thandolwethu.demo";
const APPROVER = "approver@vaalridge.demo";
const REVIEWER = "reviewer@district.demo";
const ADMIN = "admin@thuto-lesedi.demo";
const REPORTER = "parent@community.demo";

const newApi = () => createFixtureApi({ latency: 0, persist: false });

/** Switch the person using one browser: the data stays, the session changes. */
async function as(api: BonaApi, email: string): Promise<BonaApi> {
  await api.signIn(email, SAMPLE_PASSWORD);
  return api;
}

const total = (lines: SubmitInvoiceInput["lines"]) =>
  lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);

/** The invoice that agrees with Case A's order and delivery. */
const RIGHT: SubmitInvoiceInput = {
  invoiceNumber: "INV-2042",
  orderVersion: 1,
  lines: CASE_A_LINES,
  totalCents: total(CASE_A_LINES),
  aiDrafted: false,
};

/** One lock too many, at a higher price. */
const WRONG_LINES = CASE_A_LINES.map((line) =>
  line.sku === "GLASS-4MM"
    ? { ...line, quantity: 4, unitPriceCents: line.unitPriceCents + 5_000 }
    : line,
);
const WRONG: SubmitInvoiceInput = {
  invoiceNumber: "INV-2041",
  orderVersion: 1,
  lines: WRONG_LINES,
  totalCents: total(WRONG_LINES),
  aiDrafted: false,
};

/** Every key in a JSON value, however deep. */
function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      found.add(key);
      keysOf(inner, found);
    }
  }
  return found;
}

describe("sample procurement data", () => {
  it("has a sign-in for each procurement role, each a named person", () => {
    for (const role of ["buyer", "supplier", "receiving_officer", "payment_approver"]) {
      const account = SAMPLE_ACCOUNTS.find((a) => a.session.user.role === role);
      expect(account, role).toBeDefined();
      expect(account!.session.user.displayName).toMatch(/^(Ms|Mrs|Mr) [A-Z]\w+ /);
    }
  });

  it("starts Case A ready for an invoice and Case B with its release authorised", async () => {
    const api = await as(newApi(), BUYER);
    const a = (await api.getMoneyTrail(CASE_A))!;
    expect(a.stage).toBe("order_acknowledged");
    expect(a.order.acknowledged).toBe(true);
    expect(a.receipts).toHaveLength(1);
    expect(a.invoices).toHaveLength(0);

    const b = (await api.getMoneyTrail(CASE_B))!;
    expect(b.stage).toBe("release_authorised");
    expect(b.invoices.map((invoice) => invoice.match?.outcome)).toEqual([
      "blocked",
      "matched",
    ]);
    expect(b.releaseAuthorisedAt).not.toBeNull();
  });

  it("stores for Case B exactly the reasons the rule engine gives", () => {
    const record = buildSampleProcurement(buildSampleIssues())[CASE_B];
    const [first, second] = record.invoices;
    expect(
      matchThreeWay({
        order: record.order,
        invoice: first,
        priorInvoiceNumbers: [],
        receipts: record.receipts,
      }).reasons,
    ).toEqual(record.matches[0].reasons);
    expect(
      matchThreeWay({
        order: record.order,
        invoice: second,
        priorInvoiceNumbers: [first.invoiceNumber],
        receipts: record.receipts,
      }).outcome,
    ).toBe("matched");
  });

  it("keeps procurement steps off the issue timeline: they are on the trail only", async () => {
    const api = await as(newApi(), SUPPLIER);
    const before = (await api.getIssue(CASE_A))!;
    await api.submitInvoice(CASE_A, RIGHT);
    const after = (await api.getIssue(CASE_A))!;
    expect(after.timeline).toEqual(before.timeline);
    expect(after.publicTrail!.map((step) => step.type)).toEqual([
      ...before.publicTrail!.map((step) => step.type),
      "invoice_submitted",
      "match_recorded",
    ]);
    for (const issue of buildSampleIssues()) {
      expect(issue.timeline.map((event) => event.type).filter(isFinanceEvent)).toEqual(
        [],
      );
    }
    const school = (await api.getSchool(after.schoolId))!;
    expect(
      school.latestUpdates.map((update) => update.event.type).filter(isFinanceEvent),
    ).toEqual([]);
  });

  it("leaves the report statuses alone: a finance step never verifies a repair", async () => {
    const api = newApi();
    expect((await api.getIssue(CASE_A))?.status).toBe("repair_claimed");
    await as(api, SUPPLIER);
    await api.submitInvoice(CASE_A, RIGHT);
    expect((await api.getIssue(CASE_A))?.status).toBe("repair_claimed");
  });
});

describe("each step belongs to one role", () => {
  it("refuses everyone who is not signed in", async () => {
    const api = newApi();
    await expect(api.listWorkQueue()).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(api.getMoneyTrail(CASE_A)).rejects.toMatchObject({
      code: "unauthenticated",
    });
    await expect(api.authoriseRelease(CASE_A)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("gives a community reporter no procurement data at all", async () => {
    const api = await as(newApi(), REPORTER);
    await expect(api.listWorkQueue()).rejects.toMatchObject({ code: "forbidden" });
    await expect(api.getMoneyTrail(CASE_B)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses a role that tries another role's step", async () => {
    const api = newApi();
    const order = {
      supplierRef: "SUP-2026-0417",
      description: "Unblock the toilets.",
      lines: [{ sku: "A", description: "Work", quantity: 1, unitPriceCents: 100 }],
    };
    const receipt = {
      lines: CASE_A_LINES.map(({ sku, description, quantity }) => ({
        sku,
        description,
        quantity,
      })),
    };

    await as(api, SUPPLIER);
    await expect(api.approveWorkOrder("issue-118", order)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.recordGoodsReceipt(CASE_A, receipt)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.authoriseRelease(CASE_A)).rejects.toMatchObject({
      code: "forbidden",
    });

    await as(api, BUYER);
    await expect(api.submitInvoice(CASE_A, RIGHT)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.acknowledgeOrder(CASE_A)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.authoriseRelease(CASE_A)).rejects.toMatchObject({
      code: "forbidden",
    });

    await as(api, RECEIVER);
    await expect(api.submitInvoice(CASE_A, RIGHT)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.authoriseRelease(CASE_A)).rejects.toMatchObject({
      code: "forbidden",
    });

    // The reviewer and the school may read the trail, and change nothing on it.
    for (const reader of [REVIEWER, ADMIN]) {
      await as(api, reader);
      await expect(api.approveWorkOrder("issue-118", order)).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(api.authoriseRelease(CASE_A)).rejects.toMatchObject({
        code: "forbidden",
      });
    }

    await as(api, APPROVER);
    await expect(api.approveWorkOrder("issue-118", order)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.submitInvoice(CASE_A, RIGHT)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.recordGoodsReceipt(CASE_A, receipt)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.verifyCompletion(CASE_A, "Looks fine.")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("shows a supplier its own orders only", async () => {
    const api = await as(newApi(), SUPPLIER);
    expect((await api.getMoneyTrail(CASE_A))?.order.supplierRef).toBe("SUP-2026-0417");
    // Case B belongs to another supplier: for this one it does not exist.
    expect(await api.getMoneyTrail(CASE_B)).toBeNull();
    expect((await api.listWorkQueue()).map((item) => item.issueId)).toEqual([CASE_A]);
    await expect(api.submitInvoice(CASE_B, RIGHT)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(api.draftInvoice(CASE_B, "Invoice number: X")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("the work queue shows each person only what needs them", () => {
  it("gives the buyer the reports that wait for a work order", async () => {
    const api = await as(newApi(), BUYER);
    const queue = await api.listWorkQueue();
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((item) => item.action === "approve_order")).toBe(true);
    expect(queue.every((item) => item.workOrderId === null)).toBe(true);
    expect(queue.map((item) => item.issueId)).not.toContain(CASE_A);
    // Oldest wait first.
    const waits = queue.map((item) => item.since);
    expect(waits).toEqual([...waits].sort());
  });

  it("walks a new order from the buyer to the supplier to the receiving officer", async () => {
    const api = await as(newApi(), BUYER);
    await expect(
      api.approveWorkOrder("issue-118", {
        supplierRef: "SUP-2026-9999",
        description: "Unblock four toilets.",
        lines: [{ sku: "A", description: "Work", quantity: 1, unitPriceCents: 100 }],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    const approved = await api.approveWorkOrder("issue-118", {
      supplierRef: "sup-2026-0417",
      description: "Unblock four toilets in Block B.",
      lines: [
        {
          sku: "PLB-CALL",
          description: "Plumber call-out",
          quantity: 1,
          unitPriceCents: 95_000,
        },
        {
          sku: "PLB-HR",
          description: "Labour hours",
          quantity: 6,
          unitPriceCents: 42_000,
        },
      ],
    });
    expect(approved.stage).toBe("order_approved");
    expect(approved.order.totalCents).toBe(95_000 + 6 * 42_000);
    expect(approved.order.supplierName).toBe("Emseni Building and Electrical Supplies");
    expect(approved.steps.at(-1)).toMatchObject({
      type: "work_order_approved",
      actor: "buyer",
      actorName: "Ms Naledi Dlamini",
    });
    expect((await api.listWorkQueue()).map((item) => item.issueId)).not.toContain(
      "issue-118",
    );

    await as(api, RECEIVER);
    expect((await api.listWorkQueue()).map((item) => item.issueId)).toEqual([]);

    await as(api, SUPPLIER);
    expect(await api.listWorkQueue()).toContainEqual(
      expect.objectContaining({ issueId: "issue-118", action: "acknowledge_order" }),
    );
    expect((await api.acknowledgeOrder("issue-118")).stage).toBe("order_acknowledged");
    await expect(api.acknowledgeOrder("issue-118")).rejects.toMatchObject({
      code: "conflict",
    });

    await as(api, RECEIVER);
    expect(await api.listWorkQueue()).toEqual([
      expect.objectContaining({ issueId: "issue-118", action: "record_receipt" }),
    ]);
    const received = await api.recordGoodsReceipt("issue-118", {
      lines: [
        { sku: "PLB-CALL", description: "Plumber call-out", quantity: 1 },
        { sku: "PLB-HR", description: "Labour hours", quantity: 6 },
      ],
    });
    expect(received.receipts).toHaveLength(1);
    expect(await api.listWorkQueue()).toEqual([]);

    // One work order per report: a second one is refused.
    await as(api, BUYER);
    await expect(
      api.approveWorkOrder("issue-118", {
        supplierRef: "SUP-2026-0417",
        description: "Again.",
        lines: [{ sku: "A", description: "Work", quantity: 1, unitPriceCents: 100 }],
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps a receiving officer to deliveries at their own school", async () => {
    const api = await as(newApi(), RECEIVER);
    // Case B is at another school.
    await expect(
      api.recordGoodsReceipt(CASE_B, {
        lines: [{ sku: "FENCE-POST", description: "Concrete fence post", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("the rule engine decides whether an invoice matches", () => {
  it("blocks the wrong invoice with reasons, then matches the right one", async () => {
    const api = await as(newApi(), SUPPLIER);
    const blocked = await api.submitInvoice(CASE_A, WRONG);
    expect(blocked.stage).toBe("invoice_blocked");
    const result = blocked.invoices.at(-1)!.match!;
    expect(result.outcome).toBe("blocked");
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      "excess_quantity",
      "quantity_mismatch",
      "unit_price_mismatch",
      "total_mismatch",
    ]);
    // Still the supplier's turn.
    expect(await api.listWorkQueue()).toContainEqual(
      expect.objectContaining({ issueId: CASE_A, action: "submit_invoice" }),
    );

    const explanation = await api.explainMismatch(CASE_A, result.id);
    expect(explanation).toEqual({
      source: "rules",
      text: ruleExplanation(result.reasons),
    });

    const matched = await api.submitInvoice(CASE_A, RIGHT);
    expect(matched.invoices).toHaveLength(2);
    expect(matched.invoices.at(-1)!.match).toMatchObject({
      outcome: "matched",
      reasons: [],
    });
    // Matched, and the repair is only claimed: the reviewer comes next.
    expect(matched.stage).toBe("awaiting_verification");
    expect(await api.listWorkQueue()).toEqual([]);

    // The engine is a step of its own on the timeline, written by nobody.
    const steps = matched.steps.slice(-2);
    expect(steps.map((step) => [step.type, step.actor, step.actorName])).toEqual([
      ["invoice_submitted", "supplier", "Mr Themba Zulu"],
      ["match_recorded", "system", null],
    ]);
    expect(steps[1].occurredAt > steps[0].occurredAt).toBe(true);
  });

  it("blocks an invoice number that was already used on the order", async () => {
    const api = await as(newApi(), SUPPLIER);
    await api.submitInvoice(CASE_A, WRONG);
    const again = await api.submitInvoice(CASE_A, {
      ...RIGHT,
      invoiceNumber: "inv-2041",
    });
    expect(again.invoices.at(-1)!.match!.reasons.map((reason) => reason.code)).toEqual([
      "duplicate_invoice",
    ]);
  });

  it("checks the invoice again when a later delivery is recorded", async () => {
    const api = await as(newApi(), SUPPLIER);
    await api.submitInvoice(CASE_A, RIGHT);
    await as(api, RECEIVER);
    const after = await api.recordGoodsReceipt(CASE_A, {
      lines: [
        { sku: "GLASS-4MM", description: "Clear float glass pane, 4 mm", quantity: 0 },
      ],
    });
    expect(after.receipts).toHaveLength(2);
    expect(after.steps.slice(-2).map((step) => step.type)).toEqual([
      "goods_receipt_recorded",
      "match_recorded",
    ]);
    expect(after.invoices.at(-1)!.match!.outcome).toBe("matched");
  });

  it("refuses details that are missing or wrong", async () => {
    const api = await as(newApi(), SUPPLIER);
    await expect(
      api.submitInvoice(CASE_A, { ...RIGHT, invoiceNumber: " " }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      api.submitInvoice(CASE_A, { ...RIGHT, totalCents: 10.5 }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      api.submitInvoice(CASE_A, { ...RIGHT, lines: [] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect((await api.getMoneyTrail(CASE_A))!.invoices).toHaveLength(0);
  });
});

describe("the release gate", () => {
  it("stays locked until the invoice matches and the reviewer verifies, then opens once", async () => {
    const api = await as(newApi(), APPROVER);
    const start = (await api.getMoneyTrail(CASE_A))!;
    expect(start.gate).toEqual({
      open: false,
      blockers: [{ code: "repair_not_verified" }, { code: "no_matching_invoice" }],
    });
    expect(await api.listWorkQueue()).toEqual([
      expect.objectContaining({
        issueId: CASE_A,
        action: "authorise_release",
        blockers: start.gate.blockers,
      }),
    ]);
    const refused = await api.authoriseRelease(CASE_A).catch((error) => error);
    expect(refused).toBeInstanceOf(ReleaseBlockedError);
    expect(refused).toMatchObject({ code: "conflict", blockers: start.gate.blockers });

    await as(api, SUPPLIER);
    await api.submitInvoice(CASE_A, WRONG);
    await as(api, APPROVER);
    expect((await api.getMoneyTrail(CASE_A))!.gate.blockers).toEqual(start.gate.blockers);

    await as(api, SUPPLIER);
    await api.submitInvoice(CASE_A, RIGHT);
    await as(api, APPROVER);
    expect((await api.getMoneyTrail(CASE_A))!.gate).toEqual({
      open: false,
      blockers: [{ code: "repair_not_verified" }],
    });
    await expect(api.authoriseRelease(CASE_A)).rejects.toMatchObject({
      code: "conflict",
    });

    await as(api, REVIEWER);
    await api.verifyCompletion(CASE_A, "All three panes are in and sealed.");
    await as(api, APPROVER);
    const ready = (await api.getMoneyTrail(CASE_A))!;
    expect(ready.stage).toBe("ready_for_release");
    expect(ready.gate).toEqual({ open: true, blockers: [] });

    const released = await api.authoriseRelease(CASE_A);
    expect(released.stage).toBe("release_authorised");
    expect(released.releaseAuthorisedAt).not.toBeNull();
    expect(released.steps.at(-1)).toMatchObject({
      type: "release_authorised",
      actor: "payment_approver",
      actorName: "Mr Pieter van Wyk",
    });
    expect(released.gate.blockers).toEqual([{ code: "already_released" }]);
    // The report status is the reviewer's, not the approver's.
    expect((await api.getIssue(CASE_A))?.status).toBe("independently_verified");

    // Once only, and nothing on the order can change afterwards.
    await expect(api.authoriseRelease(CASE_A)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await api.listWorkQueue()).toEqual([]);
    await as(api, SUPPLIER);
    await expect(api.submitInvoice(CASE_A, RIGHT)).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("does not open for a disputed repair", async () => {
    const api = await as(newApi(), SUPPLIER);
    await api.submitInvoice(CASE_A, RIGHT);
    await as(api, REVIEWER);
    await api.disputeCompletion(CASE_A, "One pane is still cracked.");
    await as(api, APPROVER);
    expect((await api.getMoneyTrail(CASE_A))!.gate.blockers).toEqual([
      { code: "repair_not_verified" },
    ]);
  });
});

describe("who sees what", () => {
  const PRICE_KEYS = ["unitPriceCents", "totalCents"];

  async function trailAs(email: string, issueId = CASE_B): Promise<MoneyTrail | null> {
    return (await as(newApi(), email)).getMoneyTrail(issueId);
  }

  it("shows the buyer and the payment approver everything, with names", async () => {
    for (const email of [BUYER, APPROVER]) {
      const trail = (await trailAs(email))!;
      expect(trail.pricesVisible).toBe(true);
      expect(trail.order.totalCents).toBe(2_055_000);
      expect(trail.order.lines[0].unitPriceCents).toBe(115_000);
      expect(trail.invoices[0].totalCents).toBe(2_095_000);
      expect(trail.invoices[0].match!.reasons[0]).toMatchObject({
        code: "unit_price_mismatch",
        expected: 48_000,
        actual: 52_000,
      });
      expect(trail.steps.map((step) => step.actorName)).toContain("Ms Naledi Dlamini");
    }
  });

  it("shows the supplier its own prices", async () => {
    const api = await as(newApi(), SUPPLIER);
    await api.submitInvoice(CASE_A, WRONG);
    const trail = (await api.getMoneyTrail(CASE_A))!;
    expect(trail.pricesVisible).toBe(true);
    expect(trail.order.totalCents).toBe(420_000);
    expect(trail.invoices[0].totalCents).toBe(WRONG.totalCents);
  });

  it("gives the receiving officer, the school and the reviewer names and quantities, never a price", async () => {
    for (const email of [RECEIVER, ADMIN, REVIEWER]) {
      const trail = (await trailAs(email))!;
      expect(trail.pricesVisible).toBe(false);
      const keys = keysOf(trail);
      for (const key of PRICE_KEYS) expect(keys.has(key), `${email} ${key}`).toBe(false);
      // The reason is still named; its amounts are gone.
      expect(trail.invoices[0].match!.reasons).toEqual([
        { code: "unit_price_mismatch", sku: "FENCE-POST", expected: null, actual: null },
        { code: "total_mismatch", sku: null, expected: null, actual: null },
      ]);
      expect(JSON.stringify(trail)).not.toMatch(/48000|52000|2055000|2095000/);
      expect(trail.order.lines.map((line) => line.quantity)).toEqual([9, 10, 3]);
      expect(trail.order.supplierName).toBe("Mahlangu Fencing");
      expect(trail.steps[0].actorName).toBe("Ms Naledi Dlamini");

      // The plain explanation is written from what this person may see.
      const api = await as(newApi(), email);
      const { text } = await api.explainMismatch(CASE_B, trail.invoices[0].match!.id);
      expect(text).not.toMatch(/R\s?\d/);
    }
  });

  it("gives the public the steps, the roles, the times and the proof, and nothing else", async () => {
    const api = newApi();
    for (const reader of [null, REPORTER]) {
      if (reader) await as(api, reader);
      const issue = (await api.getIssue(CASE_B))!;
      const trail = issue.publicTrail!;
      expect(trail.map((step) => step.type)).toEqual([
        "work_order_approved",
        "work_order_acknowledged",
        "goods_receipt_recorded",
        "invoice_submitted",
        "match_recorded",
        "invoice_submitted",
        "match_recorded",
        "release_authorised",
      ]);
      for (const step of trail) {
        const allowed = ["eventId", "type", "actor", "occurredAt", "note", "ledger"];
        expect(
          Object.keys(step).every((key) => [...allowed, "outcome"].includes(key)),
        ).toBe(true);
      }
      const payload = JSON.stringify([
        issue,
        await api.listIssues(),
        await api.getSchool(issue.schoolId),
      ]);
      // No supplier, no person, no amount, no invoice number, no line item.
      for (const secret of [
        "Mahlangu",
        "Emseni",
        "Zulu",
        "Dlamini",
        "Ngcobo",
        "van Wyk",
        "SUP-2",
        "INV-",
        "FENCE-POST",
        "115000",
        "2055000",
        "2095000",
        "unitPriceCents",
        "totalCents",
        "actorName",
      ]) {
        expect(payload.includes(secret), `${reader ?? "signed out"}: ${secret}`).toBe(
          false,
        );
      }
    }
  });

  it("hands a procurement document only to people who may read that trail", async () => {
    const api = newApi();
    const issue = (await api.getIssue(CASE_B))!;
    const order = issue.publicTrail!.find((step) => step.type === "work_order_approved")!;

    const signedOut = await api.getRecordProof(CASE_B, order.eventId);
    expect(signedOut?.receipt).toBeTruthy();
    expect(signedOut && "document" in signedOut).toBe(false);

    await as(api, REPORTER);
    const reporter = await api.getRecordProof(CASE_B, order.eventId);
    expect(reporter && "document" in reporter).toBe(false);

    // Another supplier's order is not this supplier's to read.
    await as(api, SUPPLIER);
    const stranger = await api.getRecordProof(CASE_B, order.eventId);
    expect(stranger && "document" in stranger).toBe(false);

    await as(api, APPROVER);
    expect((await api.getRecordProof(CASE_B, order.eventId))?.document).toMatchObject({
      type: "work_order",
      sample: true,
    });

    // Without prices: only the two documents that hold none.
    await as(api, REVIEWER);
    const priced = await api.getRecordProof(CASE_B, order.eventId);
    expect(priced && "document" in priced).toBe(false);
    const delivery = issue.publicTrail!.find(
      (step) => step.type === "goods_receipt_recorded",
    )!;
    expect((await api.getRecordProof(CASE_B, delivery.eventId))?.document).toMatchObject({
      type: "goods_receipt",
    });
    const release = issue.publicTrail!.find(
      (step) => step.type === "release_authorised",
    )!;
    expect((await api.getRecordProof(CASE_B, release.eventId))?.document).toMatchObject({
      type: "release_decision",
    });
  });
});

describe("the invoice draft never invents a field", () => {
  const TEXT = [
    "Emseni Building and Electrical Supplies",
    "Invoice number: INV-2042",
    "Order version: 1",
    "3 x [GLASS-4MM] Clear float glass pane, 4 mm @ R 650.00",
    "3 x [PUTTY-KIT] Glazing putty and beading kit @ R 150.00",
    "3 x [LAB-GLAZE] Glazier labour, per pane @ R 600.00",
    "Total: R 4 200.00",
  ].join("\n");

  it("reads every labelled field of a complete invoice", () => {
    expect(draftInvoiceFromText(TEXT)).toEqual({
      invoiceNumber: "INV-2042",
      orderVersion: 1,
      lines: CASE_A_LINES,
      totalCents: 420_000,
      missing: [],
    });
  });

  it("leaves what the text does not say empty, and lists it", () => {
    const draft = draftInvoiceFromText(
      [
        "Invoice for the school doors",
        "3 x Three-lever mortice lockset",
        "Total: lots",
      ].join("\n"),
    );
    expect(draft).toEqual({
      invoiceNumber: null,
      orderVersion: null,
      lines: [
        {
          sku: null,
          description: "Three-lever mortice lockset",
          quantity: 3,
          unitPriceCents: null,
        },
      ],
      totalCents: null,
      missing: [
        "invoiceNumber",
        "orderVersion",
        "lines[0].sku",
        "lines[0].unitPriceCents",
        "totalCents",
      ],
    });
    expect(draftInvoiceFromText("Thank you for your business.")).toEqual({
      invoiceNumber: null,
      orderVersion: null,
      lines: [],
      totalCents: null,
      missing: ["invoiceNumber", "orderVersion", "lines", "totalCents"],
    });
  });

  it("is what the supplier gets from the draft call, which writes nothing", async () => {
    const api = await as(newApi(), SUPPLIER);
    expect(await api.draftInvoice(CASE_A, TEXT)).toEqual(draftInvoiceFromText(TEXT));
    expect((await api.getMoneyTrail(CASE_A))!.invoices).toHaveLength(0);
    await expect(api.draftInvoice(CASE_A, "  ")).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});
