/**
 * Work orders: a buyer approves one for a report, the supplier it names
 * acknowledges it. Each step writes its record and case event in one
 * transaction, then anchors (see `../reports/anchor.ts`). Neither step
 * changes the report status.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  CURRENCY,
  computeCommitment,
  newSalt,
  type ApproveWorkOrderInput,
  type ReportStatus,
  type WorkOrderDocument,
} from "@/shared";
import type { UserRow } from "../../../database/schema";
import { schema, type Db } from "../db";
import { HttpError } from "../http";
import { appendEvent, newId, nowIso, requireReport, touch } from "../reports/common";
import { FINANCE_EVENT_NOTE } from "./notes";
import {
  anchorFinance,
  cleanLines,
  financeSpec,
  loadOrderState,
  lockReport,
  requireCan,
  requireInstitutionAccess,
  requireOrderAccess,
  requireOrderState,
  requireSeparation,
  totalOf,
  type ProcurementDeps,
  type ProcurementInput,
} from "./state";

/** A work order is for a problem the school has assessed and that is not yet closed. */
const ORDERABLE: ReportStatus[] = [
  "acknowledged",
  "in_progress",
  "repair_claimed",
  "disputed",
];

/** The supplier account a registration reference names, or a 422. */
async function requireSupplier(tx: Db, supplierRef: string): Promise<UserRow> {
  const ref = supplierRef.trim();
  const [supplier] = await tx
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "supplier"),
        sql`upper(${schema.users.supplierRef}) = ${ref.toUpperCase()}`,
      ),
    )
    .limit(1);
  if (!supplier || !supplier.supplierRef) {
    throw new HttpError(
      "invalid_input",
      `No registered supplier has the reference ${ref}.`,
    );
  }
  return supplier;
}

/**
 * `POST /api/issues/:id/work-order`: creates the order at version 1, or its
 * next version. A new version must be acknowledged again by the supplier.
 */
export async function approveWorkOrder(
  deps: ProcurementDeps,
  input: ProcurementInput & { order: ApproveWorkOrderInput },
): Promise<string> {
  const { actor } = input;
  requireCan(actor, "order:approve");
  const at = input.at ?? nowIso();
  const lines = cleanLines(input.order.lines, "work order");
  const totalCents = totalOf(lines);
  const scope = input.order.description.trim();

  return deps.db.transaction(async (tx) => {
    const report = await requireReport(tx, input.reportIdOrReference);
    await lockReport(tx, report.id);
    requireInstitutionAccess(actor, report.institutionId);
    if (!ORDERABLE.includes(report.status)) {
      throw new HttpError(
        "invalid_transition",
        `A work order can be approved once the school has assessed the report and until the repair is verified; this report is ${report.status.replace("_", " ")}.`,
      );
    }
    const supplier = await requireSupplier(tx, input.order.supplierRef);
    if (supplier.id === actor.id) {
      throw new HttpError(
        "forbidden",
        "Separation of duties: a buyer cannot give a work order to themselves.",
      );
    }
    const existing = await loadOrderState(tx, report);
    const orderId = existing?.order.id ?? newId();
    const version = existing ? existing.order.currentVersion + 1 : 1;

    if (existing) {
      if (existing.release) {
        throw new HttpError(
          "conflict",
          "The release for this work order was already authorised; it cannot change.",
        );
      }
      requireSeparation(existing, actor, "approve");
      if (existing.order.supplierId !== supplier.id) {
        throw new HttpError(
          "conflict",
          "This work order is bound to another supplier. A new version keeps the same supplier.",
        );
      }
      await tx
        .update(schema.workOrders)
        .set({ currentVersion: version })
        .where(eq(schema.workOrders.id, orderId));
    } else {
      await tx.insert(schema.workOrders).values({
        id: orderId,
        reportId: report.id,
        institutionId: report.institutionId,
        buyerId: actor.id,
        supplierId: supplier.id,
        supplierName: supplier.supplierName ?? supplier.displayName,
        supplierRef: supplier.supplierRef!,
        currentVersion: 1,
        acknowledgedVersion: null,
        acknowledgedBy: null,
        acknowledgedAt: null,
        createdAt: at,
      });
    }

    const versionId = newId();
    const document: WorkOrderDocument = {
      type: "work_order",
      workOrderId: orderId,
      reportId: report.id,
      institutionId: report.institutionId,
      version,
      description: scope,
      lines,
      totalCents,
      currency: CURRENCY,
      createdAt: at,
      salt: newSalt(),
    };
    const commitment = await computeCommitment(document);
    await tx.insert(schema.workOrderVersions).values({
      id: versionId,
      orderId,
      version,
      scope,
      lines,
      totalCents,
      approvedBy: actor.id,
      commitment,
      createdAt: at,
    });
    await tx.insert(schema.commitmentDocuments).values({
      recordId: versionId,
      reportId: report.id,
      type: "work_order",
      commitment,
      document,
      createdAt: at,
    });
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: "work_order_approved",
      actor,
      actorRole: actor.role,
      occurredAt: at,
      subjectId: versionId,
      anchoredValue: commitment,
      note: FINANCE_EVENT_NOTE.work_order_approved,
    });
    await anchorFinance(
      tx,
      deps.ledger,
      [
        financeSpec(
          {
            order: {
              id: orderId,
              reportId: report.id,
              institutionId: report.institutionId,
            },
          },
          "approve_work_order",
          event.id,
          { reportId: report.id, commitment },
        ),
      ],
      input.anchorMode,
      at,
    );
    await touch(tx, report.id, at);
    return report.id;
  });
}

/** `POST /api/issues/:id/work-order/acknowledgement`: the supplier accepts the current version. */
export async function acknowledgeOrder(
  deps: ProcurementDeps,
  input: ProcurementInput,
): Promise<string> {
  const { actor } = input;
  requireCan(actor, "order:acknowledge");
  const at = input.at ?? nowIso();
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
    if (state.order.acknowledgedVersion === state.order.currentVersion) {
      throw new HttpError(
        "conflict",
        `Version ${state.order.currentVersion} of this work order is already acknowledged.`,
      );
    }
    await tx
      .update(schema.workOrders)
      .set({
        acknowledgedVersion: state.order.currentVersion,
        acknowledgedBy: actor.id,
        acknowledgedAt: at,
      })
      .where(eq(schema.workOrders.id, state.order.id));
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: "work_order_acknowledged",
      actor,
      actorRole: actor.role,
      occurredAt: at,
      // The version that was acknowledged; the proof route shows its order document.
      subjectId: state.current.id,
      anchoredValue: null,
      note: FINANCE_EVENT_NOTE.work_order_acknowledged,
    });
    await anchorFinance(
      tx,
      deps.ledger,
      [financeSpec(state, "acknowledge_work_order", event.id)],
      input.anchorMode,
      at,
    );
    await touch(tx, report.id, at);
    return report.id;
  });
}
