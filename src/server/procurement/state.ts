/**
 * Shared pieces of the procurement services: loading everything about one
 * work order, who may touch it, the release gate and the derived stage.
 *
 * Everything here reads the finance tables, so nothing here may be imported
 * by a public code path (`src/server/view.ts`, the issue and school routes).
 */
import { asc, eq, inArray } from "drizzle-orm";
import {
  can,
  releaseGate,
  type IsoDateTime,
  type LedgerPort,
  type OrderLine,
  type Permission,
  type ProcurementStage,
  type ReceiptLine,
  type ReleaseGate,
} from "@/shared";
import type {
  CaseEventRow,
  GoodsReceiptRow,
  IndependentReviewRow,
  InvoiceRow,
  MatchResultRow,
  ReleaseInstructionRow,
  ReportRow,
  WorkOrderRow,
  WorkOrderVersionRow,
} from "../../../database/schema";
import { schema, type Db } from "../db";
import { HttpError } from "../http";
import { anchor, type AnchorMode, type AnchorSpec } from "../reports/anchor";
import type { Actor } from "../reports/common";
import { isFinanceEventType } from "./notes";

export interface ProcurementDeps {
  db: Db;
  ledger: LedgerPort;
}

export interface ProcurementInput {
  reportIdOrReference: string;
  actor: Actor;
  at?: IsoDateTime;
  anchorMode?: AnchorMode;
}

/** Who is asking. Null is a signed-out visitor. */
export type Viewer = Pick<Actor, "id" | "role" | "institutionId"> | null;

/** Everything about one report's work order, oldest first within each list. */
export interface OrderState {
  report: ReportRow;
  order: WorkOrderRow;
  versions: WorkOrderVersionRow[];
  /** The row of `order.currentVersion`. */
  current: WorkOrderVersionRow;
  invoices: InvoiceRow[];
  receipts: GoodsReceiptRow[];
  matches: MatchResultRow[];
  release: ReleaseInstructionRow | null;
  /** Every independent review of the report. */
  reviews: IndependentReviewRow[];
  /** The finance case events of the report, in timeline order. */
  events: CaseEventRow[];
}

export function requireCan(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) {
    throw new HttpError("forbidden", `Your role (${actor.role}) cannot ${permission}.`);
  }
}

/** The work orders of the given reports with everything attached, keyed by report id. */
export async function loadOrderStates(
  db: Db,
  reports: ReportRow[],
): Promise<Map<string, OrderState>> {
  const states = new Map<string, OrderState>();
  if (reports.length === 0) return states;
  const reportIds = reports.map((r) => r.id);
  const orders = await db
    .select()
    .from(schema.workOrders)
    .where(inArray(schema.workOrders.reportId, reportIds));
  if (orders.length === 0) return states;
  const orderIds = orders.map((o) => o.id);
  const orderReportIds = orders.map((o) => o.reportId);
  const [versions, invoices, receipts, matches, releases, reviews, events] =
    await Promise.all([
      db
        .select()
        .from(schema.workOrderVersions)
        .where(inArray(schema.workOrderVersions.orderId, orderIds))
        .orderBy(asc(schema.workOrderVersions.version)),
      db
        .select()
        .from(schema.invoices)
        .where(inArray(schema.invoices.orderId, orderIds))
        .orderBy(asc(schema.invoices.createdAt)),
      db
        .select()
        .from(schema.goodsReceipts)
        .where(inArray(schema.goodsReceipts.orderId, orderIds))
        .orderBy(asc(schema.goodsReceipts.createdAt)),
      db
        .select()
        .from(schema.matchResults)
        .where(inArray(schema.matchResults.orderId, orderIds))
        .orderBy(asc(schema.matchResults.createdAt)),
      db
        .select()
        .from(schema.releaseInstructions)
        .where(inArray(schema.releaseInstructions.orderId, orderIds)),
      db
        .select()
        .from(schema.independentReviews)
        .where(inArray(schema.independentReviews.reportId, orderReportIds))
        .orderBy(asc(schema.independentReviews.createdAt)),
      db
        .select()
        .from(schema.caseEvents)
        .where(inArray(schema.caseEvents.reportId, orderReportIds))
        .orderBy(asc(schema.caseEvents.sequence)),
    ]);
  const byReport = new Map(reports.map((r) => [r.id, r]));
  // Two records written in the same millisecond keep the order of their case events.
  const sequenceOf = new Map(events.map((e) => [e.subjectId ?? e.id, e.sequence]));
  const inOrder = <T extends { id: string; createdAt: string }>(rows: T[]): T[] =>
    [...rows].sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        (sequenceOf.get(a.id) ?? 0) - (sequenceOf.get(b.id) ?? 0),
    );
  for (const order of orders) {
    const own = versions.filter((v) => v.orderId === order.id);
    const current = own.find((v) => v.version === order.currentVersion);
    const report = byReport.get(order.reportId);
    if (!current || !report) continue;
    states.set(order.reportId, {
      report,
      order,
      versions: own,
      current,
      invoices: inOrder(invoices.filter((i) => i.orderId === order.id)),
      receipts: inOrder(receipts.filter((r) => r.orderId === order.id)),
      matches: inOrder(matches.filter((m) => m.orderId === order.id)),
      release: releases.find((r) => r.orderId === order.id) ?? null,
      reviews: reviews.filter((r) => r.reportId === order.reportId),
      events: events.filter(
        (e) => e.reportId === order.reportId && isFinanceEventType(e.type),
      ),
    });
  }
  return states;
}

