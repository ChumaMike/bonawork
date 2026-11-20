/**
 * The leak test. A case is taken through the whole procurement trail with
 * amounts and names that occur nowhere else (canaries). Then every public
 * response is read as a signed-out visitor and as reporters, and searched:
 * no canary, no finance field name, and no finance step outside the public
 * trail of role, time and proof.
 */
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FINANCE_CASE_EVENT_TYPES,
  type ApproveWorkOrderInput,
  type MoneyTrail,
  type OrderLine,
} from "@/shared";
import type { Issue, IssueSummary, SchoolProfile } from "@/data/types";
import { schema } from "../db";
import {
  APPROVER_EMAIL,
  BUYER_EMAIL,
  DEMO_ACCOUNTS,
  DEMO_SUPPLIER_REF,
  PROCUREMENT_CASE_A_REFERENCE,
  PROCUREMENT_CASE_B_REFERENCE,
  RECEIVER_EMAIL,
  SUPPLIER_EMAIL,
} from "../seed";
import { body, createTestWorld, type TestWorld } from "../test/harness";
import { FINANCE_NOTE_CONSTANTS } from "./notes";
import {
  ADMIN,
  DEMO_SCHOOL,
  OTHER_REPORTER,
  REPORTER,
  REVIEWER,
  SIGNED_OUT,
  addAccount,
  api,
  invoiceFor,
  keysOf,
  openAssessedCase,
  sumOf,
  withoutPrices,
  type Cast,
  type Headers,
} from "./testkit";

/* --------------------------------- Canaries --------------------------------- */

/** Amounts in cents that appear nowhere else: seven digits, so no digest contains them by chance. */
const PRICE_A = 7_771_301;
const PRICE_B = 9_133_707;
const PRICE_WRONG = 8_464_219;
const lines: OrderLine[] = [
  {
    sku: "CANARYSKU-KESTREL",
    description: "Canarydesc heron",
    quantity: 2,
    unitPriceCents: PRICE_A,
  },
  {
    sku: "CANARYSKU-PLOVER",
    description: "Canarydesc ibis",
    quantity: 1,
    unitPriceCents: PRICE_B,
  },
];
const overcharged: OrderLine[] = [{ ...lines[0], unitPriceCents: PRICE_WRONG }, lines[1]];
const TOTAL = sumOf(lines);
const TOTAL_WRONG = sumOf(overcharged);

const CANARY_SUPPLIER = {
  ref: "SUP-CANARY-7731",
  name: "Canarytrade Kwikfix Builders",
  person: "Zanokuhle Canaryfinch",
};
const CANARY_SCOPE = "Canaryscope: rebuild the weaverbird store room wall.";
const CANARY_INVOICES = ["INV-CANARY-5521", "INV-CANARY-5522"];

/** Every way an amount could be written. */
function amountForms(cents: number): string[] {
  const rands = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  const spaced = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const comma = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return [
    String(cents),
    `${rands}.${fraction}`,
    `${rands},${fraction}`,
    `${spaced},${fraction}`,
    `${spaced}.${fraction}`,
    `${comma}.${fraction}`,
  ];
}

const financePeople = DEMO_ACCOUNTS.filter((a) =>
  [BUYER_EMAIL, SUPPLIER_EMAIL, RECEIVER_EMAIL, APPROVER_EMAIL].includes(a.email),
);

/** Strings that must never appear in a public response. */
const CANARIES: string[] = [
  ...[PRICE_A, PRICE_B, PRICE_WRONG, TOTAL, TOTAL_WRONG].flatMap(amountForms),
  CANARY_SUPPLIER.ref,
  CANARY_SUPPLIER.name,
  CANARY_SUPPLIER.person,
  "Canarytrade",
  "Canaryfinch",
  "CANARYSKU",
  "Canarydesc",
  "Canaryscope",
  ...CANARY_INVOICES,
  "INV-CANARY",
  // The seeded procurement people, their supplier and its reference.
  ...financePeople.map((a) => a.displayName),
  ...financePeople.map((a) => a.displayName.replace(/^(Ms|Mr|Mrs) /, "")),
  ...financePeople.map((a) => a.email),
  "Emseni Building and Electrical Supplies",
  DEMO_SUPPLIER_REF,
  "INV-2026-0931",
  "LED-TUBE-18W",
  "TANK-2500L",
];

