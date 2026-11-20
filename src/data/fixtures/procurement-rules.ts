/**
 * DEVELOPMENT FIXTURE — how the sample procurement trail is read.
 *
 * Pure functions over a `FixtureCase` and its issue. The decisions are not
 * made here: the three-way match, the release gate and the redaction per role
 * are the shared functions in `@/shared`, the same ones the backend runs.
 */
import {
  redactMoneyTrail,
  releaseGate,
  visibilityFor,
  type ReportStatus,
} from "@/shared";
import type {
  Issue,
  IssueStatus,
  MoneyTrail,
  ProcurementStage,
  ReleaseGate,
  Session,
  WorkQueueItem,
} from "../types";
import type { FixtureCase } from "./procurement-seed";

/** The backend's report status behind each public status. */
const REPORT_STATUS: Record<IssueStatus, ReportStatus> = {
  reported: "submitted",
  under_assessment: "acknowledged",
  being_addressed: "in_progress",
  repair_claimed: "repair_claimed",
  independently_verified: "verified",
  disputed: "disputed",
  declined: "rejected",
};

/** An id no person has, for readers who are not the one authorising. */
const NOBODY = "nobody";

/** The latest rule-engine result of one invoice; null until the engine has run. */
export function matchOf(record: FixtureCase, invoiceId: string) {
  return (
    [...record.matches].reverse().find((match) => match.invoiceId === invoiceId) ?? null
  );
}

/** The result the release gate looks at: the latest run on the latest invoice. */
export function latestMatch(record: FixtureCase) {
  const invoice = record.invoices.at(-1);
  return invoice ? matchOf(record, invoice.id) : null;
}

export function acknowledged(record: FixtureCase): boolean {
  return record.order.acknowledgedVersion === record.order.version;
}

export function receivedCurrentVersion(record: FixtureCase): boolean {
  return record.receipts.some((receipt) => receipt.orderVersion === record.order.version);
}

function matchedNow(record: FixtureCase): boolean {
  const match = latestMatch(record);
  return match?.outcome === "matched" && match.orderVersion === record.order.version;
}

export function gateFor(
  record: FixtureCase,
  issue: Issue,
  authoriserId: string,
): ReleaseGate {
  return releaseGate({
    reportStatus: REPORT_STATUS[issue.status],
    orderVersion: record.order.version,
    acknowledgedVersion: record.order.acknowledgedVersion,
    latestMatch: latestMatch(record),
    alreadyReleased: record.release !== null,
    authoriserId,
    approverId: record.order.approvedBy,
    invoicerId: record.invoices.at(-1)?.submittedBy ?? null,
    receiverIds: record.receipts.map((receipt) => receipt.receivedBy),
    reviewerId: record.reviewerId,
  });
}

/** Where the order stands, for display. Never a report status. */
export function stageOf(record: FixtureCase, issue: Issue): ProcurementStage {
  if (record.release) return "release_authorised";
  if (latestMatch(record)?.outcome === "blocked") return "invoice_blocked";
  if (matchedNow(record)) {
    if (issue.status === "independently_verified") return "ready_for_release";
    if (issue.status === "repair_claimed") return "awaiting_verification";
    return "invoice_matched";
  }
  return acknowledged(record) ? "order_acknowledged" : "order_approved";
}

