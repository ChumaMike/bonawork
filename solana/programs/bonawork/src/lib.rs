//! BonaWork: school repair money that only moves after an independent check.
//!
//! A funder's demo-rand tokens sit in a vault owned by the escrow account.
//! Each of two tranches pays its fixed payee (the contractor, or e.g. a materials
//! supplier for tranche 0) only after:
//!   1. the contractor and the procurement match key both sign a claim,
//!   2. the assigned independent reviewer signs that exact claim,
//!   3. the challenge window passes with no open dispute.
//! Then anyone may trigger the release, but the amount and recipient are fixed.
//! Nobody, including the platform admin, can move escrowed tokens any other way.
//! The only other outflows go back to the funder: refunds, cancellation, and
//! `sweep_surplus`, which can only return tokens beyond what open tranches are owed.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

pub mod errors;
pub mod events;
pub mod state;

use errors::BonaError;
use events::*;
use state::*;

declare_id!("5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY");

/// The only wallet that may create the program config.
#[cfg(not(feature = "localtest"))]
pub const ADMIN: Pubkey = Pubkey::new_from_array([
    0, 70, 53, 255, 211, 171, 9, 237, 35, 190, 200, 73, 84, 115, 205, 86, 82, 64, 185, 70, 95,
    137, 199, 190, 147, 170, 12, 66, 174, 166, 233, 232,
]);
/// Test builds only: the key derived from the seed [7; 32].
#[cfg(feature = "localtest")]
pub const ADMIN: Pubkey = Pubkey::new_from_array([
    234, 74, 108, 99, 226, 156, 82, 10, 190, 245, 80, 123, 19, 46, 197, 249, 149, 71, 118, 174,
    190, 190, 123, 146, 66, 30, 234, 105, 20, 70, 210, 44,
]);

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigArgs {
    pub match_authority: Pubkey,
    pub dispute_authority: Pubkey,
    pub min_challenge_seconds: u32,
    pub max_challenge_seconds: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateEscrowArgs {
    pub case_hash: [u8; 32],
    pub terms_hash: [u8; 32],
    pub funder: Pubkey,
    pub funder_challenger: Pubkey,
    pub contractor: Pubkey,
    pub school: Pubkey,
    pub reviewer: Pubkey,
    pub amounts: [u64; 2],
    pub milestone_hashes: [[u8; 32]; 2],
    pub funding_deadline: i64,
    pub verification_deadlines: [i64; 2],
    pub challenge_seconds: u32,
    pub dispute_seconds: u32,
    /// Who each tranche pays on release. `Pubkey::default()` means the contractor.
    /// A payee may be the contractor, but never the funder, school, reviewer,
    /// funder challenger, a platform key, or the escrow itself.
    pub payees: [Pubkey; 2],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum DisputeOutcome {
    Refund,
    RequireReverification,
}

#[program]
pub mod bonawork {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, args: ConfigArgs) -> Result<()> {
        require!(
            args.min_challenge_seconds > 0 && args.min_challenge_seconds <= args.max_challenge_seconds,
            BonaError::InvalidChallengeDuration
        );
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.mint = ctx.accounts.mint.key();
        config.match_authority = args.match_authority;
        config.dispute_authority = args.dispute_authority;
        config.min_challenge_seconds = args.min_challenge_seconds;
        config.max_challenge_seconds = args.max_challenge_seconds;
        config.paused = false;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    pub fn set_reviewer(
        ctx: Context<SetReviewer>,
        wallet: Pubkey,
        alias_hash: [u8; 32],
        active: bool,
    ) -> Result<()> {
        require!(is_set(&alias_hash), BonaError::InvalidHash);
        let config = &ctx.accounts.config;
        require!(
            wallet != config.admin
                && wallet != config.match_authority
                && wallet != config.dispute_authority,
            BonaError::InvalidRoleAssignment
        );
        let record = &mut ctx.accounts.reviewer_record;
        record.wallet = wallet;
        record.alias_hash = alias_hash;
        record.active = active;
        record.bump = ctx.bumps.reviewer_record;
        Ok(())
    }

    pub fn create_escrow(ctx: Context<CreateEscrow>, args: CreateEscrowArgs) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let config = &ctx.accounts.config;
        require!(!config.paused, BonaError::ProtocolPaused);
        require!(ctx.accounts.reviewer_record.active, BonaError::ReviewerInactive);

        // Four different people, and none of them is a platform key.
        let people = [args.funder, args.contractor, args.school, args.reviewer];
        for i in 0..people.len() {
            require!(people[i] != Pubkey::default(), BonaError::InvalidRoleAssignment);
            for j in (i + 1)..people.len() {
                require!(people[i] != people[j], BonaError::InvalidRoleAssignment);
            }
            require!(
                people[i] != config.match_authority && people[i] != config.dispute_authority,
                BonaError::InvalidRoleAssignment
            );
        }
        if args.funder_challenger != Pubkey::default() {
            require!(
                args.funder_challenger != args.reviewer && args.funder_challenger != args.contractor,
                BonaError::InvalidRoleAssignment
            );
        }

        require!(is_set(&args.case_hash) && is_set(&args.terms_hash), BonaError::InvalidHash);
        require!(
            is_set(&args.milestone_hashes[0]) && is_set(&args.milestone_hashes[1]),
            BonaError::InvalidHash
        );
        require!(args.amounts[0] > 0 && args.amounts[1] > 0, BonaError::InvalidAmount);
        let total = args.amounts[0]
            .checked_add(args.amounts[1])
            .ok_or(BonaError::ArithmeticOverflow)?;

        require!(args.funding_deadline > now, BonaError::InvalidDeadline);
        require!(
            args.verification_deadlines[0] > args.funding_deadline
                && args.verification_deadlines[1] >= args.verification_deadlines[0],
            BonaError::InvalidDeadline
        );
        require!(
            args.challenge_seconds >= config.min_challenge_seconds
                && args.challenge_seconds <= config.max_challenge_seconds,
            BonaError::InvalidChallengeDuration
        );
        require!(args.dispute_seconds > 0, BonaError::InvalidDeadline);

        let escrow_key = ctx.accounts.escrow.key();

        // Payee per tranche. A supplier paid directly for materials lets a contractor
        // without working capital start; the default is the contractor.
        let payees = args.payees.map(|p| if p == Pubkey::default() { args.contractor } else { p });
        for payee in payees.iter() {
            require!(
                *payee != args.funder
                    && *payee != args.school
                    && *payee != args.reviewer
                    && *payee != config.match_authority
                    && *payee != config.dispute_authority
                    && *payee != escrow_key
                    && (args.funder_challenger == Pubkey::default() || *payee != args.funder_challenger),
                BonaError::InvalidRoleAssignment
            );
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.case_hash = args.case_hash;
        escrow.terms_hash = args.terms_hash;
        escrow.funder = args.funder;
        escrow.funder_challenger = args.funder_challenger;
        escrow.contractor = args.contractor;
        escrow.school = args.school;
        escrow.reviewer = args.reviewer;
        escrow.payees = payees;
        escrow.mint = config.mint;
        escrow.match_authority = config.match_authority;
        escrow.dispute_authority = config.dispute_authority;
        escrow.total_amount = total;
        escrow.released_amount = 0;
        escrow.refunded_amount = 0;
        escrow.funding_deadline = args.funding_deadline;
        escrow.challenge_seconds = args.challenge_seconds;
        escrow.dispute_seconds = args.dispute_seconds;
        escrow.funded = false;
        escrow.cancelled = false;
        escrow.bump = ctx.bumps.escrow;

        let t0 = &mut ctx.accounts.tranche0;
        set_up_tranche(t0, escrow_key, 0, args.amounts[0], args.verification_deadlines[0], args.milestone_hashes[0], ctx.bumps.tranche0);
        let t1 = &mut ctx.accounts.tranche1;
        set_up_tranche(t1, escrow_key, 1, args.amounts[1], args.verification_deadlines[1], args.milestone_hashes[1], ctx.bumps.tranche1);

        emit!(EscrowCreated { escrow: escrow_key, case_hash: args.case_hash, total_amount: total, payees });
        Ok(())
    }

    /// Anyone may call this once the vault holds the agreed amount.
    pub fn activate_funding(ctx: Context<ActivateFunding>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let escrow = &mut ctx.accounts.escrow;
        require!(!escrow.funded, BonaError::AlreadyFunded);
        require!(!escrow.cancelled, BonaError::EscrowCancelled);
        require!(now < escrow.funding_deadline, BonaError::FundingExpired);
        require!(ctx.accounts.vault.amount >= escrow.total_amount, BonaError::InsufficientFunding);
        escrow.funded = true;
        emit!(EscrowFunded { escrow: escrow.key(), amount: escrow.total_amount });
        Ok(())
    }

    /// Anyone may cancel an escrow that missed its funding deadline.
    /// Whatever reached the vault goes back to the funder.
    pub fn cancel_unfunded(ctx: Context<CancelUnfunded>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let escrow = &ctx.accounts.escrow;
        require!(!escrow.funded, BonaError::AlreadyFunded);
        require!(!escrow.cancelled, BonaError::EscrowCancelled);
        require!(now >= escrow.funding_deadline, BonaError::FundingStillOpen);

        let amount = ctx.accounts.vault.amount;
        if amount > 0 {
            pay_from_vault(
                escrow,
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.funder_ata.to_account_info(),
                amount,
                ctx.accounts.mint.decimals,
            )?;
        }
        let escrow = &mut ctx.accounts.escrow;
        escrow.cancelled = true;
        emit!(EscrowCancelled { escrow: escrow.key(), returned: amount });
        Ok(())
    }

    /// The contractor claims a tranche. The match key co-signs only after the
    /// off-chain three-way match (order, invoice, goods receipt) passes.
    pub fn claim_tranche(
        ctx: Context<ClaimTranche>,
        expected_revision: u32,
        evidence_hash: [u8; 32],
        match_hash: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let escrow = &ctx.accounts.escrow;
        require!(escrow.funded, BonaError::NotFunded);
        require!(!escrow.cancelled, BonaError::EscrowCancelled);
        require!(is_set(&evidence_hash) && is_set(&match_hash), BonaError::InvalidHash);

        let tranche = &mut ctx.accounts.tranche;
        require!(
            tranche.state == TrancheState::Pending || tranche.state == TrancheState::Claimed,
            BonaError::InvalidState
        );
        require!(tranche.revision == expected_revision, BonaError::StaleRevision);
        require!(now < tranche.verification_deadline, BonaError::VerificationExpired);

        if tranche.index == 1 {
            let prior = ctx.accounts.prior_tranche.as_ref().ok_or(BonaError::InvalidTranche)?;
            require!(prior.escrow == escrow.key() && prior.index == 0, BonaError::InvalidTranche);
            require!(prior.state == TrancheState::Released, BonaError::PreviousTrancheNotReleased);
        }

        tranche.revision = tranche.revision.checked_add(1).ok_or(BonaError::ArithmeticOverflow)?;
        tranche.evidence_hash = evidence_hash;
        tranche.match_hash = match_hash;
        tranche.claimed_at = now;
        tranche.state = TrancheState::Claimed;

        emit!(TrancheClaimed {
            escrow: escrow.key(),
            index: tranche.index,
            revision: tranche.revision,
            evidence_hash,
            match_hash,
        });
        Ok(())
    }

    /// The assigned independent reviewer approves the exact claim they inspected.
    /// This starts the challenge window.
    pub fn verify_tranche(
        ctx: Context<VerifyTranche>,
        expected_revision: u32,
        expected_evidence_hash: [u8; 32],
        expected_match_hash: [u8; 32],
        review_hash: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let escrow = &ctx.accounts.escrow;
        require!(!escrow.cancelled, BonaError::EscrowCancelled);
        require!(ctx.accounts.reviewer_record.active, BonaError::ReviewerInactive);
        require!(is_set(&review_hash), BonaError::InvalidHash);

        let tranche = &mut ctx.accounts.tranche;
        require!(tranche.state == TrancheState::Claimed, BonaError::InvalidState);
        require!(now < tranche.verification_deadline, BonaError::VerificationExpired);
        require!(tranche.revision == expected_revision, BonaError::StaleRevision);
        require!(
            tranche.evidence_hash == expected_evidence_hash
                && tranche.match_hash == expected_match_hash,
            BonaError::EvidenceMismatch
        );

        tranche.verified_at = now;
        tranche.challenge_until = now
            .checked_add(i64::from(escrow.challenge_seconds))
            .ok_or(BonaError::ArithmeticOverflow)?;
        tranche.review_hash = review_hash;
        tranche.state = TrancheState::Verified;

        emit!(TrancheVerified {
            escrow: escrow.key(),
            index: tranche.index,
            revision: tranche.revision,
            reviewer: ctx.accounts.reviewer.key(),
            challenge_until: tranche.challenge_until,
        });
        Ok(())
    }

    /// The school (or the funder's optional challenge wallet) freezes a
    /// verified tranche before its challenge window closes. No tokens move.
    pub fn open_dispute(
        ctx: Context<OpenDispute>,
        expected_revision: u32,
        reason_hash: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let escrow = &ctx.accounts.escrow;
        let by = ctx.accounts.challenger.key();
        let allowed = by == escrow.school
            || (escrow.funder_challenger != Pubkey::default() && by == escrow.funder_challenger);
        require!(allowed, BonaError::Unauthorized);
        require!(is_set(&reason_hash), BonaError::InvalidHash);

        let tranche = &mut ctx.accounts.tranche;
        require!(tranche.state == TrancheState::Verified, BonaError::InvalidState);
        require!(tranche.revision == expected_revision, BonaError::StaleRevision);
        require!(now < tranche.challenge_until, BonaError::ChallengeWindowClosed);

        tranche.state = TrancheState::Disputed;
        tranche.disputed_at = now;
        tranche.dispute_hash = reason_hash;

        emit!(DisputeOpened { escrow: escrow.key(), index: tranche.index, by, reason_hash });
        Ok(())
    }

    /// The dispute authority either refunds the funder or sends the claim back
    /// for a fresh independent review. It can never release money.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        outcome: DisputeOutcome,
        resolution_hash: [u8; 32],
        new_verification_deadline: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(is_set(&resolution_hash), BonaError::InvalidHash);
        require!(ctx.accounts.tranche.state == TrancheState::Disputed, BonaError::InvalidState);

        let index = ctx.accounts.tranche.index;
        let escrow_key = ctx.accounts.escrow.key();
        match outcome {
            DisputeOutcome::Refund => {
                let amount = ctx.accounts.tranche.amount;
                pay_from_vault(
                    &ctx.accounts.escrow,
                    ctx.accounts.vault.to_account_info(),
                    ctx.accounts.mint.to_account_info(),
                    ctx.accounts.funder_ata.to_account_info(),
                    amount,
                    ctx.accounts.mint.decimals,
                )?;
                record_refund(&mut ctx.accounts.escrow, &mut ctx.accounts.tranche, now)?;
                emit!(TrancheRefunded { escrow: escrow_key, index, amount });
            }
            DisputeOutcome::RequireReverification => {
                require!(new_verification_deadline > now, BonaError::InvalidDeadline);
                let tranche = &mut ctx.accounts.tranche;
                tranche.revision = tranche.revision.checked_add(1).ok_or(BonaError::ArithmeticOverflow)?;
                tranche.state = TrancheState::Claimed;
                tranche.verified_at = 0;
                tranche.challenge_until = 0;
                tranche.review_hash = [0; 32];
                tranche.verification_deadline = new_verification_deadline;
            }
        }
        ctx.accounts.tranche.resolution_hash = resolution_hash;
        emit!(DisputeResolved {
            escrow: escrow_key,
            index,
            refunded: outcome == DisputeOutcome::Refund,
            resolution_hash,
        });
        Ok(())
    }

    /// Anyone may release a verified tranche once its challenge window is over.
    /// The amount and the recipient (`escrow.payees[index]`) were fixed when the escrow
    /// was created; the `payee` account is checked against it, so no caller can redirect it.
    pub fn release_tranche(ctx: Context<ReleaseTranche>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let escrow = &ctx.accounts.escrow;
        require!(escrow.funded, BonaError::NotFunded);
        require!(!escrow.cancelled, BonaError::EscrowCancelled);

        let tranche = &ctx.accounts.tranche;
        require!(
            tranche.state != TrancheState::Released && tranche.state != TrancheState::Refunded,
            BonaError::AlreadySettled
        );
        require!(tranche.state == TrancheState::Verified, BonaError::InvalidState);
        require!(now >= tranche.challenge_until, BonaError::ChallengeWindowActive);

        let amount = tranche.amount;
        let index = tranche.index;
        let released = escrow.released_amount.checked_add(amount).ok_or(BonaError::ArithmeticOverflow)?;
        let settled = released.checked_add(escrow.refunded_amount).ok_or(BonaError::ArithmeticOverflow)?;
        require!(settled <= escrow.total_amount, BonaError::ArithmeticOverflow);

        pay_from_vault(
            escrow,
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.payee_ata.to_account_info(),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.released_amount = released;
        let tranche = &mut ctx.accounts.tranche;
        tranche.state = TrancheState::Released;
        tranche.settled_at = now;

        emit!(TrancheReleased {
            escrow: escrow.key(),
            index,
            amount,
            payee: ctx.accounts.payee.key(),
            caller: ctx.accounts.caller.key(),
        });
        Ok(())
    }

    /// Replaces the escrow's reviewer, e.g. when the assigned one was deactivated or
    /// disappeared (otherwise verification is blocked until the deadline refund).
    /// Needs BOTH the platform admin and the escrow's school to sign, so neither can
    /// pick a friendly reviewer alone. Refused while any tranche is Verified (its
    /// challenge window or release is pending) or Disputed, so a review already given
    /// can never be swapped out from under a challenge. The new reviewer must be vetted
    /// and active and must hold no other role in this escrow.
    pub fn reassign_reviewer(ctx: Context<ReassignReviewer>, new_reviewer: Pubkey) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        // Two different people must agree; one wallet holding both roles is not enough.
        require!(ctx.accounts.admin.key() != ctx.accounts.school.key(), BonaError::Unauthorized);
        require!(!escrow.cancelled, BonaError::EscrowCancelled);
        require!(ctx.accounts.new_reviewer_record.active, BonaError::ReviewerInactive);
        for state in [ctx.accounts.tranche0.state, ctx.accounts.tranche1.state] {
            require!(
                matches!(
                    state,
                    TrancheState::Pending
                        | TrancheState::Claimed
                        | TrancheState::Released
                        | TrancheState::Refunded
                ),
                BonaError::ReviewerChangeBlocked
            );
        }
        require!(
            new_reviewer != Pubkey::default()
                && new_reviewer != escrow.funder
                && new_reviewer != escrow.contractor
                && new_reviewer != escrow.school
                && new_reviewer != escrow.payees[0]
                && new_reviewer != escrow.payees[1]
                && new_reviewer != escrow.match_authority
                && new_reviewer != escrow.dispute_authority
                && (escrow.funder_challenger == Pubkey::default() || new_reviewer != escrow.funder_challenger),
            BonaError::InvalidRoleAssignment
        );

        let old_reviewer = escrow.reviewer;
        let escrow = &mut ctx.accounts.escrow;
        escrow.reviewer = new_reviewer;
        emit!(ReviewerReassigned { escrow: escrow.key(), old_reviewer, new_reviewer });
        Ok(())
    }

    /// Anyone may return tokens the escrow does not owe to anyone: unsolicited, late or
    /// excess deposits. Sends `vault balance - amount still owed to unsettled tranches`
    /// to the funder. Money owed to a Pending/Claimed/Verified/Disputed tranche (or, before
    /// funding, the full agreed total) always stays. Nothing to sweep is a harmless no-op.
    pub fn sweep_surplus(ctx: Context<SweepSurplus>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        let owed = escrow.amount_owed()?;
        let surplus = ctx.accounts.vault.amount.saturating_sub(owed);
        if surplus == 0 {
            return Ok(());
        }
        pay_from_vault(
            escrow,
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.funder_ata.to_account_info(),
            surplus,
            ctx.accounts.mint.decimals,
        )?;
        emit!(SurplusSwept { escrow: escrow.key(), amount: surplus, caller: ctx.accounts.caller.key() });
        Ok(())
    }

    /// Anyone may return a tranche to the funder when:
    /// - it was never verified and its verification deadline passed, or
    /// - it is the completion tranche and the materials tranche was refunded, or
    /// - a dispute stayed unresolved past the dispute timeout.
    /// A verified tranche in its challenge window is never refundable this way.
    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let escrow = &ctx.accounts.escrow;
        require!(escrow.funded, BonaError::NotFunded);
        require!(!escrow.cancelled, BonaError::EscrowCancelled);

        let tranche = &ctx.accounts.tranche;
        let eligible = match tranche.state {
            TrancheState::Released | TrancheState::Refunded => return err!(BonaError::AlreadySettled),
            TrancheState::Pending | TrancheState::Claimed => {
                let expired = now >= tranche.verification_deadline;
                let blocked = if tranche.index == 1 {
                    match ctx.accounts.prior_tranche.as_ref() {
                        Some(prior) => {
                            require!(
                                prior.escrow == escrow.key() && prior.index == 0,
                                BonaError::InvalidTranche
                            );
                            prior.state == TrancheState::Refunded
                        }
                        None => false,
                    }
                } else {
                    false
                };
                expired || blocked
            }
            TrancheState::Disputed => {
                let timeout = tranche
                    .disputed_at
                    .checked_add(i64::from(escrow.dispute_seconds))
                    .ok_or(BonaError::ArithmeticOverflow)?;
                require!(now >= timeout, BonaError::DisputeTimeoutActive);
                true
            }
            TrancheState::Verified => false,
        };
        require!(eligible, BonaError::RefundNotEligible);

        let amount = tranche.amount;
        let index = tranche.index;
        pay_from_vault(
            escrow,
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.funder_ata.to_account_info(),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        let escrow_key = ctx.accounts.escrow.key();
        record_refund(&mut ctx.accounts.escrow, &mut ctx.accounts.tranche, now)?;
        emit!(TrancheRefunded { escrow: escrow_key, index, amount });
        Ok(())
    }
}

fn set_up_tranche(
    t: &mut Account<Tranche>,
    escrow: Pubkey,
    index: u8,
    amount: u64,
    verification_deadline: i64,
    milestone_hash: [u8; 32],
    bump: u8,
) {
    t.escrow = escrow;
    t.index = index;
    t.amount = amount;
    t.state = TrancheState::Pending;
    t.revision = 0;
    t.verification_deadline = verification_deadline;
    t.claimed_at = 0;
    t.verified_at = 0;
    t.challenge_until = 0;
    t.disputed_at = 0;
    t.settled_at = 0;
    t.milestone_hash = milestone_hash;
    t.evidence_hash = [0; 32];
    t.match_hash = [0; 32];
    t.review_hash = [0; 32];
    t.dispute_hash = [0; 32];
    t.resolution_hash = [0; 32];
    t.bump = bump;
}

fn record_refund(escrow: &mut Account<Escrow>, tranche: &mut Account<Tranche>, now: i64) -> Result<()> {
    let refunded = escrow
        .refunded_amount
        .checked_add(tranche.amount)
        .ok_or(BonaError::ArithmeticOverflow)?;
    let settled = refunded
        .checked_add(escrow.released_amount)
        .ok_or(BonaError::ArithmeticOverflow)?;
    require!(settled <= escrow.total_amount, BonaError::ArithmeticOverflow);
    escrow.refunded_amount = refunded;
    tranche.state = TrancheState::Refunded;
    tranche.settled_at = now;
    Ok(())
}

/// Moves tokens out of the vault, signed by the escrow account itself.
fn pay_from_vault<'info>(
    escrow: &Account<'info, Escrow>,
    vault: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    to: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    let bump = [escrow.bump];
    let seeds: &[&[u8]] = &[ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref(), &bump];
    let signer_seeds = &[seeds];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token::ID,
            TransferChecked { from: vault, mint, to, authority: escrow.to_account_info() },
            signer_seeds,
        ),
        amount,
        decimals,
    )
}