/** No key of a public response may look like a finance field. */
const FINANCE_KEY = /amount|price|total|cents|supplier|invoice/i;

const FINANCE_TYPES = FINANCE_CASE_EVENT_TYPES as readonly string[];

function expectClean(what: string, payload: unknown): void {
  const text = JSON.stringify(payload);
  for (const canary of CANARIES) {
    expect(text.includes(canary), `${what} contains ${canary}`).toBe(false);
  }
  const keys = [...keysOf(payload)].filter((key) => FINANCE_KEY.test(key));
  expect(keys, `${what} has finance keys`).toEqual([]);
  expect(text, what).not.toMatch(/\bpaid\b/i);
}

/* ---------------------------------- Set-up ---------------------------------- */

let world: TestWorld;
let cast: Cast;
let id: string;
let reference: string;
let trail: MoneyTrail;
/** The viewers with no right to finance data: signed out, the case's reporter, another reporter. */
let publicViewers: [string, Headers][];

beforeAll(async () => {
  world = await createTestWorld();
  const supplier = await addAccount(world, {
    id: "00000000-0000-4000-8000-090000000201",
    role: "supplier",
    displayName: CANARY_SUPPLIER.person,
    supplier: { ref: CANARY_SUPPLIER.ref, name: CANARY_SUPPLIER.name },
  });
  cast = {
    reporter: world.as(REPORTER),
    admin: world.as(ADMIN),
    buyer: world.as(BUYER_EMAIL),
    supplier: supplier.headers,
    receiver: world.as(RECEIVER_EMAIL),
    reviewer: world.as(REVIEWER),
    approver: world.as(APPROVER_EMAIL),
  };
  publicViewers = [
    ["signed out", SIGNED_OUT],
    ["the reporter of the case", cast.reporter],
    ["another reporter", world.as(OTHER_REPORTER)],
  ];

  ({ id, reference } = await openAssessedCase(cast, "Store room wall is cracked"));
  const order: ApproveWorkOrderInput = {
    supplierRef: CANARY_SUPPLIER.ref,
    description: CANARY_SCOPE,
    lines,
  };
  const steps: [string, Response][] = [
    ["work order", await api.approve(id, order, cast.buyer)],
    ["acknowledgement", await api.acknowledge(id, cast.supplier)],
    [
      "goods receipt",
      await api.receive(id, { lines: withoutPrices(lines) }, cast.receiver),
    ],
    [
      "blocked invoice",
      await api.invoice(id, invoiceFor(CANARY_INVOICES[0], overcharged), cast.supplier),
    ],
    [
      "matched invoice",
      await api.invoice(
        id,
        {
          ...invoiceFor(CANARY_INVOICES[1], lines),
          aiDrafted: true,
          sourceText: "Canaryscope text",
        },
        cast.supplier,
      ),
    ],
    ["repair claim", await api.claim(id, cast.admin)],
    ["verification", await api.verify(id, cast.reviewer)],
    ["release", await api.release(id, cast.approver)],
  ];
  for (const [step, response] of steps) {
    if (response.status >= 300) throw new Error(`${step}: ${response.status}`);
  }
  trail = await body<MoneyTrail>(await api.trail(id, cast.buyer));
}, 90_000);

afterAll(async () => {
  await world.close();
});

/* ----------------------------------- Tests ---------------------------------- */

