//! BonaWork escrow rules, tested against the compiled program in LiteSVM.
//! The network clock is set directly, so a 24-hour window is tested in milliseconds.

use borsh::{BorshDeserialize, BorshSerialize};
use litesvm::LiteSVM;
use litesvm_token::{get_spl_account, CreateAssociatedTokenAccount, CreateMint, MintTo, Transfer};
use sha2::{Digest, Sha256};
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;
use spl_token_interface::state::Account as TokenAccount;

const PROGRAM_ID: &str = "5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY";
const TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA_PROGRAM: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM: &str = "11111111111111111111111111111111";

const T0: i64 = 1_800_000_000;
const MATERIALS: u64 = 200_000; // R2 000.00 at 2 decimals
const COMPLETION: u64 = 300_000; // R3 000.00
const CHALLENGE: u32 = 60;
const DISPUTE_TIMEOUT: u32 = 86_400;

fn addr(s: &str) -> Address {
    let v = bs58::decode(s).into_vec().unwrap();
    Address::new_from_array(v.try_into().unwrap())
}
fn program() -> Address {
    addr(PROGRAM_ID)
}
fn h(n: u8) -> [u8; 32] {
    [n; 32]
}
fn disc(name: &str) -> Vec<u8> {
    Sha256::digest(format!("global:{name}").as_bytes())[..8].to_vec()
}
fn data<T: BorshSerialize>(name: &str, args: &T) -> Vec<u8> {
    let mut d = disc(name);
    d.extend(borsh::to_vec(args).unwrap());
    d
}
fn mw(a: Address) -> AccountMeta {
    AccountMeta::new(a, false)
}
fn ro(a: Address) -> AccountMeta {
    AccountMeta::new_readonly(a, false)
}
fn mws(a: Address) -> AccountMeta {
    AccountMeta::new(a, true)
}
fn ros(a: Address) -> AccountMeta {
    AccountMeta::new_readonly(a, true)
}
fn ata(owner: &Address, mint: &Address) -> Address {
    Address::find_program_address(
        &[owner.as_ref(), addr(TOKEN_PROGRAM).as_ref(), mint.as_ref()],
        &addr(ATA_PROGRAM),
    )
    .0
}
fn pda(seeds: &[&[u8]]) -> Address {
    Address::find_program_address(seeds, &program()).0
}

// ---- mirrors of the on-chain types (Borsh layout) ----

#[derive(BorshSerialize)]
struct ConfigArgs {
    match_authority: [u8; 32],
    dispute_authority: [u8; 32],
    min_challenge_seconds: u32,
    max_challenge_seconds: u32,
}

#[derive(BorshSerialize, Clone)]
struct CreateEscrowArgs {
    case_hash: [u8; 32],
    terms_hash: [u8; 32],
    funder: [u8; 32],
    funder_challenger: [u8; 32],
    contractor: [u8; 32],
    school: [u8; 32],
    reviewer: [u8; 32],
    amounts: [u64; 2],
    milestone_hashes: [[u8; 32]; 2],
    funding_deadline: i64,
    verification_deadlines: [i64; 2],
    challenge_seconds: u32,
    dispute_seconds: u32,
}

#[derive(BorshDeserialize, Debug)]
struct EscrowState {
    _case_hash: [u8; 32],
    _terms_hash: [u8; 32],
    _funder: [u8; 32],
    _funder_challenger: [u8; 32],
    _contractor: [u8; 32],
    _school: [u8; 32],
    _reviewer: [u8; 32],
    _mint: [u8; 32],
    _match_authority: [u8; 32],
    _dispute_authority: [u8; 32],
    total_amount: u64,
    released_amount: u64,
    refunded_amount: u64,
    _funding_deadline: i64,
    _challenge_seconds: u32,
    _dispute_seconds: u32,
    funded: bool,
    cancelled: bool,
    _bump: u8,
}

#[derive(BorshDeserialize, Debug, PartialEq, Eq, Clone, Copy)]
enum TrancheState {
    Pending,
    Claimed,
    Verified,
    Disputed,
    Released,
    Refunded,
}

#[derive(BorshDeserialize, Debug)]
struct TrancheData {
    _escrow: [u8; 32],
    _index: u8,
    amount: u64,
    state: TrancheState,
    revision: u32,
    _verification_deadline: i64,
    _claimed_at: i64,
    _verified_at: i64,
    challenge_until: i64,
    _disputed_at: i64,
    _settled_at: i64,
    _milestone_hash: [u8; 32],
    evidence_hash: [u8; 32],
    match_hash: [u8; 32],
    _review_hash: [u8; 32],
    _dispute_hash: [u8; 32],
    _resolution_hash: [u8; 32],
    _bump: u8,
}

