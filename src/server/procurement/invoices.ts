/**
 * Supplier invoices. Submitting one stores it with its commitment document
 * and, in the same transaction, runs the three-way match over it. An invoice
 * is never approved by a person here: the rule engine blocks or matches it.
 */
import { eq } from "drizzle-orm";
import {
  CURRENCY,
  computeCommitment,
  newSalt,
  sha256Hex,
  type SubmitInvoiceInput,
  type SupplierInvoiceDocument,
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
  requireStorable,
  totalOf,
  type ProcurementDeps,
  type ProcurementInput,
} from "./state";

/** `POST /api/issues/:id/invoices`: store the invoice, then let the rule engine check it. */
export async function submitInvoice(
  deps: ProcurementDeps,
  input: ProcurementInput & { invoice: SubmitInvoiceInput },
): Promise<string> {
  const { actor } = input;
  requireCan(actor, "invoice:submit");
  const at = input.at ?? nowIso();
  const lines = cleanLines(input.invoice.lines, "invoice");
  // The lines must add up to something storable; whether the stated total
  // agrees with them is the rule engine's question, not a validation error.
  totalOf(lines);
  requireStorable(input.invoice.totalCents);
  const invoiceNumber = input.invoice.invoiceNumber.trim();
  const sourceText = input.invoice.sourceText?.trim();
  const sourceTextDigest = sourceText
    ? await sha256Hex(new TextEncoder().encode(sourceText))
    : null;

  return deps.db.transaction(async (tx) => {
    const report = await requireReport(tx, input.reportIdOrReference);
    await lockReport(tx, report.id);
    const state = await requireOrderState(tx, report);
    requireOrderAccess(actor, state.order);
    requireSeparation(state, actor, "supply");
    if (state.release) {
      throw new HttpError(
        "conflict",
        "The release for this work order was already authorised.",
      );
    }
    if (state.order.acknowledgedVersion === null) {
      throw new HttpError(
        "invalid_transition",
        "Acknowledge the work order before you invoice against it.",
      );
    }
    // The reference comes from the account, never from the request.
    const [account] = await tx
      .select({ supplierRef: schema.users.supplierRef })
      .from(schema.users)
      .where(eq(schema.users.id, actor.id))
      .limit(1);
    if (!account?.supplierRef) {
      throw new HttpError(
        "forbidden",
        "This account has no supplier registration reference.",
      );
    }

    const id = newId();
    const document: SupplierInvoiceDocument = {
      type: "supplier_invoice",
      invoiceId: id,
      workOrderId: state.order.id,
      reportId: report.id,
      invoiceNumber,
      orderVersion: input.invoice.orderVersion,
      lines,
      totalCents: input.invoice.totalCents,
      currency: CURRENCY,
      createdAt: at,
      salt: newSalt(),
    };
    const commitment = await computeCommitment(document);
    const row = {
      id,
      orderId: state.order.id,
      reportId: report.id,
      orderVersion: input.invoice.orderVersion,
      invoiceNumber,
      supplierRef: account.supplierRef,
      lines,
      statedTotalCents: input.invoice.totalCents,
      submittedBy: actor.id,
      aiDrafted: input.invoice.aiDrafted,
      sourceTextDigest,
      commitment,
      createdAt: at,
    };
    await tx.insert(schema.invoices).values(row);
    await tx.insert(schema.commitmentDocuments).values({
      recordId: id,
      reportId: report.id,
      type: "supplier_invoice",
      commitment,
      document,
      createdAt: at,
    });
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: "invoice_submitted",
      actor,
      actorRole: actor.role,
      occurredAt: at,
      subjectId: id,
      anchoredValue: commitment,
      note: FINANCE_EVENT_NOTE.invoice_submitted,
    });
    const specs: AnchorSpec[] = [
      financeSpec(state, "submit_invoice", event.id, { commitment }),
    ];
    const match = await runMatch(
      tx,
      { ...state, invoices: [...state.invoices, row] },
      actor,
      at,
    );
    if (match) specs.push(match.spec);
    await anchorFinance(tx, deps.ledger, specs, input.anchorMode, at);
    await touch(tx, report.id, at);
    return report.id;
  });
}
