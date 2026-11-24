/**
 * BonaWork program errors. Anchor numbers custom errors from 6000 in the
 * order of the BonaError enum in programs/bonawork/src/errors.rs.
 */

export const ANCHOR_ERROR_OFFSET = 6000;

/** Error names in enum order, paired with a short plain-English message for people. */
export const BONA_ERRORS = [
  ["Unauthorized", "This wallet is not allowed to do that."],
  ["ProtocolPaused", "New escrows are paused for now."],
  ["InvalidState", "This step does not fit where the payment stage is now."],
  [
    "InvalidRoleAssignment",
    "The funder, contractor, school and reviewer must be four different people.",
  ],
  ["ReviewerInactive", "This reviewer is not active."],
  ["ReviewerMismatch", "Only the reviewer assigned to this repair can verify it."],
  ["InvalidMint", "This escrow only holds the demo rand token."],
  ["InvalidAmount", "Each payment stage must be more than zero."],
  ["InvalidDeadline", "A deadline is in the wrong order or already past."],
  ["InvalidChallengeDuration", "The challenge window is too short or too long."],
  ["InvalidHash", "A required fingerprint is missing."],
  ["InvalidTranche", "The wrong payment stage was sent."],
  ["AlreadyFunded", "This escrow is already funded."],
  ["InsufficientFunding", "The vault does not hold the full amount yet."],
  ["FundingExpired", "The funding deadline has passed."],
  ["FundingStillOpen", "The funding deadline has not passed yet."],
  ["NotFunded", "This escrow is not funded yet."],
  ["EscrowCancelled", "This escrow was cancelled."],
  ["VerificationExpired", "The deadline to verify this work has passed."],
  ["StaleRevision", "The evidence changed. Review the latest submission."],
  ["EvidenceMismatch", "The evidence does not match what was claimed."],
  [
    "PreviousTrancheNotReleased",
    "The completion payment waits until the materials payment is released.",
  ],
  ["ChallengeWindowActive", "The money is locked until the challenge window ends."],
  ["ChallengeWindowClosed", "The challenge window has closed."],
  [
    "DisputeTimeoutActive",
    "The dispute can still be settled, so it cannot be refunded yet.",
  ],
  ["RefundNotEligible", "This payment stage cannot be refunded yet."],
  ["AlreadySettled", "This payment stage has already been paid out or refunded."],
  ["ArithmeticOverflow", "A number was too large to handle."],
] as const;

export type BonaErrorName = (typeof BONA_ERRORS)[number][0];

export type BonaProgramError = { code: number; name: BonaErrorName; message: string };

export function getBonaError(code: number): BonaProgramError | null {
  const entry = BONA_ERRORS[code - ANCHOR_ERROR_OFFSET];
  if (!entry) return null;
  return { code, name: entry[0], message: entry[1] };
}

export function getBonaErrorCode(name: BonaErrorName): number {
  return ANCHOR_ERROR_OFFSET + BONA_ERRORS.findIndex(([n]) => n === name);
}

/** Plain message for a program error code, or a generic sentence for anything else. */
export function bonaErrorMessage(code: number): string {
  return (
    getBonaError(code)?.message ?? `The network rejected the transaction (code ${code}).`
  );
}