// ---- test world ----

struct World {
    svm: LiteSVM,
    fee: Keypair,
    admin: Keypair,
    matcher: Keypair,
    disputer: Keypair,
    funder: Keypair,
    contractor: Keypair,
    school: Keypair,
    reviewer: Keypair,
    stranger: Keypair,
    mint_auth: Keypair,
    mint: Address,
}

struct Case {
    escrow: Address,
    t0: Address,
    t1: Address,
    vault: Address,
    funder: Address,
}

fn send(svm: &mut LiteSVM, fee: &Keypair, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let mut all: Vec<&Keypair> = vec![fee];
    for s in signers {
        if s.pubkey() != fee.pubkey() {
            all.push(s);
        }
    }
    let tx = Transaction::new_signed_with_payer(ixs, Some(&fee.pubkey()), &all, svm.latest_blockhash());
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}\n{}", e.err, e.meta.logs.join("\n")))
}

fn expect_err(res: Result<(), String>, code: &str) {
    match res {
        Ok(()) => panic!("expected failure {code}, but it succeeded"),
        Err(logs) => assert!(logs.contains(code), "expected {code}, got:\n{logs}"),
    }
}

fn sol(svm: &mut LiteSVM, to: &Address) {
    svm.expire_blockhash();
    svm.airdrop(to, 1_000_000_000).unwrap();
}

fn set_time(svm: &mut LiteSVM, t: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = t;
    clock.slot += 1;
    svm.set_sysvar::<Clock>(&clock);
}

impl World {
    fn new() -> Self {
        let mut svm = LiteSVM::new();
        let so = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/deploy/bonawork.so");
        svm.add_program_from_file(program(), so).expect("build the program with --features localtest first");
        let fee = Keypair::new();
        let admin = Keypair::new_from_array([7; 32]);
        let mint_auth = Keypair::new();
        svm.airdrop(&fee.pubkey(), 100_000_000_000).unwrap();
        svm.airdrop(&admin.pubkey(), 10_000_000_000).unwrap();
        set_time(&mut svm, T0);
        let mint = CreateMint::new(&mut svm, &fee).authority(&mint_auth.pubkey()).decimals(2).send().unwrap();
        let mut world = World {
            svm,
            fee,
            admin,
            matcher: Keypair::new(),
            disputer: Keypair::new(),
            funder: Keypair::new(),
            contractor: Keypair::new(),
            school: Keypair::new(),
            reviewer: Keypair::new(),
            stranger: Keypair::new(),
            mint_auth,
            mint,
        };
        world.init_config(&Keypair::new_from_array([7; 32])).unwrap();
        let reviewer = world.reviewer.pubkey();
        world.set_reviewer(reviewer, true).unwrap();
        world
    }

    fn config(&self) -> Address {
        pda(&[b"config"])
    }

    fn init_config(&mut self, admin: &Keypair) -> Result<(), String> {
        let args = ConfigArgs {
            match_authority: self.matcher.pubkey().to_bytes(),
            dispute_authority: self.disputer.pubkey().to_bytes(),
            min_challenge_seconds: 60,
            max_challenge_seconds: 7 * 86_400,
        };
        let ix = Instruction {
            program_id: program(),
            accounts: vec![mws(admin.pubkey()), mw(self.config()), ro(self.mint), ro(addr(SYSTEM_PROGRAM))],
            data: data("initialize_config", &args),
        };
        send(&mut self.svm, &self.fee, &[ix], &[admin])
    }

    fn set_reviewer(&mut self, wallet: Address, active: bool) -> Result<(), String> {
        let ix = Instruction {
            program_id: program(),
            accounts: vec![
                mws(self.admin.pubkey()),
                ro(self.config()),
                mw(pda(&[b"reviewer", wallet.as_ref()])),
                ro(addr(SYSTEM_PROGRAM)),
            ],
            data: data("set_reviewer", &(wallet.to_bytes(), h(9), active)),
        };
        send(&mut self.svm, &self.fee, &[ix], &[&self.admin])
    }