export async function loadOrderState(
  db: Db,
  report: ReportRow,
): Promise<OrderState | null> {
  return (await loadOrderStates(db, [report])).get(report.id) ?? null;
}

export async function requireOrderState(db: Db, report: ReportRow): Promise<OrderState> {
  const state = await loadOrderState(db, report);
  if (!state) throw new HttpError("not_found", "This case has no work order yet.");
  return state;
}

/* ---------------------------------- Access ---------------------------------- */

/**
 * Whether this person may see or act on this order at all. A supplier only
 * its own orders; staff attached to an institution only that institution's.
 */
export function requireOrderAccess(
  actor: NonNullable<Viewer>,
  order: Pick<WorkOrderRow, "supplierId" | "institutionId">,
): void {
  if (actor.role === "supplier" && order.supplierId !== actor.id) {
    throw new HttpError("forbidden", "This work order belongs to another supplier.");
  }
  requireInstitutionAccess(actor, order.institutionId);
}

export function requireInstitutionAccess(
  actor: NonNullable<Viewer>,
  institutionId: string,
): void {
  if (actor.institutionId && actor.institutionId !== institutionId) {
    throw new HttpError("forbidden", "This case belongs to another institution.");
  }
}

/* -------------------------------- Separation -------------------------------- */

/** The duties on one case that must each sit with a different person. */
export type Duty = "approve" | "supply" | "receive" | "review" | "authorise";

const DUTY_WORDS: Record<Duty, string> = {
  approve: "approved the work order",
  supply: "acted as the supplier",
  receive: "recorded the delivery",
  review: "reviewed the repair",
  authorise: "authorised the release",
};

/** What this person has already done on this case. */
export function dutiesOf(state: OrderState, userId: string): Duty[] {
  const duties: Duty[] = [];
  if (
    state.order.buyerId === userId ||
    state.versions.some((v) => v.approvedBy === userId)
  ) {
    duties.push("approve");
  }
  if (
    state.order.supplierId === userId ||
    state.order.acknowledgedBy === userId ||
    state.invoices.some((i) => i.submittedBy === userId)
  ) {
    duties.push("supply");
  }
  if (state.receipts.some((r) => r.receivedBy === userId)) duties.push("receive");
  if (state.reviews.some((r) => r.reviewerId === userId)) duties.push("review");
  if (state.release?.authorisedBy === userId) duties.push("authorise");
  return duties;
}

/**
 * Per-case separation of duties: a person who already acted on this case in
 * one of these duties may not take another, even after a role change.
 */
export function requireSeparation(state: OrderState, actor: Actor, duty: Duty): void {
  const other = dutiesOf(state, actor.id).filter((d) => d !== duty);
  if (other.length > 0) {
    throw new HttpError(
      "forbidden",
      `Separation of duties: you already ${DUTY_WORDS[other[0]]} on this case, so a different person must do this step.`,
    );
  }
}

/* ------------------------------ Gate and stage ------------------------------ */

/** The match result of the latest invoice, or null when there is none. */
export function latestMatch(state: OrderState): MatchResultRow | null {
  const invoice = state.invoices.at(-1);
  if (!invoice) return null;
  return state.matches.filter((m) => m.invoiceId === invoice.id).at(-1) ?? null;
}

/** The review that verified the repair, when the report is verified. */
export function verifyingReview(state: OrderState): IndependentReviewRow | null {
  if (state.report.status !== "verified") return null;
  return state.reviews.filter((r) => r.outcome === "verified").at(-1) ?? null;
}

