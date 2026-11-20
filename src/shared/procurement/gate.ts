import type { ReportStatus } from "../domain";
import type { Id } from "../primitives";
import type { MatchResult, ReleaseGate } from "./types";

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
  void input;
  throw new Error("not implemented");
}