// ---------------------------------------------------------------- accounts

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut, address = ADMIN @ BonaError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Box<Account<'info, Config>>,
    pub mint: Box<Account<'info, Mint>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ BonaError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct SetReviewer<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ BonaError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + ReviewerRecord::INIT_SPACE,
        seeds = [REVIEWER_SEED, wallet.as_ref()],
        bump
    )]
    pub reviewer_record: Box<Account<'info, ReviewerRecord>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: CreateEscrowArgs)]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ BonaError::Unauthorized,
        has_one = mint @ BonaError::InvalidMint
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [REVIEWER_SEED, args.reviewer.as_ref()], bump = reviewer_record.bump)]
    pub reviewer_record: Box<Account<'info, ReviewerRecord>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [ESCROW_SEED, args.funder.as_ref(), args.case_hash.as_ref()],
        bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Tranche::INIT_SPACE,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[0u8]],
        bump
    )]
    pub tranche0: Box<Account<'info, Tranche>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Tranche::INIT_SPACE,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[1u8]],
        bump
    )]
    pub tranche1: Box<Account<'info, Tranche>>,
    /// `init_if_needed`: the vault address is predictable, so anyone could create it
    /// first to block this call. An existing one is still owned by the escrow, and only
    /// the escrow can move its tokens; any tokens already in it count as surplus.
    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ActivateFunding<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(address = escrow.mint @ BonaError::InvalidMint)]
    pub mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelUnfunded<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(address = escrow.mint @ BonaError::InvalidMint)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: only used as the owner of the refund token account; bound to the escrow.
    #[account(address = escrow.funder @ BonaError::Unauthorized)]
    pub funder: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = funder,
        associated_token::token_program = token_program
    )]
    pub funder_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimTranche<'info> {
    #[account(address = escrow.contractor @ BonaError::Unauthorized)]
    pub contractor: Signer<'info>,
    #[account(address = escrow.match_authority @ BonaError::Unauthorized)]
    pub match_authority: Signer<'info>,
    #[account(
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        has_one = escrow @ BonaError::InvalidTranche,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[tranche.index]],
        bump = tranche.bump
    )]
    pub tranche: Box<Account<'info, Tranche>>,
    /// Required for the completion tranche: the materials tranche.
    pub prior_tranche: Option<Box<Account<'info, Tranche>>>,
}