    fn default_args(&self, case: u8) -> CreateEscrowArgs {
        CreateEscrowArgs {
            case_hash: h(case),
            terms_hash: h(2),
            funder: self.funder.pubkey().to_bytes(),
            funder_challenger: [0; 32],
            contractor: self.contractor.pubkey().to_bytes(),
            school: self.school.pubkey().to_bytes(),
            reviewer: self.reviewer.pubkey().to_bytes(),
            amounts: [MATERIALS, COMPLETION],
            milestone_hashes: [h(3), h(4)],
            funding_deadline: T0 + 3_600,
            verification_deadlines: [T0 + 7 * 86_400, T0 + 14 * 86_400],
            challenge_seconds: CHALLENGE,
            dispute_seconds: DISPUTE_TIMEOUT,
        }
    }

    fn case_for(&self, args: &CreateEscrowArgs) -> Case {
        let funder = Address::new_from_array(args.funder);
        let escrow = pda(&[b"escrow", funder.as_ref(), &args.case_hash]);
        Case {
            escrow,
            t0: pda(&[b"tranche", escrow.as_ref(), &[0]]),
            t1: pda(&[b"tranche", escrow.as_ref(), &[1]]),
            vault: ata(&escrow, &self.mint),
            funder,
        }
    }

    fn create(&mut self, args: &CreateEscrowArgs) -> Result<Case, String> {
        let c = self.case_for(args);
        let reviewer = Address::new_from_array(args.reviewer);
        let ix = Instruction {
            program_id: program(),
            accounts: vec![
                mws(self.admin.pubkey()),
                ro(self.config()),
                ro(pda(&[b"reviewer", reviewer.as_ref()])),
                mw(c.escrow),
                mw(c.t0),
                mw(c.t1),
                mw(c.vault),
                ro(self.mint),
                ro(addr(TOKEN_PROGRAM)),
                ro(addr(ATA_PROGRAM)),
                ro(addr(SYSTEM_PROGRAM)),
            ],
            data: data("create_escrow", args),
        };
        send(&mut self.svm, &self.fee, &[ix], &[&self.admin])?;
        Ok(c)
    }

    /// The funder's own wallet sends tokens into the vault (Pollar does this in the app).
    fn deposit(&mut self, c: &Case, amount: u64) {
        let funder_ata = ata(&self.funder.pubkey(), &self.mint);
        if self.svm.get_account(&funder_ata).is_none() {
            CreateAssociatedTokenAccount::new(&mut self.svm, &self.fee, &self.mint)
                .owner(&self.funder.pubkey())
                .send()
                .unwrap();
        }
        MintTo::new(&mut self.svm, &self.fee, &self.mint, &funder_ata, amount)
            .owner(&self.mint_auth)
            .send()
            .unwrap();
        self.svm.expire_blockhash();
        Transfer::new(&mut self.svm, &self.fee, &self.mint, &c.vault, amount)
            .source(&funder_ata)
            .owner(&self.funder)
            .send()
            .unwrap();
    }

    fn activate(&mut self, c: &Case) -> Result<(), String> {
        let ix = Instruction {
            program_id: program(),
            accounts: vec![mw(c.escrow), ro(c.vault), ro(self.mint), ro(addr(TOKEN_PROGRAM))],
            data: disc("activate_funding"),
        };
        send(&mut self.svm, &self.fee, &[ix], &[])
    }

    fn funded_case(&mut self, case: u8) -> Case {
        let args = self.default_args(case);
        let c = self.create(&args).unwrap();
        self.deposit(&c, MATERIALS + COMPLETION);
        self.activate(&c).unwrap();
        c
    }

    fn claim_as(&mut self, c: &Case, index: u8, contractor: &Keypair, matcher: &Keypair, rev: u32, evidence: u8) -> Result<(), String> {
        let tranche = if index == 0 { c.t0 } else { c.t1 };
        let prior = if index == 0 { program() } else { c.t0 };
        let ix = Instruction {
            program_id: program(),
            accounts: vec![ros(contractor.pubkey()), ros(matcher.pubkey()), ro(c.escrow), mw(tranche), ro(prior)],
            data: data("claim_tranche", &(rev, h(evidence), h(evidence + 100))),
        };
        send(&mut self.svm, &self.fee, &[ix], &[contractor, matcher])
    }

    fn claim(&mut self, c: &Case, index: u8, rev: u32, evidence: u8) -> Result<(), String> {
        let contractor = self.contractor.insecure_clone();
        let matcher = self.matcher.insecure_clone();
        self.claim_as(c, index, &contractor, &matcher, rev, evidence)
    }

