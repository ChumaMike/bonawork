use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const REVIEWER_SEED: &[u8] = b"reviewer";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const TRANCHE_SEED: &[u8] = b"tranche";

/// Every escrow has exactly two tranches: 0 = materials delivered, 1 = repair completed.
pub const TRANCHE_COUNT: u8 = 2;

/// Program-wide settings. Changing these never rewrites an escrow that already exists:
/// each escrow copies what it needs when it is created.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// The only token escrows may hold (Bona Demo ZAR on devnet).
    pub mint: Pubkey,
    /// Co-signs a claim only after the off-chain three-way match passes.
    pub match_authority: Pubkey,
    /// May refund a disputed tranche or send it back for review. Can never release.
    pub dispute_authority: Pubkey,
    pub min_challenge_seconds: u32,
    pub max_challenge_seconds: u32,
    /// Stops new escrows only. Existing escrows keep working.
    pub paused: bool,
    pub bump: u8,
}

/// A vetted independent reviewer. Their name and ID stay off chain;
/// only a fingerprint of their public alias (e.g. "Reviewer R-104") is stored.
#[account]
#[derive(InitSpace)]
pub struct ReviewerRecord {
    pub wallet: Pubkey,
    pub alias_hash: [u8; 32],
    pub active: bool,
    pub bump: u8,
}

/// The funding agreement for one repair. Its terms are fixed at creation.
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub case_hash: [u8; 32],
    pub terms_hash: [u8; 32],

    /// Pays in, and receives any refund.
    pub funder: Pubkey,
    /// Optional wallet the funder may add to raise disputes on chain.
    /// `Pubkey::default()` means the funder chose not to.
    pub funder_challenger: Pubkey,
    /// Claims each tranche (with the match key). Receives a tranche when it is that tranche's payee.
    pub contractor: Pubkey,
    /// Responsible for raising disputes.
    pub school: Pubkey,
    /// The only wallet that can verify this repair. Replaceable only by `reassign_reviewer`
    /// (admin and school together, and never while a verified tranche awaits release).
    pub reviewer: Pubkey,
    /// Who receives each tranche when it is released, fixed at creation; nobody can change it.
    /// Typically payees[0] is the materials supplier (paid once the reviewer confirms the
    /// materials are on site) and payees[1] is the contractor.
    pub payees: [Pubkey; 2],

    pub mint: Pubkey,
    pub match_authority: Pubkey,
    pub dispute_authority: Pubkey,

    pub total_amount: u64,
    pub released_amount: u64,
    pub refunded_amount: u64,

    pub funding_deadline: i64,
    pub challenge_seconds: u32,
    /// How long a dispute may stay open before anyone can trigger a refund.
    pub dispute_seconds: u32,

    pub funded: bool,
    pub cancelled: bool,
    pub bump: u8,
}

impl Escrow {
    /// The fixed payee of tranche `index`. An index outside 0..2 gives the default key,
    /// which can never match a real account, so a release with it fails instead of panicking.
    pub fn payee_for(&self, index: u8) -> Pubkey {
        self.payees.get(usize::from(index)).copied().unwrap_or_default()
    }

    /// Tokens the vault must keep for tranches that are not settled yet.
    /// A cancelled escrow owes nothing: its tranches can never be claimed.
    pub fn amount_owed(&self) -> Result<u64> {
        if self.cancelled {
            return Ok(0);
        }
        let settled = self
            .released_amount
            .checked_add(self.refunded_amount)
            .ok_or(crate::errors::BonaError::ArithmeticOverflow)?;
        let owed = self
            .total_amount
            .checked_sub(settled)
            .ok_or(crate::errors::BonaError::ArithmeticOverflow)?;
        Ok(owed)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum TrancheState {
    /// Funded or waiting for funding; nothing claimed yet.
    Pending,
    /// The contractor says the work is done. Not verified.
    Claimed,
    /// The independent reviewer signed. The challenge window is running.
    Verified,
    /// Frozen by a dispute.
    Disputed,
    /// Paid to the tranche's fixed payee's token account.
    Released,
    /// Returned to the funder.
    Refunded,
}

/// One payment stage of an escrow.
#[account]
#[derive(InitSpace)]
pub struct Tranche {
    pub escrow: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub state: TrancheState,
    /// Goes up each time the claim changes, so a reviewer can only
    /// approve the exact evidence they inspected.
    pub revision: u32,

    pub verification_deadline: i64,
    pub claimed_at: i64,
    pub verified_at: i64,
    pub challenge_until: i64,
    pub disputed_at: i64,
    pub settled_at: i64,

    pub milestone_hash: [u8; 32],
    pub evidence_hash: [u8; 32],
    pub match_hash: [u8; 32],
    pub review_hash: [u8; 32],
    pub dispute_hash: [u8; 32],
    pub resolution_hash: [u8; 32],

    pub bump: u8,
}

pub fn is_set(hash: &[u8; 32]) -> bool {
    hash.iter().any(|b| *b != 0)
}