#[derive(Accounts)]
pub struct VerifyTranche<'info> {
    #[account(address = escrow.reviewer @ BonaError::ReviewerMismatch)]
    pub reviewer: Signer<'info>,
    #[account(seeds = [REVIEWER_SEED, reviewer.key().as_ref()], bump = reviewer_record.bump)]
    pub reviewer_record: Box<Account<'info, ReviewerRecord>>,
    #[account(
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        has_one = escrow @ BonaError::InvalidTranche,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[tranche.index]],
        bump = tranche.bump
    )]
    pub tranche: Box<Account<'info, Tranche>>,
}

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    pub challenger: Signer<'info>,
    #[account(
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        has_one = escrow @ BonaError::InvalidTranche,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[tranche.index]],
        bump = tranche.bump
    )]
    pub tranche: Box<Account<'info, Tranche>>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut, address = escrow.dispute_authority @ BonaError::Unauthorized)]
    pub dispute_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        has_one = escrow @ BonaError::InvalidTranche,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[tranche.index]],
        bump = tranche.bump
    )]
    pub tranche: Box<Account<'info, Tranche>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(address = escrow.mint @ BonaError::InvalidMint)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: owner of the refund token account; bound to the escrow.
    #[account(address = escrow.funder @ BonaError::Unauthorized)]
    pub funder: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = dispute_authority,
        associated_token::mint = mint,
        associated_token::authority = funder,
        associated_token::token_program = token_program
    )]
    pub funder_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseTranche<'info> {
    /// Anyone. Pays the network fee (and the payee's token account rent if needed).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        has_one = escrow @ BonaError::InvalidTranche,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[tranche.index]],
        bump = tranche.bump
    )]
    pub tranche: Box<Account<'info, Tranche>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(address = escrow.mint @ BonaError::InvalidMint)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: owner of the payout token account; must be this tranche's payee fixed in the
    /// escrow at creation, so no caller can redirect it.
    #[account(address = escrow.payee_for(tranche.index) @ BonaError::Unauthorized)]
    pub payee: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = payee,
        associated_token::token_program = token_program
    )]
    pub payee_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(new_reviewer: Pubkey)]