    fn verify_as(&mut self, c: &Case, index: u8, reviewer: &Keypair, rev: u32, evidence: u8) -> Result<(), String> {
        let tranche = if index == 0 { c.t0 } else { c.t1 };
        let ix = Instruction {
            program_id: program(),
            accounts: vec![
                ros(reviewer.pubkey()),
                ro(pda(&[b"reviewer", reviewer.pubkey().as_ref()])),
                ro(c.escrow),
                mw(tranche),
            ],
            data: data("verify_tranche", &(rev, h(evidence), h(evidence + 100), h(50))),
        };
        send(&mut self.svm, &self.fee, &[ix], &[reviewer])
    }

    fn verify(&mut self, c: &Case, index: u8, rev: u32, evidence: u8) -> Result<(), String> {
        let reviewer = self.reviewer.insecure_clone();
        self.verify_as(c, index, &reviewer, rev, evidence)
    }

    fn dispute_as(&mut self, c: &Case, index: u8, who: &Keypair, rev: u32) -> Result<(), String> {
        let tranche = if index == 0 { c.t0 } else { c.t1 };
        let ix = Instruction {
            program_id: program(),
            accounts: vec![ros(who.pubkey()), ro(c.escrow), mw(tranche)],
            data: data("open_dispute", &(rev, h(60))),
        };
        send(&mut self.svm, &self.fee, &[ix], &[who])
    }

    fn resolve_as(&mut self, c: &Case, index: u8, who: &Keypair, refund: bool, new_deadline: i64) -> Result<(), String> {
        let tranche = if index == 0 { c.t0 } else { c.t1 };
        let outcome: u8 = if refund { 0 } else { 1 };
        let ix = Instruction {
            program_id: program(),
            accounts: vec![
                mws(who.pubkey()),
                mw(c.escrow),
                mw(tranche),
                mw(c.vault),
                ro(self.mint),
                ro(c.funder),
                mw(ata(&c.funder, &self.mint)),
                ro(addr(TOKEN_PROGRAM)),
                ro(addr(ATA_PROGRAM)),
                ro(addr(SYSTEM_PROGRAM)),
            ],
            data: data("resolve_dispute", &(outcome, h(70), new_deadline)),
        };
        sol(&mut self.svm, &who.pubkey());
        send(&mut self.svm, &self.fee, &[ix], &[who])
    }

    fn release_ix(&self, c: &Case, index: u8, caller: &Address, contractor: &Address, vault: &Address) -> Instruction {
        let tranche = if index == 0 { c.t0 } else { c.t1 };
        Instruction {
            program_id: program(),
            accounts: vec![
                mws(*caller),
                mw(c.escrow),
                mw(tranche),
                mw(*vault),
                ro(self.mint),
                ro(*contractor),
                mw(ata(contractor, &self.mint)),
                ro(addr(TOKEN_PROGRAM)),
                ro(addr(ATA_PROGRAM)),
                ro(addr(SYSTEM_PROGRAM)),
            ],
            data: disc("release_tranche"),
        }
    }

    /// Released by a stranger, to prove anyone can trigger it.
    fn release(&mut self, c: &Case, index: u8) -> Result<(), String> {
        let stranger = self.stranger.insecure_clone();
        sol(&mut self.svm, &stranger.pubkey());
        let ix = self.release_ix(c, index, &stranger.pubkey(), &self.contractor.pubkey(), &c.vault);
        send(&mut self.svm, &self.fee, &[ix], &[&stranger])
    }

    fn refund(&mut self, c: &Case, index: u8, with_prior: bool) -> Result<(), String> {
        let tranche = if index == 0 { c.t0 } else { c.t1 };
        let prior = if with_prior { c.t0 } else { program() };
        let ix = Instruction {
            program_id: program(),
            accounts: vec![
                mws(self.fee.pubkey()),
                mw(c.escrow),
                mw(tranche),
                ro(prior),
                mw(c.vault),
                ro(self.mint),
                ro(c.funder),
                mw(ata(&c.funder, &self.mint)),
                ro(addr(TOKEN_PROGRAM)),
                ro(addr(ATA_PROGRAM)),
                ro(addr(SYSTEM_PROGRAM)),
            ],
            data: disc("refund_expired"),
        };
        send(&mut self.svm, &self.fee, &[ix], &[])
    }

