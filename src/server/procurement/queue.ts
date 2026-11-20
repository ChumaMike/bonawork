/**
 * `GET /api/work/queue`: the cases that need the signed-in person now. One
 * kind of action per procurement role; rows carry no amount.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { WorkQueueItem } from "@/shared";
import type { InstitutionRow, ReportRow } from "../../../database/schema";
import { schema, type Db } from "../db";
import type { Actor } from "../reports/common";
import {
  gateFor,
  latestMatch,
  loadOrderStates,
  requireCan,
  stageOf,
  type OrderState,
} from "./state";

type Picked = Pick<WorkQueueItem, "action" | "blockers" | "since">;

/** What this state asks of this person, or null when it asks nothing. */
function actionFor(state: OrderState, actor: Actor): Picked | null {
  if (state.release) return null;
  const { order } = state;
  const acknowledged = order.acknowledgedVersion === order.currentVersion;
  const match = latestMatch(state);
  const current = match && match.orderVersion === order.currentVersion ? match : null;
  switch (actor.role) {
    case "supplier":
      if (!acknowledged) {
        return {
          action: "acknowledge_order",
          blockers: [],
          since: state.current.createdAt,
        };
      }
      // Nothing invoiced yet, or the last invoice was blocked: an invoice is due.
      if (!current || current.outcome === "blocked") {
        return {
          action: "submit_invoice",
          blockers: [],
          since: current?.createdAt ?? order.acknowledgedAt ?? state.current.createdAt,
        };
      }
      return null;
    case "receiving_officer":
      if (!acknowledged) return null;
      if (state.receipts.some((r) => r.orderVersion === order.currentVersion))
        return null;
      return {
        action: "record_receipt",
        blockers: [],
        since: order.acknowledgedAt ?? state.current.createdAt,
      };
    case "payment_approver": {
      if (!current || current.outcome !== "matched") return null;
      return {
        action: "authorise_release",
        blockers: gateFor(state, actor.id).blockers,
        since: current.createdAt,
      };
    }
    default:
      return null;
  }
}

export async function listWorkQueue(db: Db, actor: Actor): Promise<WorkQueueItem[]> {
  requireCan(actor, "procurement:read");
  const items: { report: ReportRow; state: OrderState | null; picked: Picked }[] = [];

  if (actor.role === "buyer") {
    // Assessed reports that have no work order yet.
    const rows = await db
      .select({ report: schema.reports })
      .from(schema.reports)
      .leftJoin(schema.workOrders, eq(schema.workOrders.reportId, schema.reports.id))
      .where(
        and(
          inArray(schema.reports.status, ["acknowledged", "in_progress"]),
          isNull(schema.workOrders.id),
          actor.institutionId
            ? eq(schema.reports.institutionId, actor.institutionId)
            : undefined,
        ),
      );
    for (const { report } of rows) {
      items.push({
        report,
        state: null,
        picked: { action: "approve_order", blockers: [], since: report.updatedAt },
      });
    }
  } else if (
    actor.role === "supplier" ||
    actor.role === "receiving_officer" ||
    actor.role === "payment_approver"
  ) {
    const orders = await db
      .select({ reportId: schema.workOrders.reportId })
      .from(schema.workOrders)
      .where(
        and(
          actor.role === "supplier"
            ? eq(schema.workOrders.supplierId, actor.id)
            : undefined,
          actor.institutionId
            ? eq(schema.workOrders.institutionId, actor.institutionId)
            : undefined,
        ),
      );
    const reportIds = orders.map((o) => o.reportId);
    const reports = reportIds.length
      ? await db
          .select()
          .from(schema.reports)
          .where(inArray(schema.reports.id, reportIds))
      : [];
    const states = await loadOrderStates(db, reports);
    for (const report of reports) {
      const state = states.get(report.id);
      const picked = state ? actionFor(state, actor) : null;
      if (state && picked) items.push({ report, state, picked });
    }
  }

  if (items.length === 0) return [];
  const institutionIds = [...new Set(items.map((i) => i.report.institutionId))];
  const institutions = await db
    .select()
    .from(schema.institutions)
    .where(inArray(schema.institutions.id, institutionIds));
  const byId = new Map<string, InstitutionRow>(institutions.map((i) => [i.id, i]));
  return items
    .map(({ report, state, picked }) => ({
      issueId: report.id,
      reference: report.reference,
      title: report.title,
      schoolName: byId.get(report.institutionId)?.name ?? "",
      workOrderId: state?.order.id ?? null,
      stage: state ? stageOf(state) : null,
      ...picked,
    }))
    .sort(
      (a, b) => a.since.localeCompare(b.since) || a.reference.localeCompare(b.reference),
    );
}
