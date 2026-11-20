/**
 * The procurement services, called directly: one case from work order to
 * release instruction, with the checks each step makes on the way.
 */
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FINANCE_CASE_EVENT_TYPES, type OrderLine, type UserRole } from "@/shared";
import { schema } from "../db";
import { HttpError } from "../http";
import { submitRepairClaim } from "../reports/admin";
import { actorOf, type Actor } from "../reports/common";
import { submitVerification } from "../reports/review";
import { createTestWorld, reportByReference, type TestWorld } from "../test/harness";
import { submitInvoice } from "./invoices";
import { FINANCE_NOTE_CONSTANTS } from "./notes";
import { acknowledgeOrder, approveWorkOrder } from "./orders";
import { listWorkQueue } from "./queue";
import { recordGoodsReceipt } from "./receipts";
import { ReleaseBlockedError, authoriseRelease } from "./release";
import { loadGateForViewer, loadMatchForViewer, loadMoneyTrail } from "./view";

/** An assessed case at the demo school with no work order. */
const CASE = "BB-2026-000045";
const uid = (n: number) =>
  `00000000-0000-4000-8000-0900000000${String(n).padStart(2, "0")}`;

let world: TestWorld;
const people = {} as Record<
  "buyer" | "supplier" | "rival" | "receiver" | "approver" | "admin" | "reviewer",
  Actor
>;

const lines: OrderLine[] = [
  { sku: "BOARD-01", description: "Ceiling board", quantity: 6, unitPriceCents: 42_000 },
  { sku: "LABOUR-01", description: "Fitting", quantity: 1, unitPriceCents: 180_000 },
];
const TOTAL = 6 * 42_000 + 180_000;

async function addUser(
  n: number,
  role: UserRole,
  displayName: string,
  supplier?: { ref: string; name: string },
): Promise<Actor> {
  const row = {
    id: uid(n),
    email: `services-test-${n}@procurement.test`,
    passwordHash: "x",
    role,
    institutionId: null,
    displayName,
    publicLabel: role,
    supplierRef: supplier?.ref ?? null,
    supplierName: supplier?.name ?? null,
    createdAt: "2026-11-01T08:00:00.000Z",
  };
  await world.ctx.db.insert(schema.users).values(row);
  return actorOf(row);
}

const deps = () => ({
  db: world.ctx.db,
  ledger: world.ctx.ledger,
  store: world.ctx.store,
});
const target = { reportIdOrReference: CASE };

async function refusal(run: () => Promise<unknown>): Promise<HttpError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error("expected the call to be refused");
}

beforeAll(async () => {
  world = await createTestWorld();
  people.buyer = await addUser(1, "buyer", "Test Buyer");
  people.supplier = await addUser(2, "supplier", "Test Supplier", {
    ref: "SUP-TEST-01",
    name: "Test Ceilings",
  });
  people.rival = await addUser(3, "supplier", "Rival Supplier", {
    ref: "SUP-TEST-02",
    name: "Rival Ceilings",
  });
  people.receiver = await addUser(4, "receiving_officer", "Test Receiver");
  people.approver = await addUser(5, "payment_approver", "Test Approver");
  const users = await world.ctx.db.select().from(schema.users);
  people.admin = actorOf(users.find((u) => u.email === "admin@thandolwethu.demo")!);
  people.reviewer = actorOf(users.find((u) => u.email === "reviewer@vaalridge.demo")!);
}, 60_000);

afterAll(async () => {
  await world.close();
});