    fn tranche(&self, a: Address) -> TrancheData {
        let acc = self.svm.get_account(&a).unwrap();
        TrancheData::deserialize(&mut &acc.data[8..]).unwrap()
    }
    fn escrow(&self, a: Address) -> EscrowState {
        let acc = self.svm.get_account(&a).unwrap();
        EscrowState::deserialize(&mut &acc.data[8..]).unwrap()
    }
    fn balance(&self, token_account: Address) -> u64 {
        get_spl_account::<TokenAccount>(&self.svm, &token_account).map(|a| a.amount).unwrap_or(0)
    }
    fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }
    fn at(&mut self, t: i64) {
        set_time(&mut self.svm, t);
    }
}

// ================================================================ tests

#[test]
fn t01_config_only_by_admin_and_only_once() {
    let mut w = World::new();
    expect_err(w.init_config(&Keypair::new_from_array([7; 32])), "already in use");
    // A fresh chain: a random wallet cannot create the config.
    let mut fresh = LiteSVM::new();
    fresh
        .add_program_from_file(program(), concat!(env!("CARGO_MANIFEST_DIR"), "/../target/deploy/bonawork.so"))
        .unwrap();
    let intruder = Keypair::new();
    fresh.airdrop(&intruder.pubkey(), 1_000_000_000).unwrap();
    let fresh_mint = CreateMint::new(&mut fresh, &intruder).decimals(2).send().unwrap();
    let ix = Instruction {
        program_id: program(),
        accounts: vec![mws(intruder.pubkey()), mw(pda(&[b"config"])), ro(fresh_mint), ro(addr(SYSTEM_PROGRAM))],
        data: data(
            "initialize_config",
            &ConfigArgs { match_authority: h(1), dispute_authority: h(2), min_challenge_seconds: 60, max_challenge_seconds: 600 },
        ),
    };
    expect_err(send(&mut fresh, &intruder, &[ix], &[]), "Unauthorized");
}

#[test]
fn t02_create_escrow_fixes_terms() {
    let mut w = World::new();
    let args = w.default_args(1);
    let c = w.create(&args).unwrap();
    let e = w.escrow(c.escrow);
    assert_eq!(e.total_amount, MATERIALS + COMPLETION);
    assert!(!e.funded && !e.cancelled);
    assert_eq!(w.tranche(c.t0).amount, MATERIALS);
    assert_eq!(w.tranche(c.t1).amount, COMPLETION);
    assert_eq!(w.tranche(c.t0).state, TrancheState::Pending);
    let vault = get_spl_account::<TokenAccount>(&w.svm, &c.vault).unwrap();
    assert_eq!(vault.owner, c.escrow, "the vault belongs to the escrow, not to a person");
}

#[test]
fn t03_bad_terms_rejected() {
    let mut w = World::new();
    let mut a = w.default_args(1);
    a.contractor = a.funder;
    expect_err(w.create(&a).map(|_| ()), "InvalidRoleAssignment");

    let mut a = w.default_args(1);
    a.school = a.reviewer;
    expect_err(w.create(&a).map(|_| ()), "InvalidRoleAssignment");

    let mut a = w.default_args(1);
    a.contractor = w.matcher.pubkey().to_bytes();
    expect_err(w.create(&a).map(|_| ()), "InvalidRoleAssignment");

    let mut a = w.default_args(1);
    a.amounts = [0, COMPLETION];
    expect_err(w.create(&a).map(|_| ()), "InvalidAmount");

    let mut a = w.default_args(1);
    a.amounts = [u64::MAX, 1];
    expect_err(w.create(&a).map(|_| ()), "ArithmeticOverflow");

    let mut a = w.default_args(1);
    a.funding_deadline = T0 - 1;
    expect_err(w.create(&a).map(|_| ()), "InvalidDeadline");

    let mut a = w.default_args(1);
    a.verification_deadlines = [T0 + 9_000, T0 + 100];
    expect_err(w.create(&a).map(|_| ()), "InvalidDeadline");

    let mut a = w.default_args(1);
    a.challenge_seconds = 10;
    expect_err(w.create(&a).map(|_| ()), "InvalidChallengeDuration");
}

#[test]
fn t04_inactive_reviewer_cannot_be_assigned() {
    let mut w = World::new();
    let reviewer = w.reviewer.pubkey();
    w.set_reviewer(reviewer, false).unwrap();
    let a = w.default_args(1);
    expect_err(w.create(&a).map(|_| ()), "ReviewerInactive");
}

#[test]
fn t05_part_funding_cannot_activate() {
    let mut w = World::new();
    let a = w.default_args(1);
    let c = w.create(&a).unwrap();
    w.deposit(&c, MATERIALS);
    expect_err(w.activate(&c), "InsufficientFunding");
}

