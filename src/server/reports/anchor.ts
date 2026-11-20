/**
 * Anchoring: the bridge between a committed database write and the ledger.
 *
 * Every state change first writes its records and case event, then calls the
 * matching `LedgerPort` method through `anchor()` inside the same transaction:
 *
 * - success → the receipt is stored on the record and the case event;
 * - RPC down / ledger not configured / dependency not yet anchored → the
 *   write is kept and a `ledger_jobs` row is created for `processLedgerJobs`
 *   (`POST /api/ledger/retry`, also a Vercel cron);
 * - contract refusal (`SchoolAdminCannotVerify`, `InvalidState`, …) → the
 *   `HttpError` thrown here rolls the transaction back and becomes the API error.
 *
 * Payloads carry only UUIDs, 0x digests and enum names — never personal data.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  LedgerError,
  type BlockchainReceipt,
  type CaseEventType,
  type EvidenceKind,
  type FinanceRef,
  type IsoDateTime,
  type LedgerPort,
} from "@/shared";
import type { LedgerOperation, LedgerTargetKind } from "../../../database/schema";
import { schema, type Db } from "../db";
import { httpErrorFromLedger } from "../http";
import { newId, nowIso } from "./common";

export interface AnchorSpec {
  reportId: string;
  operation: LedgerOperation;
  payload: Record<string, string>;
  targetKind: LedgerTargetKind;
  targetId: string;
  eventId: string;
}

/** `sync` calls the ledger now; `defer` only queues jobs (seeding). */
export type AnchorMode = "sync" | "defer";

const RETRYABLE = new Set<LedgerError["code"]>([
  "rpc_unavailable",
  "not_configured",
  "not_found",
]);

export function callLedger(
  ledger: LedgerPort,
  spec: AnchorSpec,
): Promise<BlockchainReceipt> {
  const p = spec.payload;
  switch (spec.operation) {
    case "registerReport":
      return ledger.registerReport({
        reportId: p.reportId,
        institutionId: p.institutionId,
        commitment: p.commitment,
      });
    case "registerEvidence":
      return ledger.registerEvidence({
        reportId: p.reportId,
        digest: p.digest,
        kind: p.kind as EvidenceKind,
      });
    case "acknowledgeReport":
      return ledger.acknowledgeReport({ reportId: p.reportId });
    case "recordInterimProtection":
      return ledger.recordInterimProtection({
        reportId: p.reportId,
        commitment: p.commitment,
      });
    case "claimRepair":
      return ledger.claimRepair({ reportId: p.reportId, commitment: p.commitment });
    case "verifyRepair":
      return ledger.verifyRepair({
        reportId: p.reportId,
        reviewCommitment: p.reviewCommitment,
      });
    case "disputeRepair":
      return ledger.disputeRepair({
        reportId: p.reportId,
        reviewCommitment: p.reviewCommitment,
      });
    case "approve_work_order":
      return ledger.approveWorkOrder({
        ...financeRef(p),
        reportId: p.reportId,
        commitment: p.commitment,
      });
    case "acknowledge_work_order":
      return ledger.acknowledgeWorkOrder(financeRef(p));
    case "submit_invoice":
      return ledger.submitInvoice({ ...financeRef(p), commitment: p.commitment });
    case "record_goods_receipt":
      return ledger.recordGoodsReceipt({ ...financeRef(p), commitment: p.commitment });
    case "record_match_result":
      return ledger.recordMatchResult({
        ...financeRef(p),
        invoiceCommitment: p.invoiceCommitment,
        // Payloads are strings: the outcome travels as "true" or "false".
        passed: p.passed === "true",
        commitment: p.commitment,
      });
    case "open_payment_dispute":
      return ledger.openPaymentDispute({
        ...financeRef(p),
        commitment: p.commitment,
        as: disputeSigner(p.as),
      });
    case "close_payment_dispute":
      return ledger.closePaymentDispute({
        ...financeRef(p),
        commitment: p.commitment,
        as: disputeSigner(p.as),
      });
    case "authorise_release":
      return ledger.authoriseRelease({ ...financeRef(p), commitment: p.commitment });
  }
}

const financeRef = (p: Record<string, string>): FinanceRef => ({
  institutionId: p.institutionId,
  workOrderId: p.workOrderId,
});

/** A payment dispute is opened and closed by the buyer or the receiver, nobody else. */
function disputeSigner(value: string): "buyer" | "receiver" {
  if (value === "buyer" || value === "receiver") return value;
  throw new Error(`A payment dispute cannot be signed as "${value}".`);
}

const TARGET_TABLE = {
  report: schema.reports,
  evidence: schema.evidenceCommitments,
  protection: schema.interimProtections,
  claim: schema.repairClaims,
  review: schema.independentReviews,
} as const;

export async function storeReceipt(
  db: Db,
  target: { targetKind: LedgerTargetKind; targetId: string; eventId: string },
  receipt: BlockchainReceipt,
): Promise<void> {
  await db
    .update(schema.caseEvents)
    .set({ receipt })
    .where(eq(schema.caseEvents.id, target.eventId));
  if (target.targetKind === "event") return;
  const table = TARGET_TABLE[target.targetKind];
  await db.update(table).set({ receipt }).where(eq(table.id, target.targetId));
}

async function queueJob(
  db: Db,
  spec: AnchorSpec,
  status: "pending" | "failed",
  error: string | null,
  at: IsoDateTime,
): Promise<void> {
  await db.insert(schema.ledgerJobs).values({
    id: newId(),
    reportId: spec.reportId,
    operation: spec.operation,
    payload: spec.payload,
    targetKind: spec.targetKind,
    targetId: spec.targetId,
    eventId: spec.eventId,
    status,
    attempts: status === "failed" ? 1 : 0,
    lastError: error,
    createdAt: at,
    updatedAt: at,
  });
}