describe("procurement services", () => {
  it("refuses a work order from anyone but a buyer, and for an unknown supplier", async () => {
    const order = { supplierRef: "SUP-TEST-01", description: "Replace the board", lines };
    for (const actor of [
      people.supplier,
      people.receiver,
      people.approver,
      people.admin,
    ]) {
      expect(
        (await refusal(() => approveWorkOrder(deps(), { ...target, actor, order }))).code,
      ).toBe("forbidden");
    }
    const unknown = await refusal(() =>
      approveWorkOrder(deps(), {
        ...target,
        actor: people.buyer,
        order: { ...order, supplierRef: "SUP-NOBODY" },
      }),
    );
    expect(unknown.code).toBe("invalid_input");
    const twice = await refusal(() =>
      approveWorkOrder(deps(), {
        ...target,
        actor: people.buyer,
        order: { ...order, lines: [lines[0], lines[0]] },
      }),
    );
    expect(twice.code).toBe("invalid_input");
  });

  it("walks one case from work order to release instruction", async () => {
    const report = await reportByReference(world, CASE);
    const before = report.status;

    // Buyer: the queue offers the case, then the order is approved.
    expect(
      (await listWorkQueue(world.ctx.db, people.buyer)).map((i) => [
        i.reference,
        i.action,
      ]),
    ).toContainEqual([CASE, "approve_order"]);
    await approveWorkOrder(deps(), {
      ...target,
      actor: people.buyer,
      order: { supplierRef: "sup-test-01", description: "Replace the board", lines },
    });
    let trail = await loadMoneyTrail(world.ctx, CASE, people.buyer);
    expect(trail.stage).toBe("order_approved");
    expect(trail.order).toMatchObject({
      version: 1,
      supplierName: "Test Ceilings",
      supplierRef: "SUP-TEST-01",
      totalCents: TOTAL,
      acknowledged: false,
    });
    expect(
      (await listWorkQueue(world.ctx.db, people.buyer)).map((i) => i.reference),
    ).not.toContain(CASE);

    // An approved order cannot be approved again, and nothing is invoiced before it is acknowledged.
    expect(
      (
        await refusal(() =>
          approveWorkOrder(deps(), {
            ...target,
            actor: people.buyer,
            order: { supplierRef: "SUP-TEST-01", description: "Changed my mind", lines },
          }),
        )
      ).code,
    ).toBe("conflict");
    expect(
      (
        await refusal(() =>
          submitInvoice(deps(), {
            ...target,
            actor: people.supplier,
            invoice: {
              invoiceNumber: "INV-099",
              orderVersion: 1,
              lines,
              totalCents: TOTAL,
              aiDrafted: false,
            },
          }),
        )
      ).code,
    ).toBe("invalid_transition");

    // Supplier: only the supplier the order names may acknowledge it.
    expect(
      (await refusal(() => acknowledgeOrder(deps(), { ...target, actor: people.rival })))
        .code,
    ).toBe("forbidden");
    expect(
      (await listWorkQueue(world.ctx.db, people.supplier)).map((i) => [
        i.reference,
        i.action,
      ]),
    ).toEqual([[CASE, "acknowledge_order"]]);
    expect(await listWorkQueue(world.ctx.db, people.rival)).toEqual([]);
    await acknowledgeOrder(deps(), { ...target, actor: people.supplier });
    expect(
      (
        await refusal(() =>
          acknowledgeOrder(deps(), { ...target, actor: people.supplier }),
        )
      ).code,
    ).toBe("conflict");

    // Receiving officer: five of the six boards arrive.
    expect(
      (await listWorkQueue(world.ctx.db, people.receiver)).map((i) => [
        i.reference,
        i.action,
      ]),
    ).toEqual([[CASE, "record_receipt"]]);
    expect(
      (
        await refusal(() =>
          recordGoodsReceipt(deps(), {
            ...target,
            actor: people.receiver,
            receipt: { lines: [{ sku: "PAINT-09", description: "Paint", quantity: 1 }] },
          }),
        )
      ).code,
    ).toBe("invalid_input");
    await recordGoodsReceipt(deps(), {
      ...target,
      actor: people.receiver,
      receipt: {
        lines: [
          { sku: "BOARD-01", description: "Ceiling board", quantity: 5 },
          { sku: "LABOUR-01", description: "Fitting", quantity: 1 },
        ],
      },
    });
    expect(await listWorkQueue(world.ctx.db, people.receiver)).toEqual([]);

    // Supplier: an invoice for six boards at a higher price is blocked, with every reason.
    await submitInvoice(deps(), {
      ...target,
      actor: people.supplier,
      invoice: {
        invoiceNumber: "INV-100",
        orderVersion: 1,
        lines: [{ ...lines[0], unitPriceCents: 45_000 }, lines[1]],
        totalCents: 6 * 45_000 + 180_000,
        aiDrafted: false,
      },
    });
    trail = await loadMoneyTrail(world.ctx, CASE, people.buyer);
    expect(trail.stage).toBe("invoice_blocked");
    expect(trail.invoices[0].match).toMatchObject({
      outcome: "blocked",
      reasons: [
        { code: "excess_quantity", sku: "BOARD-01", expected: 5, actual: 6 },
        {
          code: "unit_price_mismatch",
          sku: "BOARD-01",
          expected: 42_000,
          actual: 45_000,
        },
        { code: "total_mismatch", sku: null, expected: TOTAL, actual: 450_000 },
      ],
    });
    expect(
      (await listWorkQueue(world.ctx.db, people.supplier)).map((i) => [
        i.action,
        i.stage,
      ]),
    ).toEqual([["submit_invoice", "invoice_blocked"]]);
    expect(await listWorkQueue(world.ctx.db, people.approver)).toEqual([]);

    // The sixth board arrives: the match reruns over the same invoice, still blocked on price.
    await recordGoodsReceipt(deps(), {
      ...target,
      actor: people.receiver,
      receipt: {
        lines: [{ sku: "BOARD-01", description: "Ceiling board", quantity: 1 }],
      },
    });
    trail = await loadMoneyTrail(world.ctx, CASE, people.buyer);
    expect(trail.invoices[0].match?.reasons.map((r) => r.code)).toEqual([
      "unit_price_mismatch",
      "total_mismatch",
    ]);

    // A corrected invoice matches. A reused number would not.
    await submitInvoice(deps(), {
      ...target,
      actor: people.supplier,
      invoice: {
        invoiceNumber: "INV-101",
        orderVersion: 1,
        lines,
        totalCents: TOTAL,
        aiDrafted: true,
        sourceText: "Invoice INV-101 ...",
      },
    });
    trail = await loadMoneyTrail(world.ctx, CASE, people.approver);
    expect(trail.stage).toBe("invoice_matched");
    expect(trail.invoices.map((i) => i.match?.outcome)).toEqual(["blocked", "matched"]);
    expect(trail.invoices[1].aiDrafted).toBe(true);
    const [stored] = await world.ctx.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.invoiceNumber, "INV-101"));
    expect(stored.sourceTextDigest).toMatch(/^0x[0-9a-f]{64}$/);

    // Payment approver: the gate is shut until an independent reviewer verifies the repair.
    expect(trail.gate).toEqual({
      open: false,
      blockers: [{ code: "repair_not_verified" }],
    });
    expect(
      (await listWorkQueue(world.ctx.db, people.approver)).map((i) => [
        i.action,
        i.blockers,
      ]),
    ).toEqual([["authorise_release", [{ code: "repair_not_verified" }]]]);
    const early = await refusal(() =>
      authoriseRelease(deps(), { ...target, actor: people.approver }),
    );
    expect(early).toBeInstanceOf(ReleaseBlockedError);
    expect((early as ReleaseBlockedError).blockers).toEqual([
      { code: "repair_not_verified" },
    ]);
    expect(
      (await refusal(() => authoriseRelease(deps(), { ...target, actor: people.buyer })))
        .code,
    ).toBe("forbidden");

    await submitRepairClaim(deps(), {
      ...target,
      actor: people.admin,
      note: "Board replaced.",
      uploads: [],
    });
    expect((await loadMoneyTrail(world.ctx, CASE, people.approver)).stage).toBe(
      "awaiting_verification",
    );
    await submitVerification(deps(), {
      ...target,
      actor: people.reviewer,
      outcome: "verified",
      note: "Checked on site.",
      uploads: [],
    });
    trail = await loadMoneyTrail(world.ctx, CASE, people.approver);
    expect(trail.stage).toBe("ready_for_release");
    expect(trail.gate).toEqual({ open: true, blockers: [] });

    await authoriseRelease(deps(), { ...target, actor: people.approver });
    trail = await loadMoneyTrail(world.ctx, CASE, people.approver);
    expect(trail.stage).toBe("release_authorised");
    expect(trail.releaseAuthorisedAt).not.toBeNull();
    expect(trail.gate.blockers).toEqual([{ code: "already_released" }]);
    const again = await refusal(() =>
      authoriseRelease(deps(), { ...target, actor: people.approver }),
    );
    expect((again as ReleaseBlockedError).blockers).toEqual([
      { code: "already_released" },
    ]);
    expect(await listWorkQueue(world.ctx.db, people.approver)).toEqual([]);

    // Finance steps never changed the report status; only the claim and the review did.
    expect(before).toBe("acknowledged");
    expect((await reportByReference(world, CASE)).status).toBe("verified");
  });

  it("writes only code constants into the public case events, with no actor on the rule engine's", async () => {
    const report = await reportByReference(world, CASE);
    const events = await world.ctx.db
      .select()
      .from(schema.caseEvents)
      .where(eq(schema.caseEvents.reportId, report.id))
      .orderBy(asc(schema.caseEvents.sequence));
    const finance = events.filter((e) =>
      (FINANCE_CASE_EVENT_TYPES as readonly string[]).includes(e.type),
    );
    expect(finance.map((e) => e.type)).toEqual([
      "work_order_approved",
      "work_order_acknowledged",
      "goods_receipt_recorded",
      "invoice_submitted",
      "match_recorded",
      "goods_receipt_recorded",
      "match_recorded",
      "invoice_submitted",
      "match_recorded",
      "release_authorised",
    ]);
    for (const event of finance) {
      expect(FINANCE_NOTE_CONSTANTS).toContain(event.note);
      expect(event.statusTo).toBeNull();
      if (event.type === "match_recorded") expect(event.actorId).toBeNull();
    }
    expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i));
  });

  it("stores one commitment document per finance record", async () => {
    const report = await reportByReference(world, CASE);
    const documents = await world.ctx.db
      .select()
      .from(schema.commitmentDocuments)
      .where(eq(schema.commitmentDocuments.reportId, report.id));
    const count = (type: string) => documents.filter((d) => d.type === type).length;
    expect(count("work_order")).toBe(1);
    expect(count("supplier_invoice")).toBe(2);
    expect(count("goods_receipt")).toBe(2);
    expect(count("match_result")).toBe(3);
    expect(count("release_decision")).toBe(1);
    const release = documents.find((d) => d.type === "release_decision")!.document;
    expect(release).toMatchObject({ decision: "authorised" });
    expect(JSON.stringify(documents)).not.toMatch(/"paid"|\bpaid\b/i);
  });

  it("shows each reader what the visibility matrix allows", async () => {
    const full = await loadMoneyTrail(world.ctx, CASE, people.buyer);
    expect(full.pricesVisible).toBe(true);
    expect(full.steps.find((s) => s.type === "work_order_approved")?.actorName).toBe(
      "Test Buyer",
    );
    expect(
      full.steps.filter((s) => s.type === "match_recorded").map((s) => s.outcome),
    ).toEqual(["blocked", "blocked", "matched"]);
    expect(full.steps.find((s) => s.type === "match_recorded")).toMatchObject({
      actor: "system",
      actorName: null,
    });

    const own = await loadMoneyTrail(world.ctx, CASE, people.supplier);
    expect(own.pricesVisible).toBe(true);
    expect(own.order.totalCents).toBe(TOTAL);
    expect(own.steps.map((s) => s.actorName).filter(Boolean)).toEqual([
      "Test Supplier",
      "Test Supplier",
      "Test Supplier",
    ]);
    expect(
      (await refusal(() => loadMoneyTrail(world.ctx, CASE, people.rival))).code,
    ).toBe("forbidden");

    for (const reader of [people.receiver, people.admin, people.reviewer]) {
      const redacted = await loadMoneyTrail(world.ctx, CASE, reader);
      expect(redacted.pricesVisible).toBe(false);
      const text = JSON.stringify(redacted);
      expect(text).not.toMatch(/unitPriceCents|totalCents/);
      for (const amount of [42_000, 45_000, 180_000, TOTAL, 450_000]) {
        expect(text).not.toContain(String(amount));
      }
      expect(redacted.order.supplierName).toBe("Test Ceilings");
      expect(
        redacted.steps.find((s) => s.type === "work_order_approved")?.actorName,
      ).toBe("Test Buyer");
    }

    const reporter = { id: uid(99), role: "reporter" as const, institutionId: null };
    expect((await refusal(() => loadMoneyTrail(world.ctx, CASE, reporter))).code).toBe(
      "forbidden",
    );
    expect((await refusal(() => loadMoneyTrail(world.ctx, CASE, null))).code).toBe(
      "unauthenticated",
    );
    expect(
      (await refusal(() => loadMoneyTrail(world.ctx, "BB-2026-000047", people.buyer)))
        .code,
    ).toBe("not_found");
  });

  it("serves the AI glue loaders with the same rules", async () => {
    const full = await loadMoneyTrail(world.ctx, CASE, people.buyer);
    const blocked = full.invoices[0].match!;
    const seen = await loadMatchForViewer(world.ctx, CASE, blocked.id, people.buyer);
    expect(seen).toMatchObject({ outcome: "blocked", pricesVisible: true });
    expect(seen.reasons).toEqual(blocked.reasons);
    const redacted = await loadMatchForViewer(
      world.ctx,
      CASE,
      blocked.id,
      people.receiver,
    );
    expect(redacted.pricesVisible).toBe(false);
    expect(redacted.reasons).toEqual([
      { code: "unit_price_mismatch", sku: "BOARD-01", expected: null, actual: null },
      { code: "total_mismatch", sku: null, expected: null, actual: null },
    ]);
    expect(
      (await refusal(() => loadMatchForViewer(world.ctx, CASE, blocked.id, people.rival)))
        .code,
    ).toBe("forbidden");
    expect(
      (await refusal(() => loadMatchForViewer(world.ctx, CASE, blocked.id, null))).code,
    ).toBe("unauthenticated");
    expect(
      (await refusal(() => loadMatchForViewer(world.ctx, CASE, uid(98), people.buyer)))
        .code,
    ).toBe("not_found");
    expect(
      (
        await refusal(() =>
          loadMatchForViewer(world.ctx, "BB-2026-000047", blocked.id, people.buyer),
        )
      ).code,
    ).toBe("not_found");

    expect(await loadGateForViewer(world.ctx, CASE, people.approver)).toEqual({
      gate: { open: false, blockers: [{ code: "already_released" }] },
      stage: "release_authorised",
    });
    expect(await loadGateForViewer(world.ctx, CASE, null)).toBeNull();
    expect(
      await loadGateForViewer(world.ctx, CASE, {
        id: uid(99),
        role: "reporter",
        institutionId: null,
      }),
    ).toBeNull();
    expect(await loadGateForViewer(world.ctx, CASE, people.rival)).toBeNull();
    expect(await loadGateForViewer(world.ctx, "BB-2026-000047", people.buyer)).toBeNull();
    expect(
      (await refusal(() => loadGateForViewer(world.ctx, "BB-2026-999999", null))).code,
    ).toBe("not_found");
  });
});