#[test]
fn t06_double_activation_and_extra_tokens() {
    let mut w = World::new();
    let c = w.funded_case(1);
    expect_err(w.activate(&c), "AlreadyFunded");
    w.deposit(&c, 12_345);
    assert_eq!(w.escrow(c.escrow).total_amount, MATERIALS + COMPLETION, "extra tokens add no obligations");
}

#[test]
fn t07_wrong_contractor_cannot_claim() {
    let mut w = World::new();
    let c = w.funded_case(1);
    let stranger = w.stranger.insecure_clone();
    let matcher = w.matcher.insecure_clone();
    expect_err(w.claim_as(&c, 0, &stranger, &matcher, 0, 10), "Unauthorized");
}

#[test]
fn t08_claim_needs_the_match_key() {
    let mut w = World::new();
    let c = w.funded_case(1);
    let contractor = w.contractor.insecure_clone();
    let stranger = w.stranger.insecure_clone();
    expect_err(w.claim_as(&c, 0, &contractor, &stranger, 0, 10), "Unauthorized");
}

#[test]
fn t09_completion_waits_for_materials() {
    let mut w = World::new();
    let c = w.funded_case(1);
    expect_err(w.claim(&c, 1, 0, 20), "PreviousTrancheNotReleased");
    // Unfunded escrows cannot be claimed at all.
    let a = w.default_args(2);
    let unfunded = w.create(&a).unwrap();
    expect_err(w.claim(&unfunded, 0, 0, 10), "NotFunded");
}

#[test]
fn t10_only_the_assigned_active_reviewer() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    // A second vetted reviewer who is not assigned to this repair.
    let other = Keypair::new();
    w.set_reviewer(other.pubkey(), true).unwrap();
    expect_err(w.verify_as(&c, 0, &other, 1, 10), "ReviewerMismatch");
    // The school cannot verify either (it has no reviewer record, and is not the assigned reviewer).
    let school = w.school.insecure_clone();
    assert!(w.verify_as(&c, 0, &school, 1, 10).is_err());
    // The assigned reviewer, once switched off, cannot verify.
    let reviewer = w.reviewer.pubkey();
    w.set_reviewer(reviewer, false).unwrap();
    expect_err(w.verify(&c, 0, 1, 10), "ReviewerInactive");
}

#[test]
fn t11_reviewer_approves_only_the_evidence_they_saw() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap(); // revision 1
    w.claim(&c, 0, 1, 11).unwrap(); // contractor changes the evidence: revision 2
    expect_err(w.verify(&c, 0, 1, 10), "StaleRevision");
    expect_err(w.verify(&c, 0, 2, 10), "EvidenceMismatch");
    w.verify(&c, 0, 2, 11).unwrap();
}

#[test]
fn t12_reviewer_signs_without_holding_sol() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    assert_eq!(w.svm.get_account(&w.reviewer.pubkey()).map(|a| a.lamports).unwrap_or(0), 0);
    w.verify(&c, 0, 1, 10).unwrap();
    let t = w.tranche(c.t0);
    assert_eq!(t.state, TrancheState::Verified);
    assert_eq!(t.challenge_until, T0 + i64::from(CHALLENGE));
    assert_eq!(w.svm.get_account(&w.reviewer.pubkey()).map(|a| a.lamports).unwrap_or(0), 0, "the fee payer paid");
}

#[test]
fn t13_verified_claim_is_locked() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    expect_err(w.claim(&c, 0, 1, 99), "InvalidState");
    let t = w.tranche(c.t0);
    assert_eq!(t.evidence_hash, h(10));
    assert_eq!(t.match_hash, h(110));
}

#[test]
fn t14_no_release_before_verification() {
    let mut w = World::new();
    let c = w.funded_case(1);
    expect_err(w.release(&c, 0), "InvalidState");
    w.claim(&c, 0, 0, 10).unwrap();
    expect_err(w.release(&c, 0), "InvalidState");
}

#[test]
fn t15_challenge_window_edge() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    let until = w.tranche(c.t0).challenge_until;
    w.at(until - 1);
    expect_err(w.release(&c, 0), "ChallengeWindowActive");
    w.at(until);
    w.release(&c, 0).unwrap();
}