/** The whole trail, before it is filtered for a reader. */
function fullTrail(record: FixtureCase, issue: Issue, authoriserId: string): MoneyTrail {
  const { order } = record;
  return {
    issueId: issue.id,
    reference: issue.reference,
    workOrderId: order.id,
    stage: stageOf(record, issue),
    pricesVisible: true,
    order: {
      id: order.id,
      version: order.version,
      description: order.description,
      supplierName: order.supplierName,
      supplierRef: order.supplierRef,
      lines: order.lines.map((line) => ({ ...line })),
      totalCents: order.totalCents,
      currency: order.currency,
      approvedAt: order.approvedAt,
      acknowledged: acknowledged(record),
      acknowledgedAt: order.acknowledgedAt,
    },
    invoices: record.invoices.map((invoice) => {
      const match = matchOf(record, invoice.id);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderVersion: invoice.orderVersion,
        lines: invoice.lines.map((line) => ({ ...line })),
        totalCents: invoice.totalCents,
        aiDrafted: invoice.aiDrafted,
        submittedAt: invoice.createdAt,
        match: match
          ? {
              id: match.id,
              outcome: match.outcome,
              reasons: match.reasons.map((reason) => ({ ...reason })),
              recordedAt: match.createdAt,
            }
          : null,
      };
    }),
    receipts: record.receipts.map((receipt) => ({
      id: receipt.id,
      orderVersion: receipt.orderVersion,
      lines: receipt.lines.map((line) => ({ ...line })),
      evidenceCount: receipt.evidenceDigests.length,
      recordedAt: receipt.createdAt,
    })),
    gate: gateFor(record, issue, authoriserId),
    releaseAuthorisedAt: record.release?.createdAt ?? null,
    steps: (issue.publicTrail ?? []).map((step) => ({
      ...step,
      actorName: record.actorNames[step.eventId] ?? null,
    })),
  };
}

/**
 * The trail as this signed-in person may see it; null when they may see
 * nothing. A supplier sees only orders bound to its own account. Roles
 * without prices get the trail with every price and total removed.
 */
export function trailFor(
  record: FixtureCase,
  issue: Issue,
  user: Session["user"],
): MoneyTrail | null {
  const visibility = visibilityFor(user.role);
  if (visibility === "none") return null;
  if (visibility === "own_orders" && record.order.supplierId !== user.id) return null;
  const authoriserId = user.role === "payment_approver" ? user.id : NOBODY;
  return redactMoneyTrail(fullTrail(record, issue, authoriserId), visibility);
}

/** A report waits for a work order once the school has responded and the work is not claimed done. */
const NEEDS_ORDER = new Set<IssueStatus>(["under_assessment", "being_addressed"]);

/** The cases that need this person now, longest wait first. */
export function queueFor(
  user: Session["user"],
  issues: Issue[],
  cases: Record<string, FixtureCase>,
): WorkQueueItem[] {
  const items: WorkQueueItem[] = [];
  for (const issue of issues) {
    const record = cases[issue.id];
    const item = (
      action: WorkQueueItem["action"],
      since: string,
      blockers: WorkQueueItem["blockers"] = [],
    ): WorkQueueItem => ({
      issueId: issue.id,
      reference: issue.reference,
      title: issue.title,
      schoolName: issue.schoolName,
      workOrderId: record?.order.id ?? null,
      stage: record ? stageOf(record, issue) : null,
      action,
      blockers,
      since,
    });

    if (!record) {
      if (user.role === "buyer" && NEEDS_ORDER.has(issue.status)) {
        items.push(item("approve_order", issue.updatedAt));
      }
      continue;
    }
    if (record.release) continue;
    const { order } = record;

    switch (user.role) {
      case "supplier":
        if (order.supplierId !== user.id) break;
        if (!acknowledged(record)) {
          items.push(item("acknowledge_order", order.approvedAt));
        } else if (!matchedNow(record)) {
          const since =
            latestMatch(record)?.createdAt ?? order.acknowledgedAt ?? order.approvedAt;
          items.push(item("submit_invoice", since));
        }
        break;
      case "receiving_officer":
        // A receiving officer records deliveries at their own school.
        if (user.institutionId !== null && user.institutionId !== issue.schoolId) break;
        if (acknowledged(record) && !receivedCurrentVersion(record)) {
          items.push(item("record_receipt", order.acknowledgedAt ?? order.approvedAt));
        }
        break;
      case "payment_approver": {
        const since = latestMatch(record)?.createdAt ?? order.approvedAt;
        items.push(
          item("authorise_release", since, gateFor(record, issue, user.id).blockers),
        );
        break;
      }
      default:
        break;
    }
  }
  return items.sort((a, b) => a.since.localeCompare(b.since));
}
