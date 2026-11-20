import type { ReportStatus } from "../domain";
import type { Id } from "../primitives";
import type {
  MatchResult,
  ReleaseBlocker,
  ReleaseBlockerCode,
  ReleaseGate,
} from "./types";

export interface ReleaseGateInput {
  /** The report status. Only `verified` lets a release through. */
  reportStatus: ReportStatus;
  /** The current order version. */
  orderVersion: number;
  /** The version the supplier acknowledged; null when none. */
  acknowledgedVersion: number | null;
  /** The match result of the latest invoice; null when no invoice has been matched. */
  latestMatch: Pick<MatchResult, "outcome" | "orderVersion"> | null;
  /** True when a release instruction already exists for this order. */
  alreadyReleased: boolean;
  /** The person asking to authorise. */
  authoriserId: Id;
  /** The people who already acted on this case. The authoriser must be none of them. */
  approverId: Id;
  invoicerId: Id | null;
  receiverIds: readonly Id[];
  reviewerId: Id | null;
}

/**
 * Whether a release instruction may be authorised now. Open only when the
 * report is `verified`, the latest match is `matched` on the current order
 * version, the order is acknowledged, there is no earlier release, and the
 * authoriser is not the approver, the invoicer, a receiver or the reviewer.
 * Returns every blocker, in the order of `RELEASE_BLOCKER_CODES`.
 */
export function releaseGate(input: ReleaseGateInput): ReleaseGate {
  const blockers: ReleaseBlocker[] = [];
  const block = (code: ReleaseBlockerCode) => blockers.push({ code });

  if (input.reportStatus !== "verified") block("repair_not_verified");
  if (
    !input.latestMatch ||
    input.latestMatch.outcome !== "matched" ||
    input.latestMatch.orderVersion !== input.orderVersion
  ) {
    block("no_matching_invoice");
  }
  if (input.acknowledgedVersion !== input.orderVersion) block("order_not_acknowledged");
  if (input.alreadyReleased) block("already_released");

  const acted = [
    input.approverId,
    input.invoicerId,
    ...input.receiverIds,
    input.reviewerId,
  ];
  if (acted.includes(input.authoriserId)) block("same_person");

  return { open: blockers.length === 0, blockers };
}