#[test]
fn t16_anyone_can_release_but_only_to_the_contractor() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    let until = w.tranche(c.t0).challenge_until;
    w.at(until);
    let contractor_ata = ata(&w.contractor.pubkey(), &w.mint);
    assert!(w.svm.get_account(&contractor_ata).is_none(), "contractor never opened a token account");
    w.release(&c, 0).unwrap();
    assert_eq!(w.balance(contractor_ata), MATERIALS);
    assert_eq!(w.balance(c.vault), COMPLETION);
    assert_eq!(w.balance(ata(&w.stranger.pubkey(), &w.mint)), 0);
    assert_eq!(w.tranche(c.t0).state, TrancheState::Released);
}

#[test]
fn t17_swapped_accounts_rejected() {
    let mut w = World::new();
    let c = w.funded_case(1);
    let other = w.funded_case(2);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    let until = w.tranche(c.t0).challenge_until;
    w.at(until);
    let stranger = w.stranger.insecure_clone();
    sol(&mut w.svm, &stranger.pubkey());
    // Payout redirected to the stranger.
    let ix = w.release_ix(&c, 0, &stranger.pubkey(), &stranger.pubkey(), &c.vault);
    assert!(send(&mut w.svm, &w.fee, &[ix], &[&stranger]).is_err());
    // Paid out of another escrow's vault.
    let ix = w.release_ix(&c, 0, &stranger.pubkey(), &w.contractor.pubkey(), &other.vault);
    assert!(send(&mut w.svm, &w.fee, &[ix], &[&stranger]).is_err());
    // A tranche from another escrow.
    let mut ix = w.release_ix(&c, 0, &stranger.pubkey(), &w.contractor.pubkey(), &c.vault);
    ix.accounts[2] = AccountMeta::new(other.t0, false);
    assert!(send(&mut w.svm, &w.fee, &[ix], &[&stranger]).is_err());
    assert_eq!(w.balance(c.vault), MATERIALS + COMPLETION);
    assert_eq!(w.balance(other.vault), MATERIALS + COMPLETION);
}

#[test]
fn t18_no_double_payout() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    let until = w.tranche(c.t0).challenge_until;
    w.at(until);
    w.release(&c, 0).unwrap();
    expect_err(w.release(&c, 0), "AlreadySettled");
    assert_eq!(w.balance(ata(&w.contractor.pubkey(), &w.mint)), MATERIALS);
}

#[test]
fn t19_disputes_freeze_only_in_window_and_only_by_school() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    let stranger = w.stranger.insecure_clone();
    let funder = w.funder.insecure_clone();
    let school = w.school.insecure_clone();
    expect_err(w.dispute_as(&c, 0, &stranger, 1), "Unauthorized");
    expect_err(w.dispute_as(&c, 0, &funder, 1), "Unauthorized"); // funder chose no challenge wallet
    w.dispute_as(&c, 0, &school, 1).unwrap();
    assert_eq!(w.tranche(c.t0).state, TrancheState::Disputed);
    let until = w.tranche(c.t0).challenge_until;
    w.at(until + 10);
    expect_err(w.release(&c, 0), "InvalidState");

    // Late disputes fail.
    let c2 = w.funded_case(2);
    w.claim(&c2, 0, 0, 10).unwrap();
    w.verify(&c2, 0, 1, 10).unwrap();
    let until2 = w.tranche(c2.t0).challenge_until;
    w.at(until2);
    expect_err(w.dispute_as(&c2, 0, &school, 1), "ChallengeWindowClosed");
}

#[test]
fn t19b_funder_may_opt_in_to_disputes() {
    let mut w = World::new();
    let challenger = Keypair::new();
    let mut a = w.default_args(1);
    a.funder_challenger = challenger.pubkey().to_bytes();
    let c = w.create(&a).unwrap();
    w.deposit(&c, MATERIALS + COMPLETION);
    w.activate(&c).unwrap();
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    w.dispute_as(&c, 0, &challenger, 1).unwrap();
    assert_eq!(w.tranche(c.t0).state, TrancheState::Disputed);
}

