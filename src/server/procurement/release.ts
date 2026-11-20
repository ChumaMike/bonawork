/**
 * The release instruction: the payment approver's decision that an order may
 * be released. It moves no money and it changes no report status.
 *
 * The decision is gated by `releaseGate` from `@/shared`: the repair must be
 * independently verified, the latest invoice must match the current order,
 * the order must be acknowledged, there must be no earlier release, and the
 * authoriser must not have acted on the case in another duty.
 */
import {
  computeCommitment,
  newSalt,
  type ReleaseBlocker,
  type ReleaseDecisionDocument,
} from "@/shared";
import { schema } from "../db";
import { HttpError } from "../http";
import { appendEvent, newId, nowIso, requireReport, touch } from "../reports/common";
import { FINANCE_EVENT_NOTE } from "./notes";
import {
  anchorFinance,
  financeSpec,
  gateFor,
  latestMatch,
  lockReport,
  requireCan,
  requireOrderAccess,
  requireOrderState,
  verifyingReview,
  type ProcurementDeps,
  type ProcurementInput,
} from "./state";

/** The gate is shut. The route answers 409 and names every blocker. */
export class ReleaseBlockedError extends HttpError {
  constructor(readonly blockers: ReleaseBlocker[]) {
    super(
      "conflict",
      `The release cannot be authorised yet: ${blockers.map((b) => b.code).join(", ")}.`,
    );
    this.name = "ReleaseBlockedError";
  }
}

/** `POST /api/issues/:id/release`. */
export async function authoriseRelease(
  deps: ProcurementDeps,
  input: ProcurementInput,
): Promise<string> {
  const { actor } = input;
  requireCan(actor, "release:authorise");
  const at = input.at ?? nowIso();
  return deps.db.transaction(async (tx) => {
    const report = await requireReport(tx, input.reportIdOrReference);
    await lockReport(tx, report.id);
    const state = await requireOrderState(tx, report);
    requireOrderAccess(actor, state.order);

    const gate = gateFor(state, actor.id);
    if (!gate.open) throw new ReleaseBlockedError(gate.blockers);
    const match = latestMatch(state);
    const review = verifyingReview(state);
    // An open gate means both exist; this keeps the types honest.
    if (!match || !review) {
      throw new ReleaseBlockedError([
        { code: match ? "repair_not_verified" : "no_matching_invoice" },
      ]);
    }

    const id = newId();
    const document: ReleaseDecisionDocument = {
      type: "release_decision",
      releaseId: id,
      workOrderId: state.order.id,
      reportId: report.id,
      matchCommitment: match.commitment,
      reviewCommitment: review.commitment,
      decision: "authorised",
      createdAt: at,
      salt: newSalt(),
    };
    const commitment = await computeCommitment(document);
    await tx.insert(schema.releaseInstructions).values({
      id,
      orderId: state.order.id,
      reportId: report.id,
      matchId: match.id,
      reviewId: review.id,
      authorisedBy: actor.id,
      commitment,
      createdAt: at,
    });
    await tx.insert(schema.commitmentDocuments).values({
      recordId: id,
      reportId: report.id,
      type: "release_decision",
      commitment,
      document,
      createdAt: at,
    });
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: "release_authorised",
      actor,
      actorRole: actor.role,
      occurredAt: at,
      subjectId: id,
      anchoredValue: commitment,
      note: FINANCE_EVENT_NOTE.release_authorised,
    });
    await anchorFinance(
      tx,
      deps.ledger,
      [financeSpec(state, "authorise_release", event.id, { commitment })],
      input.anchorMode,
      at,
    );
    await touch(tx, report.id, at);
    return report.id;
  });
}
