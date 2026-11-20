/**
 * Goods receipts: the receiving officer records what actually arrived. A
 * receipt carries quantities only, never a price. Recording one reruns the
 * three-way match over the latest invoice in the same transaction.
 */
import {
  computeCommitment,
  newSalt,
  type GoodsReceiptDocument,
  type RecordGoodsReceiptInput,
} from "@/shared";
import { schema } from "../db";
import { HttpError } from "../http";
import type { AnchorSpec } from "../reports/anchor";
import { appendEvent, newId, nowIso, requireReport, touch } from "../reports/common";
import { runMatch } from "./match";
import { FINANCE_EVENT_NOTE } from "./notes";
import {
  anchorFinance,
  cleanLines,
  financeSpec,
  lockReport,
  requireCan,
  requireOrderAccess,
  requireOrderState,
  requireSeparation,
  type ProcurementDeps,
  type ProcurementInput,
} from "./state";

/** `POST /api/issues/:id/goods-receipt`. */
export async function recordGoodsReceipt(
  deps: ProcurementDeps,
  input: ProcurementInput & { receipt: RecordGoodsReceiptInput },
): Promise<string> {
  const { actor } = input;
  requireCan(actor, "receipt:record");
  const at = input.at ?? nowIso();
  const lines = cleanLines(input.receipt.lines, "delivery record");
  const evidenceDigests = [...new Set(input.receipt.evidenceDigests ?? [])];

  return deps.db.transaction(async (tx) => {
    const report = await requireReport(tx, input.reportIdOrReference);
    await lockReport(tx, report.id);
    const state = await requireOrderState(tx, report);
    requireOrderAccess(actor, state.order);
    requireSeparation(state, actor, "receive");
    if (state.release) {
      throw new HttpError(
        "conflict",
        "The release for this work order was already authorised.",
      );
    }
    if (state.order.acknowledgedVersion !== state.order.currentVersion) {
      throw new HttpError(
        "invalid_transition",
        "The supplier has not acknowledged the current work order yet, so nothing can have been delivered against it.",
      );
    }
    const ordered = new Set(state.current.lines.map((line) => line.sku));
    const stray = lines.find((line) => !ordered.has(line.sku));
    if (stray) {
      throw new HttpError(
        "invalid_input",
        `Line ${stray.sku} is not on the work order. Record only what was ordered.`,
      );
    }

    const id = newId();
    const document: GoodsReceiptDocument = {
      type: "goods_receipt",
      receiptId: id,
      workOrderId: state.order.id,
      reportId: report.id,
      orderVersion: state.order.currentVersion,
      lines,
      evidenceDigests,
      createdAt: at,
      salt: newSalt(),
    };
    const commitment = await computeCommitment(document);
    const row = {
      id,
      orderId: state.order.id,
      reportId: report.id,
      orderVersion: state.order.currentVersion,
      lines,
      evidenceDigests,
      receivedBy: actor.id,
      commitment,
      createdAt: at,
    };
    await tx.insert(schema.goodsReceipts).values(row);
    await tx.insert(schema.commitmentDocuments).values({
      recordId: id,
      reportId: report.id,
      type: "goods_receipt",
      commitment,
      document,
      createdAt: at,
    });
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: "goods_receipt_recorded",
      actor,
      actorRole: actor.role,
      occurredAt: at,
      subjectId: id,
      anchoredValue: commitment,
      note: FINANCE_EVENT_NOTE.goods_receipt_recorded,
    });
    const specs: AnchorSpec[] = [
      financeSpec(state, "record_goods_receipt", event.id, { commitment }),
    ];
    // A new delivery changes what the latest invoice is compared with.
    const match = await runMatch(
      tx,
      { ...state, receipts: [...state.receipts, row] },
      actor,
      at,
    );
    if (match) specs.push(match.spec);
    await anchorFinance(tx, deps.ledger, specs, input.anchorMode, at);
    await touch(tx, report.id, at);
    return report.id;
  });
}