/**
 * The release gate as `authoriserId` would meet it. Pass null for a viewer
 * who is not the authoriser: the gate is then evaluated without the
 * same-person check.
 */
export function gateFor(state: OrderState, authoriserId: string | null): ReleaseGate {
  const match = latestMatch(state);
  return releaseGate({
    reportStatus: state.report.status,
    orderVersion: state.order.currentVersion,
    acknowledgedVersion: state.order.acknowledgedVersion,
    latestMatch: match
      ? { outcome: match.outcome, orderVersion: match.orderVersion }
      : null,
    alreadyReleased: state.release !== null,
    // No stored id is ever empty, so "" matches nobody.
    authoriserId: authoriserId ?? "",
    approverId: state.current.approvedBy,
    invoicerId: state.invoices.at(-1)?.submittedBy ?? null,
    receiverIds: state.receipts.map((r) => r.receivedBy),
    reviewerId: verifyingReview(state)?.reviewerId ?? null,
  });
}

/** Where the order stands, for display. Derived, never stored. */
export function stageOf(state: OrderState): ProcurementStage {
  if (state.release) return "release_authorised";
  const match = latestMatch(state);
  if (match && match.orderVersion === state.order.currentVersion) {
    if (match.outcome === "blocked") return "invoice_blocked";
    if (state.report.status === "verified") return "ready_for_release";
    if (state.report.status === "repair_claimed") return "awaiting_verification";
    return "invoice_matched";
  }
  return state.order.acknowledgedVersion === state.order.currentVersion
    ? "order_acknowledged"
    : "order_approved";
}

/* -------------------------------- Validation -------------------------------- */

/** Totals are stored in a 32-bit column; nothing a school orders comes near this. */
export const MAX_TOTAL_CENTS = 2_000_000_000;

/** Trim the text fields and refuse a line code that appears twice. */
export function cleanLines<T extends OrderLine | ReceiptLine>(
  lines: T[],
  what: string,
): T[] {
  const seen = new Set<string>();
  return lines.map((line) => {
    const sku = line.sku.trim();
    const description = line.description.trim();
    if (!sku || !description) {
      throw new HttpError(
        "invalid_input",
        `Every ${what} line needs a code and a description.`,
      );
    }
    if (seen.has(sku)) {
      throw new HttpError(
        "invalid_input",
        `Line ${sku} appears twice on the ${what}. Put each item on one line.`,
      );
    }
    seen.add(sku);
    return { ...line, sku, description };
  });
}

/** Sum of `quantity * unitPriceCents`, refused when it cannot be stored exactly. */
export function totalOf(lines: OrderLine[]): number {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  requireStorable(total);
  return total;
}

export function requireStorable(cents: number): void {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_TOTAL_CENTS) {
    throw new HttpError("invalid_input", "The total is larger than this system records.");
  }
}

/* --------------------------------- Anchoring -------------------------------- */

/**
 * Anchor finance steps through the same `anchor()` as every other write.
 *
 * While the ledger says finance writes are `off`, every one of them would be
 * refused as `not_configured`; a job queued for it could never succeed and
 * `processLedgerJobs` stops at the first such job, so it would hold up every
 * later write on every other case. In that configuration the steps are kept
 * off-chain: the case events simply carry no receipt.
 */
export async function anchorFinance(
  tx: Db,
  ledger: LedgerPort,
  specs: AnchorSpec[],
  mode: AnchorMode | undefined,
  at: IsoDateTime,
): Promise<void> {
  if (specs.length === 0 || ledger.info().finance === "off") return;
  await anchor(tx, ledger, specs, mode ?? "sync", at);
}

/** The ledger job for one finance case event. The receipt sits on the event. */
export function financeSpec(
  state: { order: Pick<WorkOrderRow, "id" | "reportId" | "institutionId"> },
  operation: AnchorSpec["operation"],
  eventId: string,
  payload: Record<string, string> = {},
): AnchorSpec {
  return {
    reportId: state.order.reportId,
    operation,
    payload: {
      institutionId: state.order.institutionId,
      workOrderId: state.order.id,
      ...payload,
    },
    targetKind: "event",
    targetId: eventId,
    eventId,
  };
}

export async function lockReport(tx: Db, reportId: string): Promise<void> {
  // Serialise the finance writes of one case: two invoices submitted at once
  // must each see the other when the rule engine checks for a reused number.
  await tx
    .select({ id: schema.reports.id })
    .from(schema.reports)
    .where(eq(schema.reports.id, reportId))
    .for("update");
}
