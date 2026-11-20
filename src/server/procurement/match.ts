/**
 * Running the three-way match. The decision is `matchThreeWay` from
 * `@/shared`: pure code, no person and no AI. This file gathers its input
 * from the database, stores the result with its commitment document and
 * appends the `match_recorded` case event.
 */
import {
  MATCH_ENGINE_VERSION,
  canonicalJson,
  computeCommitment,
  matchThreeWay,
  newSalt,
  sha256Hex,
  type IsoDateTime,
  type MatchInput,
  type MatchResultDocument,
} from "@/shared";
import type { MatchResultRow } from "../../../database/schema";
import { schema, type Db } from "../db";
import type { AnchorSpec } from "../reports/anchor";
import { appendEvent, newId, type Actor } from "../reports/common";
import { MATCH_EVENT_NOTE } from "./notes";
import { financeSpec, type OrderState } from "./state";

/** Exactly what the engine is given for the latest invoice of this order. */
export function matchInputFor(state: OrderState): MatchInput | null {
  const invoice = state.invoices.at(-1);
  if (!invoice) return null;
  return {
    order: {
      version: state.order.currentVersion,
      acknowledgedVersion: state.order.acknowledgedVersion,
      supplierRef: state.order.supplierRef,
      lines: state.current.lines,
      totalCents: state.current.totalCents,
    },
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      orderVersion: invoice.orderVersion,
      supplierRef: invoice.supplierRef,
      lines: invoice.lines,
      totalCents: invoice.statedTotalCents,
    },
    priorInvoiceNumbers: state.invoices.slice(0, -1).map((i) => i.invoiceNumber),
    receipts: state.receipts.map((r) => ({
      orderVersion: r.orderVersion,
      lines: r.lines,
    })),
  };
}

/**
 * Run the rule engine over the latest invoice and record the result. Call it
 * inside the transaction that wrote the invoice or the goods receipt, with
 * the state loaded after that write. Returns null when there is no invoice
 * to check.
 *
 * `trigger` is the person whose submission caused the run. The event is not
 * attributed to them: it has no actor, and every view shows it as the rule
 * engine. Their role is stored only because the column needs one.
 */
export async function runMatch(
  tx: Db,
  state: OrderState,
  trigger: Actor,
  at: IsoDateTime,
): Promise<{ row: MatchResultRow; spec: AnchorSpec } | null> {
  const input = matchInputFor(state);
  const invoice = state.invoices.at(-1);
  if (!input || !invoice) return null;

  const verdict = matchThreeWay(input);
  const counted = state.receipts.filter(
    (r) => r.orderVersion === state.order.currentVersion,
  );
  const id = newId();
  const document: MatchResultDocument = {
    type: "match_result",
    matchId: id,
    workOrderId: state.order.id,
    reportId: state.order.reportId,
    workOrderCommitment: state.current.commitment,
    invoiceCommitment: invoice.commitment,
    receiptCommitments: counted.map((r) => r.commitment),
    outcome: verdict.outcome === "matched" ? "pass" : "fail",
    reasons: verdict.reasons,
    engineVersion: MATCH_ENGINE_VERSION,
    createdAt: at,
    salt: newSalt(),
  };
  const commitment = await computeCommitment(document);
  const row: MatchResultRow = {
    id,
    orderId: state.order.id,
    reportId: state.order.reportId,
    invoiceId: invoice.id,
    receiptId: state.receipts.at(-1)?.id ?? null,
    orderVersion: state.order.currentVersion,
    outcome: verdict.outcome,
    reasons: verdict.reasons,
    inputsDigest: await sha256Hex(new TextEncoder().encode(canonicalJson(input))),
    engineVersion: MATCH_ENGINE_VERSION,
    commitment,
    createdAt: at,
  };
  await tx.insert(schema.matchResults).values(row);
  await tx.insert(schema.commitmentDocuments).values({
    recordId: id,
    reportId: state.order.reportId,
    type: "match_result",
    commitment,
    document,
    createdAt: at,
  });
  const event = await appendEvent(tx, {
    reportId: state.order.reportId,
    type: "match_recorded",
    actor: null,
    actorRole: trigger.role,
    occurredAt: at,
    subjectId: id,
    anchoredValue: commitment,
    note: MATCH_EVENT_NOTE[verdict.outcome],
  });
  return {
    row,
    spec: financeSpec(state, "record_match_result", event.id, {
      invoiceCommitment: invoice.commitment,
      // Ledger payloads are strings: the outcome travels as "true" or "false".
      passed: verdict.outcome === "matched" ? "true" : "false",
      commitment,
    }),
  };
}
