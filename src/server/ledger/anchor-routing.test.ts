import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { BlockchainReceipt, Hex32, LedgerInfo, LedgerPort } from "@/shared";
import type { LedgerOperation } from "../../../database/schema";
import { schema } from "../db";
import {
  anchor,
  callLedger,
  processLedgerJobs,
  withInstitution,
  type AnchorSpec,
} from "../reports/anchor";
import { createTestWorld, reportByReference, type TestWorld } from "../test/harness";

/*
 * How `anchor.ts` hands a write to the ledger: every call names the report's
 * institution (the Bona Chain adapter routes by it), and a finance step waits
 * in the queue while the ledger takes no finance writes.
 */

const hash = (n: number): Hex32 => `0x${n.toString(16).padStart(64, "0")}`;
const OTHER_INSTITUTION = "00000000-0000-4000-8000-0000000000aa";
const ORDER = "00000000-0000-4000-8000-0000000000a1";

/** A ledger that only records what it was asked, with a chosen finance mode. */
function recordingLedger(finance: LedgerInfo["finance"]) {
  const calls: { method: string; input: Record<string, unknown> }[] = [];
  let n = 0;
  const receiptFor = (event: BlockchainReceipt["event"]): BlockchainReceipt => ({
    chainId: "bona:memory",
    contractAddress: "0x0000000000000000000000000000000000000000",
    txId: hash(0xabc000 + ++n),
    status: "confirmed",
    blockNumber: n,
    blockTimestamp: "2026-11-20T10:00:00.000Z",
    event,
  });
  const write =
    (method: string, event: BlockchainReceipt["event"]) =>
    async (input: Record<string, unknown>) => {
      calls.push({ method, input });
      return receiptFor(event);
    };
  const ledger = {
    info: () => ({
      chainId: "bona:memory",
      contractAddress: "0x0000000000000000000000000000000000000000",
      networkName: "recording ledger",
      explorerTxUrl: () => null,
      live: false,
      finance,
    }),
    registerReport: write("registerReport", "ReportRegistered"),
    registerEvidence: write("registerEvidence", "EvidenceRegistered"),
    acknowledgeReport: write("acknowledgeReport", "ReportAcknowledged"),
    recordInterimProtection: write(
      "recordInterimProtection",
      "InterimProtectionRecorded",
    ),
    claimRepair: write("claimRepair", "RepairClaimed"),
    verifyRepair: write("verifyRepair", "RepairVerified"),
    disputeRepair: write("disputeRepair", "RepairDisputed"),
    probeVerify: async () => ({ allowed: true, revert: null }),
    statusOf: async () => "none",
    getReceipt: async () => receiptFor("ReportRegistered"),
    approveWorkOrder: write("approveWorkOrder", "WorkOrderApproved"),
    acknowledgeWorkOrder: write("acknowledgeWorkOrder", "WorkOrderAcknowledged"),
    submitInvoice: write("submitInvoice", "InvoiceSubmitted"),
    recordGoodsReceipt: write("recordGoodsReceipt", "GoodsReceiptRecorded"),
    recordMatchResult: write("recordMatchResult", "MatchRecorded"),
    openPaymentDispute: write("openPaymentDispute", "PaymentDisputeOpened"),
    closePaymentDispute: write("closePaymentDispute", "PaymentDisputeClosed"),
    authoriseRelease: write("authoriseRelease", "ReleaseAuthorised"),
    probeRelease: async () => ({ allowed: true, revert: null }),
  } as unknown as LedgerPort;
  return { ledger, calls };
}