describe("public redaction of the procurement trail", () => {
  it("the canaries are real: the buyer's own view contains them", () => {
    const text = JSON.stringify(trail);
    for (const canary of [
      String(PRICE_A),
      String(PRICE_WRONG),
      String(TOTAL),
      CANARY_SUPPLIER.name,
      CANARY_SUPPLIER.ref,
      CANARY_SUPPLIER.person,
      CANARY_SCOPE,
      ...CANARY_INVOICES,
      "Ms Naledi Dlamini",
    ]) {
      expect(text, canary).toContain(canary);
    }
    expect(trail.stage).toBe("release_authorised");
    expect(trail.invoices.map((i) => i.match?.outcome)).toEqual(["blocked", "matched"]);
    expect([...keysOf(trail)].some((key) => FINANCE_KEY.test(key))).toBe(true);
  });

  it("the issue shows the steps as role, time and proof, and nothing else", async () => {
    for (const [who, headers] of publicViewers) {
      const response = await api.issue(id, headers);
      expect(response.status).toBe(200);
      const issue = await body<Issue>(response);
      expectClean(`issue for ${who}`, issue);

      expect(issue.publicTrail?.map((s) => [s.type, s.actor, s.outcome])).toEqual([
        ["work_order_approved", "buyer", undefined],
        ["work_order_acknowledged", "supplier", undefined],
        ["goods_receipt_recorded", "receiving_officer", undefined],
        ["invoice_submitted", "supplier", undefined],
        ["match_recorded", "system", "blocked"],
        ["invoice_submitted", "supplier", undefined],
        ["match_recorded", "system", "matched"],
        ["release_authorised", "payment_approver", undefined],
      ]);
      for (const step of issue.publicTrail ?? []) {
        expect(Object.keys(step).sort()).toEqual(
          step.type === "match_recorded"
            ? ["actor", "eventId", "ledger", "note", "occurredAt", "outcome", "type"]
            : ["actor", "eventId", "ledger", "note", "occurredAt", "type"],
        );
        expect(FINANCE_NOTE_CONSTANTS).toContain(step.note);
      }
      // Finance steps are in the public trail only: never on the timeline.
      expect(issue.timeline.filter((e) => FINANCE_TYPES.includes(e.type))).toEqual([]);
      expect(issue.timeline.map((e) => e.type)).toEqual([
        "reported",
        "evidence_added",
        "assessment_started",
        "repair_claimed",
        "verified",
      ]);
      for (const event of issue.timeline) {
        expect(FINANCE_NOTE_CONSTANTS).not.toContain(event.note);
      }
      // The report status is the repair's, untouched by the finance steps.
      expect(issue.status).toBe("independently_verified");
    }
  });

  it("the seeded procurement cases are just as clean", async () => {
    for (const [who, headers] of publicViewers) {
      for (const seeded of [PROCUREMENT_CASE_A_REFERENCE, PROCUREMENT_CASE_B_REFERENCE]) {
        const issue = await body<Issue>(await api.issue(seeded, headers));
        expectClean(`${seeded} for ${who}`, issue);
        expect(issue.publicTrail?.length).toBeGreaterThan(0);
        expect(issue.timeline.filter((e) => FINANCE_TYPES.includes(e.type))).toEqual([]);
      }
    }
  });

  it("the issue list carries no finance data", async () => {
    for (const [who, headers] of publicViewers) {
      for (const query of [
        "",
        `?schoolId=${DEMO_SCHOOL}`,
        "?query=wall",
        "?sort=most_affected",
      ]) {
        const response = await api.issues(headers, query);
        expect(response.status).toBe(200);
        const list = await body<IssueSummary[]>(response);
        expectClean(`issues${query} for ${who}`, list);
        // A summary has no timeline, trail or note at all.
        const keys = keysOf(list);
        for (const key of ["timeline", "publicTrail", "latestUpdates", "note", "steps"]) {
          expect(keys.has(key), `issues${query} has ${key}`).toBe(false);
        }
      }
      const list = await body<IssueSummary[]>(await api.issues(headers));
      expect(list.map((i) => i.reference)).toContain(reference);
    }
  });

  it("the school page and its latest updates carry no finance step", async () => {
    for (const [who, headers] of publicViewers) {
      const response = await api.school(DEMO_SCHOOL, headers);
      expect(response.status).toBe(200);
      const profile = await body<SchoolProfile>(response);
      expectClean(`school for ${who}`, profile);
      expect(profile.latestUpdates.length).toBeGreaterThan(0);
      for (const update of profile.latestUpdates) {
        expect(FINANCE_TYPES, update.event.type).not.toContain(update.event.type);
        expect(FINANCE_NOTE_CONSTANTS).not.toContain(update.event.note);
      }
    }
    // The release was the last thing to happen at this school; the newest
    // update shown is still the review before it.
    const profile = await body<SchoolProfile>(await api.school(DEMO_SCHOOL, SIGNED_OUT));
    expect(profile.latestUpdates[0]).toMatchObject({
      issueId: id,
      event: { type: "verified" },
    });
  });

  it("the documents route gives the public a proof and never a finance document", async () => {
    const records = await world.ctx.db
      .select({
        recordId: schema.commitmentDocuments.recordId,
        type: schema.commitmentDocuments.type,
      })
      .from(schema.commitmentDocuments)
      .where(eq(schema.commitmentDocuments.reportId, id));
    const finance = records.filter(
      (r) => !["report", "repair_claim", "review"].includes(r.type),
    );
    expect(finance.map((r) => r.type).sort()).toEqual([
      "goods_receipt",
      "match_result",
      "match_result",
      "release_decision",
      "supplier_invoice",
      "supplier_invoice",
      "work_order",
    ]);
    // By record id and by the case-event id the public trail hands out.
    const ids = [...finance.map((r) => r.recordId), ...trail.steps.map((s) => s.eventId)];
    for (const [who, headers] of publicViewers) {
      for (const recordId of ids) {
        const response = await api.document(id, recordId, headers);
        expect(response.status).toBe(200);
        const document = await body<Record<string, unknown>>(response);
        expectClean(`document ${recordId} for ${who}`, document);
        expect(Object.keys(document).sort()).toEqual([
          "commitment",
          "kind",
          "receipt",
          "recordId",
        ]);
      }
      // The documents of the repair itself stay public, and are clean too.
      for (const record of records.filter((r) => !finance.includes(r))) {
        const document = await body<Record<string, unknown>>(
          await api.document(id, record.recordId, headers),
        );
        expect(document.document, record.type).toBeDefined();
        expectClean(`${record.type} document for ${who}`, document);
      }
    }
  });

  it("the assistant and the submission receipt say nothing about the money", async () => {
    const questions = [
      `How much was the invoice for ${reference}?`,
      `Who is the supplier on ${reference} and what did they charge?`,
      "Store room wall is cracked",
      `What is the status of ${PROCUREMENT_CASE_B_REFERENCE}?`,
    ];
    for (const [who, headers] of publicViewers) {
      for (const question of questions) {
        const response = await api.assistant(question, headers);
        expect(response.status).toBe(200);
        expectClean(`assistant "${question}" for ${who}`, await body(response));
      }
      expectClean(
        `receipt for ${who}`,
        await body(await api.receipt(reference, headers)),
      );
    }
  });

  it("free text written into a finance event still cannot reach the public", async () => {
    // Simulate a row written by hand, or by a future bug: a note with an
    // amount, a supplier and a name on every finance event of the case.
    const leak = `LEAK ${CANARY_SUPPLIER.name} charged ${amountForms(TOTAL)[3]} approved by ${CANARY_SUPPLIER.person}`;
    const events = await world.ctx.db
      .select({ id: schema.caseEvents.id })
      .from(schema.caseEvents)
      .where(eq(schema.caseEvents.reportId, id));
    const financeIds = trail.steps.map((s) => s.eventId);
    expect(events.filter((e) => financeIds.includes(e.id))).toHaveLength(
      financeIds.length,
    );
    await world.ctx.db
      .update(schema.caseEvents)
      .set({ note: leak, reason: leak })
      .where(inArray(schema.caseEvents.id, financeIds));

    for (const [who, headers] of publicViewers) {
      const issue = await body<Issue>(await api.issue(id, headers));
      expectClean(`tampered issue for ${who}`, issue);
      expect(JSON.stringify(issue)).not.toContain("LEAK");
      for (const step of issue.publicTrail ?? []) {
        expect(FINANCE_NOTE_CONSTANTS).toContain(step.note);
      }
      const profile = await body<SchoolProfile>(await api.school(DEMO_SCHOOL, headers));
      expectClean(`tampered school for ${who}`, profile);
      expect(JSON.stringify(profile)).not.toContain("LEAK");
      expectClean(`tampered issues for ${who}`, await body(await api.issues(headers)));
    }
    // The signed-in trail is not a way round it either.
    const staff = await body<MoneyTrail>(await api.trail(id, cast.receiver));
    expect(JSON.stringify(staff)).not.toContain("LEAK");
  });

  it("the procurement routes themselves refuse the public", async () => {
    expect((await api.trail(id, SIGNED_OUT)).status).toBe(401);
    expect((await api.queue(SIGNED_OUT)).status).toBe(401);
    for (const headers of [cast.reporter, world.as(OTHER_REPORTER)]) {
      const refusedTrail = await api.trail(id, headers);
      expect(refusedTrail.status).toBe(403);
      expectClean("refused trail", await refusedTrail.json());
      expect((await api.queue(headers)).status).toBe(403);
    }
  });
});