pub struct ReassignReviewer<'info> {
    /// The platform admin (config.admin). Signs together with the school.
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ BonaError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,
    /// This escrow's school. Signs together with the admin.
    #[account(address = escrow.school @ BonaError::Unauthorized)]
    pub school: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        has_one = escrow @ BonaError::InvalidTranche,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[0u8]],
        bump = tranche0.bump
    )]
    pub tranche0: Box<Account<'info, Tranche>>,
    #[account(
        has_one = escrow @ BonaError::InvalidTranche,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[1u8]],
        bump = tranche1.bump
    )]
    pub tranche1: Box<Account<'info, Tranche>>,
    #[account(seeds = [REVIEWER_SEED, new_reviewer.as_ref()], bump = new_reviewer_record.bump)]
    pub new_reviewer_record: Box<Account<'info, ReviewerRecord>>,
}

#[derive(Accounts)]
pub struct SweepSurplus<'info> {
    /// Anyone. Pays the network fee (and the funder's token account rent if needed).
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(address = escrow.mint @ BonaError::InvalidMint)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: owner of the refund token account; bound to the escrow.
    #[account(address = escrow.funder @ BonaError::Unauthorized)]
    pub funder: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = funder,
        associated_token::token_program = token_program
    )]
    pub funder_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.funder.as_ref(), escrow.case_hash.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        mut,
        has_one = escrow @ BonaError::InvalidTranche,
        seeds = [TRANCHE_SEED, escrow.key().as_ref(), &[tranche.index]],
        bump = tranche.bump
    )]
    pub tranche: Box<Account<'info, Tranche>>,
    /// Optional: the materials tranche, to show the completion tranche can never be claimed.
    pub prior_tranche: Option<Box<Account<'info, Tranche>>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(address = escrow.mint @ BonaError::InvalidMint)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: owner of the refund token account; bound to the escrow.
    #[account(address = escrow.funder @ BonaError::Unauthorized)]
    pub funder: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = mint,
        associated_token::authority = funder,
        associated_token::token_program = token_program
    )]
    pub funder_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