describe("anchoring: routing by institution and holding finance", () => {
  let world: TestWorld;
  let reportId: string;
  let institutionId: string;
  let eventId: string;

  beforeAll(async () => {
    world = await createTestWorld();
    const report = await reportByReference(world, "BB-2026-000042");
    reportId = report.id;
    institutionId = report.institutionId;
    const [event] = await world.ctx.db
      .select()
      .from(schema.caseEvents)
      .where(eq(schema.caseEvents.reportId, reportId))
      .limit(1);
    eventId = event.id;
  }, 120_000);

  afterAll(async () => {
    await world?.close();
  });

  const spec = (
    operation: LedgerOperation,
    payload: Record<string, string>,
  ): AnchorSpec => ({
    reportId,
    operation,
    payload,
    targetKind: "event",
    targetId: eventId,
    eventId,
  });

  const REPORT_SCOPED: [LedgerOperation, Record<string, string>][] = [
    ["registerEvidence", { digest: hash(1), kind: "repair" }],
    ["acknowledgeReport", {}],
    ["recordInterimProtection", { commitment: hash(2) }],
    ["claimRepair", { commitment: hash(3) }],
    ["verifyRepair", { reviewCommitment: hash(4) }],
    ["disputeRepair", { reviewCommitment: hash(5) }],
  ];

  it.each(REPORT_SCOPED)(
    "%s is sent with the institution of its report",
    async (operation, extra) => {
      const { ledger, calls } = recordingLedger("simulated");
      // The payload names the report only, as the report flow writes it.
      const routed = await withInstitution(
        world.ctx.db,
        spec(operation, { reportId, ...extra }),
      );
      await callLedger(ledger, routed);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: operation,
        input: { reportId, institutionId },
      });
    },
  );

  it("keeps an institution the caller named, and fills a finance payload that lacks one", async () => {
    const { ledger, calls } = recordingLedger("simulated");
    const named = spec("acknowledgeReport", {
      reportId,
      institutionId: OTHER_INSTITUTION,
    });
    expect(await withInstitution(world.ctx.db, named)).toBe(named);

    await callLedger(
      ledger,
      await withInstitution(
        world.ctx.db,
        spec("authorise_release", { workOrderId: ORDER, commitment: hash(6) }),
      ),
    );
    expect(calls[0]).toMatchObject({
      method: "authoriseRelease",
      input: { institutionId, workOrderId: ORDER, commitment: hash(6) },
    });
  });

  it("leaves the institution out for a report it cannot find", async () => {
    const { ledger, calls } = recordingLedger("simulated");
    const stray = {
      ...spec("acknowledgeReport", { reportId: OTHER_INSTITUTION }),
      reportId: OTHER_INSTITUTION,
    };
    await callLedger(ledger, await withInstitution(world.ctx.db, stray));
    expect(calls[0]!.input.institutionId).toBeUndefined();
  });

  it("fills the institution on a write anchored at once", async () => {
    const { ledger, calls } = recordingLedger("simulated");
    await anchor(
      world.ctx.db,
      ledger,
      [spec("recordInterimProtection", { reportId, commitment: hash(7) })],
      "sync",
    );
    expect(calls).toEqual([
      {
        method: "recordInterimProtection",
        input: { reportId, institutionId, commitment: hash(7) },
      },
    ]);
  });

  it("holds a finance step while finance is off, without holding back the report's own writes", async () => {
    const off = recordingLedger("off");
    const db = world.ctx.db;
    const financeSpec = spec("approve_work_order", {
      institutionId,
      workOrderId: ORDER,
      reportId,
      commitment: hash(8),
    });
    await anchor(
      db,
      off.ledger,
      [financeSpec, spec("recordInterimProtection", { reportId, commitment: hash(9) })],
      "sync",
    );
    // The finance step was not sent; the report write after it was.
    expect(off.calls.map((call) => call.method)).toEqual(["recordInterimProtection"]);

    const queued = () =>
      db
        .select()
        .from(schema.ledgerJobs)
        .where(
          and(
            eq(schema.ledgerJobs.reportId, reportId),
            eq(schema.ledgerJobs.operation, "approve_work_order"),
          ),
        );
    expect(await queued()).toMatchObject([{ status: "pending", attempts: 0 }]);

    // A retry run on the same ledger leaves it waiting and reports nothing to do.
    const held = await processLedgerJobs(db, off.ledger);
    expect(held).toMatchObject({ attempted: 0, anchored: 0, failed: 0, remaining: 0 });
    expect(off.calls.map((call) => call.method)).toEqual(["recordInterimProtection"]);
    expect(await queued()).toMatchObject([{ status: "pending", attempts: 0 }]);

    // Once the ledger takes finance writes, the step is anchored in its turn.
    const on = recordingLedger("live");
    const sent = await processLedgerJobs(db, on.ledger);
    expect(sent).toMatchObject({ attempted: 1, anchored: 1, failed: 0, rejected: 0 });
    expect(on.calls).toEqual([
      {
        method: "approveWorkOrder",
        input: { institutionId, workOrderId: ORDER, reportId, commitment: hash(8) },
      },
    ]);
    expect(await queued()).toMatchObject([{ status: "done" }]);
  });
});