#[test]
fn t20_dispute_outcomes_never_force_a_release() {
    let mut w = World::new();
    let school = w.school.insecure_clone();
    let disputer = w.disputer.insecure_clone();
    let stranger = w.stranger.insecure_clone();

    // Refund outcome.
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    w.dispute_as(&c, 0, &school, 1).unwrap();
    expect_err(w.resolve_as(&c, 0, &stranger, true, 0), "Unauthorized");
    w.resolve_as(&c, 0, &disputer, true, 0).unwrap();
    assert_eq!(w.tranche(c.t0).state, TrancheState::Refunded);
    assert_eq!(w.balance(ata(&c.funder, &w.mint)), MATERIALS);
    assert_eq!(w.escrow(c.escrow).refunded_amount, MATERIALS);

    // Re-review outcome: back to Claimed, a fresh signature is needed.
    let c2 = w.funded_case(2);
    w.claim(&c2, 0, 0, 10).unwrap();
    w.verify(&c2, 0, 1, 10).unwrap();
    w.dispute_as(&c2, 0, &school, 1).unwrap();
    let deadline = w.now() + 86_400;
    w.resolve_as(&c2, 0, &disputer, false, deadline).unwrap();
    let t = w.tranche(c2.t0);
    assert_eq!(t.state, TrancheState::Claimed);
    assert_eq!(t.revision, 2);
    expect_err(w.release(&c2, 0), "InvalidState");
    w.verify(&c2, 0, 2, 10).unwrap();
}

#[test]
fn t21_deadline_refunds() {
    let mut w = World::new();
    // Never verified: refundable after the deadline, not before.
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    expect_err(w.refund(&c, 0, false), "RefundNotEligible");
    w.at(T0 + 7 * 86_400);
    w.refund(&c, 0, false).unwrap();
    assert_eq!(w.balance(ata(&c.funder, &w.mint)), MATERIALS);
    // The completion tranche can now never be claimed, so it is refundable at once.
    w.refund(&c, 1, true).unwrap();
    assert_eq!(w.balance(ata(&c.funder, &w.mint)), MATERIALS + COMPLETION);
    assert_eq!(w.balance(c.vault), 0);

    // Verified money stays protected even after the verification deadline.
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    w.at(T0 + 30 * 86_400);
    expect_err(w.refund(&c, 0, false), "RefundNotEligible");
    w.release(&c, 0).unwrap();

    // An unresolved dispute can be refunded only after the dispute timeout.
    let mut w = World::new();
    let school = w.school.insecure_clone();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    w.dispute_as(&c, 0, &school, 1).unwrap();
    expect_err(w.refund(&c, 0, false), "DisputeTimeoutActive");
    w.at(T0 + i64::from(DISPUTE_TIMEOUT));
    w.refund(&c, 0, false).unwrap();
    assert_eq!(w.tranche(c.t0).state, TrancheState::Refunded);
}

#[test]
fn t22_full_journey_totals_and_cancel() {
    let mut w = World::new();
    let c = w.funded_case(1);
    w.claim(&c, 0, 0, 10).unwrap();
    w.verify(&c, 0, 1, 10).unwrap();
    let until = w.tranche(c.t0).challenge_until;
    w.at(until);
    w.release(&c, 0).unwrap();
    w.claim(&c, 1, 0, 20).unwrap();
    w.verify(&c, 1, 1, 20).unwrap();
    let until = w.tranche(c.t1).challenge_until;
    w.at(until);
    w.release(&c, 1).unwrap();
    let e = w.escrow(c.escrow);
    assert_eq!(e.released_amount, MATERIALS + COMPLETION);
    assert_eq!(e.refunded_amount, 0);
    assert_eq!(w.balance(c.vault), 0);
    assert_eq!(w.balance(ata(&w.contractor.pubkey(), &w.mint)), MATERIALS + COMPLETION);
    assert!(e.funded);

    // An escrow that missed its funding deadline returns what it got.
    let a = w.default_args(9);
    w.at(T0);
    let c = w.create(&a).unwrap();
    w.deposit(&c, 1_000);
    let ix = Instruction {
        program_id: program(),
        accounts: vec![
            mws(w.fee.pubkey()),
            mw(c.escrow),
            mw(c.vault),
            ro(w.mint),
            ro(c.funder),
            mw(ata(&c.funder, &w.mint)),
            ro(addr(TOKEN_PROGRAM)),
            ro(addr(ATA_PROGRAM)),
            ro(addr(SYSTEM_PROGRAM)),
        ],
        data: disc("cancel_unfunded"),
    };
    expect_err(send(&mut w.svm, &w.fee, &[ix.clone()], &[]), "FundingStillOpen");
    w.at(T0 + 3_600);
    let before = w.balance(ata(&c.funder, &w.mint));
    send(&mut w.svm, &w.fee, &[ix], &[]).unwrap();
    assert_eq!(w.balance(ata(&c.funder, &w.mint)), before + 1_000);
    assert!(w.escrow(c.escrow).cancelled);
    expect_err(w.activate(&c), "EscrowCancelled");
}