/**
 * Anchor the specs in order. Must run inside the transaction that wrote the
 * records, so a contract refusal rolls everything back.
 */
export async function anchor(
  tx: Db,
  ledger: LedgerPort,
  specs: AnchorSpec[],
  mode: AnchorMode,
  at: IsoDateTime = nowIso(),
): Promise<void> {
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (mode === "defer") {
      await queueJob(tx, spec, "pending", null, at);
      continue;
    }
    try {
      const receipt = await callLedger(ledger, spec);
      await storeReceipt(tx, spec, receipt);
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      if (!RETRYABLE.has(error.code)) throw httpErrorFromLedger(error);
      // Keep the write; this and every later write of the same change wait for the retry.
      console.warn(`[ledger] ${spec.operation} deferred: ${error.message}`);
      await queueJob(tx, spec, "failed", error.message, at);
      for (const rest of specs.slice(i + 1))
        await queueJob(tx, rest, "pending", null, at);
      return;
    }
  }
}

export interface RetrySummary {
  attempted: number;
  anchored: number;
  failed: number;
  rejected: number;
  refreshed: number;
  /** Queued writes not attempted in this run because the time budget ran out. Call again. */
  remaining: number;
}

export interface ProcessOptions {
  /**
   * Stop starting new writes after this long and report the rest as
   * `remaining`. A real chain needs seconds per write, and a serverless
   * function must answer before its time limit.
   */
  budgetMs?: number;
}

/** One run per process at a time: two loops over the same queue would send a write twice. */
let running: Promise<RetrySummary> | null = null;

/**
 * Replay queued ledger writes in creation order, then refresh pending
 * receipts. A call made while another run is in progress in this process
 * waits for that run and returns its summary instead of starting a second.
 */
export function processLedgerJobs(
  db: Db,
  ledger: LedgerPort,
  options: ProcessOptions = {},
): Promise<RetrySummary> {
  if (running) return running;
  const run = replayLedgerJobs(db, ledger, options).finally(() => {
    if (running === run) running = null;
  });
  running = run;
  return run;
}

async function replayLedgerJobs(
  db: Db,
  ledger: LedgerPort,
  { budgetMs = Number.POSITIVE_INFINITY }: ProcessOptions,
): Promise<RetrySummary> {
  const started = Date.now();
  const summary: RetrySummary = {
    attempted: 0,
    anchored: 0,
    failed: 0,
    rejected: 0,
    refreshed: 0,
    remaining: 0,
  };
  const jobs = await db
    .select()
    .from(schema.ledgerJobs)
    .where(inArray(schema.ledgerJobs.status, ["pending", "failed"]))
    .orderBy(asc(schema.ledgerJobs.position));
  const blocked = new Set<string>();
  for (const [index, job] of jobs.entries()) {
    // Keep each report's writes in order: once one is stuck, skip the rest of that report.
    if (blocked.has(job.reportId)) continue;
    if (Date.now() - started > budgetMs) {
      summary.remaining = jobs
        .slice(index)
        .filter((j) => !blocked.has(j.reportId)).length;
      break;
    }
    summary.attempted += 1;
    const at = nowIso();
    try {
      const receipt = await callLedger(ledger, job);
      await storeReceipt(db, job, receipt);
      await db
        .update(schema.ledgerJobs)
        .set({
          status: "done",
          attempts: job.attempts + 1,
          lastError: null,
          updatedAt: at,
        })
        .where(eq(schema.ledgerJobs.id, job.id));
      summary.anchored += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof LedgerError && RETRYABLE.has(error.code);
      await db
        .update(schema.ledgerJobs)
        .set({
          status: retryable ? "failed" : "rejected",
          attempts: job.attempts + 1,
          lastError: message,
          updatedAt: at,
        })
        .where(eq(schema.ledgerJobs.id, job.id));
      if (retryable) summary.failed += 1;
      else summary.rejected += 1;
      blocked.add(job.reportId);
      if (error instanceof LedgerError && error.code !== "not_found") {
        // The ledger itself is unreachable: nothing else will succeed right now.
        break;
      }
    }
  }
  summary.refreshed = await refreshPendingReceipts(db, ledger);
  return summary;
}

const TARGET_FOR_EVENT: Partial<Record<CaseEventType, LedgerTargetKind>> = {
  report_registered: "report",
  evidence_registered: "evidence",
  interim_protection_recorded: "protection",
  repair_claimed: "claim",
  repair_verified: "review",
  repair_disputed: "review",
  report_acknowledged: "event",
};

/** Ask the ledger again about every receipt still `pending`. Returns how many changed. */
export async function refreshPendingReceipts(
  db: Db,
  ledger: LedgerPort,
): Promise<number> {
  const pending = await db
    .select()
    .from(schema.caseEvents)
    .where(sql`${schema.caseEvents.receipt}->>'status' = 'pending'`);
  let changed = 0;
  for (const event of pending) {
    const receipt = event.receipt;
    if (!receipt) continue;
    try {
      const fresh = await ledger.getReceipt(receipt.txId, receipt.event);
      if (fresh.status === receipt.status) continue;
      const targetKind = TARGET_FOR_EVENT[event.type] ?? "event";
      const targetId =
        targetKind === "report" ? event.reportId : (event.subjectId ?? event.id);
      await storeReceipt(db, { targetKind, targetId, eventId: event.id }, fresh);
      changed += 1;
    } catch (error) {
      console.warn(`[ledger] could not refresh ${receipt.txId}: ${String(error)}`);
      break;
    }
  }
  return changed;
}
