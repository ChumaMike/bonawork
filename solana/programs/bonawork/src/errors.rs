use anchor_lang::prelude::*;

#[error_code]
pub enum BonaError {
    #[msg("This wallet is not allowed to do that")]
    Unauthorized,
    #[msg("New escrows are paused")]
    ProtocolPaused,
    #[msg("This step is not allowed in the tranche's current state")]
    InvalidState,
    #[msg("Funder, contractor, school and reviewer must be different wallets")]
    InvalidRoleAssignment,
    #[msg("This reviewer is not active")]
    ReviewerInactive,
    #[msg("Only the assigned independent reviewer can verify this work")]
    ReviewerMismatch,
    #[msg("The escrow must hold the configured demo rand token")]
    InvalidMint,
    #[msg("Amounts must be above zero")]
    InvalidAmount,
    #[msg("Deadlines are out of order or already past")]
    InvalidDeadline,
    #[msg("The challenge window is outside the allowed range")]
    InvalidChallengeDuration,
    #[msg("A fingerprint is missing")]
    InvalidHash,
    #[msg("The wrong tranche was passed")]
    InvalidTranche,
    #[msg("This escrow is already funded")]
    AlreadyFunded,
    #[msg("The vault does not hold the full amount yet")]
    InsufficientFunding,
    #[msg("The funding deadline has passed")]
    FundingExpired,
    #[msg("The funding deadline has not passed yet")]
    FundingStillOpen,
    #[msg("This escrow is not funded yet")]
    NotFunded,
    #[msg("This escrow was cancelled")]
    EscrowCancelled,
    #[msg("The verification deadline has passed")]
    VerificationExpired,
    #[msg("The evidence has changed. Review the latest submission.")]
    StaleRevision,
    #[msg("The evidence does not match what was claimed")]
    EvidenceMismatch,
    #[msg("The completion tranche waits until the materials tranche is released")]
    PreviousTrancheNotReleased,
    #[msg("Funds are locked until the challenge window ends")]
    ChallengeWindowActive,
    #[msg("The challenge window has closed")]
    ChallengeWindowClosed,
    #[msg("The dispute can still be resolved by the dispute authority")]
    DisputeTimeoutActive,
    #[msg("This tranche cannot be refunded yet")]
    RefundNotEligible,
    #[msg("This tranche has already been settled")]
    AlreadySettled,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
