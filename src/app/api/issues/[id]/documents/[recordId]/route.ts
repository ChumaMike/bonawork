import { and, eq } from "drizzle-orm";
import {
  FINANCE_DOCUMENT_TYPES,
  can,
  visibilityFor,
  type BlockchainReceipt,
  type CaseEventType,
  type FinanceDocumentType,
} from "@/shared";
import type { AuthenticatedSession } from "@/server/auth/session";
import { schema, type Db } from "@/server/db";
import { HttpError, ok, route } from "@/server/http";
import { isUuid, requireReport } from "@/server/reports/common";
import { begin } from "@/server/request";

/**
 * `GET /api/issues/:id/documents/:recordId` — what Bona Chain Verify needs.
 *
 * For a report / protection / claim / review record: the salted
 * `CommitmentDocument` behind its on-chain commitment, plus the receipt.
 * For an evidence record: `{ kind: "evidence", digest, receipt }`.
 *
 * Finance documents (work order, invoice, goods receipt, match result,
 * release decision) hold amounts, line detail and supplier references. Their
 * body is returned only to a signed-in reader who may see that content:
 *
 * - `procurement:read` is required, and a supplier only for its own order;
 * - a role that may not see prices gets the body of the documents that carry
 *   none (goods receipt, release decision) and no body for the others.
 *
 * Everyone else gets `{ kind, recordId, commitment, receipt }`: enough to
 * find the proof on the ledger, with nothing of what was committed to.
 */
export const GET = route<{ id: string; recordId: string }>(
  async (request, { id, recordId: requested }) => {
    const scope = await begin(request);
    const { db } = scope.ctx;
    const report = await requireReport(db, id);
    if (!isUuid(requested))
      throw new HttpError("not_found", `Unknown record: ${requested}`);
    const { recordId, event } = await resolveRecordId(db, report.id, requested);

    // The body is read separately, and only once the caller is known to be allowed it.
    const [found] = await db
      .select({
        type: schema.commitmentDocuments.type,
        commitment: schema.commitmentDocuments.commitment,
      })
      .from(schema.commitmentDocuments)
      .where(
        and(
          eq(schema.commitmentDocuments.recordId, recordId),
          eq(schema.commitmentDocuments.reportId, report.id),
        ),
      )
      .limit(1);
    if (found) {
      const finance = isFinanceDocument(found.type) ? found.type : null;
      const receipt = finance
        ? await financeReceipt(db, report.id, recordId, finance, event)
        : await receiptFor(db, found.type, recordId, report.receipt);
      const head = { kind: found.type, recordId, commitment: found.commitment };
      if (
        finance &&
        !(await mayReadFinanceDocument(db, scope.session, report, finance))
      ) {
        return ok({ ...head, receipt });
      }
      const [body] = await db
        .select({ document: schema.commitmentDocuments.document })
        .from(schema.commitmentDocuments)
        .where(eq(schema.commitmentDocuments.recordId, recordId))
        .limit(1);
      return ok({ ...head, document: body.document, receipt });
    }

    const [evidence] = await db
      .select()
      .from(schema.evidenceCommitments)
      .where(
        and(
          eq(schema.evidenceCommitments.id, recordId),
          eq(schema.evidenceCommitments.reportId, report.id),
        ),
      )
      .limit(1);
    if (!evidence) throw new HttpError("not_found", `Unknown record: ${recordId}`);
    return ok({
      kind: "evidence",
      recordId,
      digest: evidence.digest,
      algorithm: evidence.algorithm,
      receipt: evidence.receipt,
    });
  },
);

function isFinanceDocument(type: string): type is FinanceDocumentType {
  return (FINANCE_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/** The finance documents that state no price, total or price difference. */
const PRICELESS: readonly FinanceDocumentType[] = ["goods_receipt", "release_decision"];

/**
 * Whether this caller may read the body of a finance document of this case.
 * Signed-out visitors and reporters never reach the finance tables here.
 */
async function mayReadFinanceDocument(
  db: Db,
  session: AuthenticatedSession | null,
  report: { id: string; institutionId: string },
  type: FinanceDocumentType,
): Promise<boolean> {
  if (!session || !can(session.actor.role, "procurement:read")) return false;
  const { actor } = session;
  if (actor.institutionId && actor.institutionId !== report.institutionId) return false;
  const visibility = visibilityFor(actor.role);
  if (visibility === "none") return false;
  if (visibility === "no_prices") return PRICELESS.includes(type);
  if (visibility === "own_orders") {
    const [order] = await db
      .select({ supplierId: schema.workOrders.supplierId })
      .from(schema.workOrders)
      .where(eq(schema.workOrders.reportId, report.id))
      .limit(1);
    return order?.supplierId === actor.id;
  }
  return true;
}

/** The case event that anchored each finance document. The receipt sits on the event. */
const FINANCE_EVENT_FOR: Record<FinanceDocumentType, CaseEventType> = {
  work_order: "work_order_approved",
  supplier_invoice: "invoice_submitted",
  goods_receipt: "goods_receipt_recorded",
  match_result: "match_recorded",
  release_decision: "release_authorised",
};

async function financeReceipt(
  db: Db,
  reportId: string,
  recordId: string,
  type: FinanceDocumentType,
  requestedEvent: { receipt: BlockchainReceipt | null } | null,
): Promise<BlockchainReceipt | null> {
  // Asked for by event id (the timeline does this): that event's own proof.
  if (requestedEvent) return requestedEvent.receipt;
  const [event] = await db
    .select({ receipt: schema.caseEvents.receipt })
    .from(schema.caseEvents)
    .where(
      and(
        eq(schema.caseEvents.reportId, reportId),
        eq(schema.caseEvents.subjectId, recordId),
        eq(schema.caseEvents.type, FINANCE_EVENT_FOR[type]),
      ),
    )
    .limit(1);
  return event?.receipt ?? null;
}

async function receiptFor(
  db: Db,
  type: string,
  recordId: string,
  reportReceipt: unknown,
) {
  const table =
    type === "interim_protection"
      ? schema.interimProtections
      : type === "repair_claim"
        ? schema.repairClaims
        : type === "review"
          ? schema.independentReviews
          : null;
  if (!table) return reportReceipt;
  const [row] = await db
    .select({ receipt: table.receipt })
    .from(table)
    .where(eq(table.id, recordId))
    .limit(1);
  return row?.receipt ?? null;
}

/**
 * The timeline shows case events, so the UI may pass an event id. Map it to
 * the record the event anchored (its subject, or the report itself); any other
 * id is used as-is.
 */
async function resolveRecordId(
  db: Db,
  reportId: string,
  requested: string,
): Promise<{ recordId: string; event: { receipt: BlockchainReceipt | null } | null }> {
  const [event] = await db
    .select({
      type: schema.caseEvents.type,
      subjectId: schema.caseEvents.subjectId,
      receipt: schema.caseEvents.receipt,
    })
    .from(schema.caseEvents)
    .where(
      and(eq(schema.caseEvents.id, requested), eq(schema.caseEvents.reportId, reportId)),
    )
    .limit(1);
  if (!event) return { recordId: requested, event: null };
  // Registration and acknowledgement anchor the report itself.
  if (event.type === "report_registered" || event.type === "report_acknowledged")
    return { recordId: reportId, event };
  // Events that anchor nothing (progress, decline) keep their own id → 404.
  return { recordId: event.subjectId ?? requested, event };
}
