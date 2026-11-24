use anchor_lang::prelude::*;

#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub case_hash: [u8; 32],
    pub total_amount: u64,
}

#[event]
pub struct EscrowFunded {
    pub escrow: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow: Pubkey,
    pub returned: u64,
}

#[event]
pub struct TrancheClaimed {
    pub escrow: Pubkey,
    pub index: u8,
    pub revision: u32,
    pub evidence_hash: [u8; 32],
    pub match_hash: [u8; 32],
}

#[event]
pub struct TrancheVerified {
    pub escrow: Pubkey,
    pub index: u8,
    pub revision: u32,
    pub reviewer: Pubkey,
    pub challenge_until: i64,
}

#[event]
pub struct DisputeOpened {
    pub escrow: Pubkey,
    pub index: u8,
    pub by: Pubkey,
    pub reason_hash: [u8; 32],
}

#[event]
pub struct DisputeResolved {
    pub escrow: Pubkey,
    pub index: u8,
    pub refunded: bool,
    pub resolution_hash: [u8; 32],
}

#[event]
pub struct TrancheReleased {
    pub escrow: Pubkey,
    pub index: u8,
    pub amount: u64,
    pub contractor: Pubkey,
    pub caller: Pubkey,
}

#[event]
pub struct TrancheRefunded {
    pub escrow: Pubkey,
    pub index: u8,
    pub amount: u64,
}
