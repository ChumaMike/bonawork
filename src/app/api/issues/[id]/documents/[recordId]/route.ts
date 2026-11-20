import { and, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { schema } from "@/server/db";
import { HttpError, ok, route } from "@/server/http";
import { isUuid, requireReport } from "@/server/reports/common";

/**
 * `GET /api/issues/:id/documents/:recordId` — what BonaBlock Verify needs.
 *
 * For a report / protection / claim / review record: the salted
 * `CommitmentDocument` behind its on-chain commitment, plus the receipt.
 * For an evidence record: `{ kind: "evidence", digest, receipt }`.
 */
export const GET = route<{ id: string; recordId: string }>(
  async (_request, { id, recordId: requested }) => {
    const ctx = await getContext();
    const report = await requireReport(ctx.db, id);
    if (!isUuid(requested))
      throw new HttpError("not_found", `Unknown record: ${requested}`);
    const recordId = await resolveRecordId(ctx.db, report.id, requested);

    const [document] = await ctx.db
      .select()
      .from(schema.commitmentDocuments)
      .where(
        and(
          eq(schema.commitmentDocuments.recordId, recordId),
          eq(schema.commitmentDocuments.reportId, report.id),
        ),
      )
      .limit(1);
    if (document) {
      const receipt = await receiptFor(ctx.db, document.type, recordId, report.receipt);
      return ok({
        kind: document.type,
        recordId,
        commitment: document.commitment,
        document: document.document,
        receipt,
      });
    }

    const [evidence] = await ctx.db
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

async function receiptFor(
  db: Awaited<ReturnType<typeof getContext>>["db"],
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
  db: Awaited<ReturnType<typeof getContext>>["db"],
  reportId: string,
  requested: string,
): Promise<string> {
  const [event] = await db
    .select({ type: schema.caseEvents.type, subjectId: schema.caseEvents.subjectId })
    .from(schema.caseEvents)
    .where(
      and(eq(schema.caseEvents.id, requested), eq(schema.caseEvents.reportId, reportId)),
    )
    .limit(1);
  if (!event) return requested;
  // Registration and acknowledgement anchor the report itself.
  if (event.type === "report_registered" || event.type === "report_acknowledged")
    return reportId;
  // Events that anchor nothing (progress, decline) keep their own id → 404.
  return event.subjectId ?? requested;
}
