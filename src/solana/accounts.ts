/**
 * Decoders (and encoders, for tests and fixtures) for BonaWork program accounts.
 * Layout: 8-byte discriminator (sha256("account:<Name>")[0..8]) + Borsh fields in
 * the order declared in programs/bonawork/src/state.rs.
 */
import type { Address } from "@solana/kit";

import { BorshReader, BorshWriter, bytesEqual, type Bytes32 } from "./borsh";
import { ACCOUNT_DISCRIMINATORS } from "./program";

export enum TrancheState {
  Pending = 0,
  Claimed = 1,
  Verified = 2,
  Disputed = 3,
  Released = 4,
  Refunded = 5,
}

export type ConfigAccount = {
  admin: Address;
  mint: Address;
  matchAuthority: Address;
  disputeAuthority: Address;
  minChallengeSeconds: number;
  maxChallengeSeconds: number;
  paused: boolean;
  bump: number;
};

export type ReviewerRecordAccount = {
  wallet: Address;
  aliasHash: Bytes32;
  active: boolean;
  bump: number;
};

export type EscrowAccount = {
  caseHash: Bytes32;
  termsHash: Bytes32;
  funder: Address;
  funderChallenger: Address;
  contractor: Address;
  school: Address;
  reviewer: Address;
  /** Who each tranche pays on release, fixed at creation: typically [supplier, contractor]. */
  payees: [Address, Address];
  mint: Address;
  matchAuthority: Address;
  disputeAuthority: Address;
  totalAmount: bigint;
  releasedAmount: bigint;
  refundedAmount: bigint;
  fundingDeadline: bigint;
  challengeSeconds: number;
  disputeSeconds: number;
  funded: boolean;
  cancelled: boolean;
  bump: number;
};

export type TrancheAccount = {
  escrow: Address;
  index: number;
  amount: bigint;
  state: TrancheState;
  revision: number;
  verificationDeadline: bigint;
  claimedAt: bigint;
  verifiedAt: bigint;
  challengeUntil: bigint;
  disputedAt: bigint;
  settledAt: bigint;
  milestoneHash: Bytes32;
  evidenceHash: Bytes32;
  matchHash: Bytes32;
  reviewHash: Bytes32;
  disputeHash: Bytes32;
  resolutionHash: Bytes32;
  bump: number;
};

type AccountName = keyof typeof ACCOUNT_DISCRIMINATORS;

function reader(name: AccountName, data: ArrayLike<number>): BorshReader {
  const bytes = Uint8Array.from(data);
  if (
    bytes.length < 8 ||
    !bytesEqual(bytes.subarray(0, 8), ACCOUNT_DISCRIMINATORS[name])
  ) {
    throw new Error(`Not a BonaWork ${name} account`);
  }
  return new BorshReader(bytes.subarray(8));
}

const writer = (name: AccountName) => new BorshWriter().raw(ACCOUNT_DISCRIMINATORS[name]);

// Decoders ignore trailing bytes: Anchor may allocate an account larger than its fields.

export function decodeConfig(data: ArrayLike<number>): ConfigAccount {
  const r = reader("Config", data);
  return {
    admin: r.address(),
    mint: r.address(),
    matchAuthority: r.address(),
    disputeAuthority: r.address(),
    minChallengeSeconds: r.u32(),
    maxChallengeSeconds: r.u32(),
    paused: r.bool(),
    bump: r.u8(),
  };
}

export function encodeConfig(a: ConfigAccount): Uint8Array {
  return writer("Config")
    .address(a.admin)
    .address(a.mint)
    .address(a.matchAuthority)
    .address(a.disputeAuthority)
    .u32(a.minChallengeSeconds)
    .u32(a.maxChallengeSeconds)
    .bool(a.paused)
    .u8(a.bump)
    .toBytes();
}

export function decodeReviewerRecord(data: ArrayLike<number>): ReviewerRecordAccount {
  const r = reader("ReviewerRecord", data);
  return { wallet: r.address(), aliasHash: r.bytes32(), active: r.bool(), bump: r.u8() };
}

export function encodeReviewerRecord(a: ReviewerRecordAccount): Uint8Array {
  return writer("ReviewerRecord")
    .address(a.wallet)
    .bytes32(a.aliasHash)
    .bool(a.active)
    .u8(a.bump)
    .toBytes();
}

export function decodeEscrow(data: ArrayLike<number>): EscrowAccount {
  const r = reader("Escrow", data);
  return {
    caseHash: r.bytes32(),
    termsHash: r.bytes32(),
    funder: r.address(),
    funderChallenger: r.address(),
    contractor: r.address(),
    school: r.address(),
    reviewer: r.address(),
    payees: [r.address(), r.address()],
    mint: r.address(),
    matchAuthority: r.address(),
    disputeAuthority: r.address(),
    totalAmount: r.u64(),
    releasedAmount: r.u64(),
    refundedAmount: r.u64(),
    fundingDeadline: r.i64(),
    challengeSeconds: r.u32(),
    disputeSeconds: r.u32(),
    funded: r.bool(),
    cancelled: r.bool(),
    bump: r.u8(),
  };
}

export function encodeEscrow(a: EscrowAccount): Uint8Array {
  return writer("Escrow")
    .bytes32(a.caseHash)
    .bytes32(a.termsHash)
    .address(a.funder)
    .address(a.funderChallenger)
    .address(a.contractor)
    .address(a.school)
    .address(a.reviewer)
    .address(a.payees[0])
    .address(a.payees[1])
    .address(a.mint)
    .address(a.matchAuthority)
    .address(a.disputeAuthority)
    .u64(a.totalAmount)
    .u64(a.releasedAmount)
    .u64(a.refundedAmount)
    .i64(a.fundingDeadline)
    .u32(a.challengeSeconds)
    .u32(a.disputeSeconds)
    .bool(a.funded)
    .bool(a.cancelled)
    .u8(a.bump)
    .toBytes();
}

export function decodeTranche(data: ArrayLike<number>): TrancheAccount {
  const r = reader("Tranche", data);
  const escrow = r.address();
  const index = r.u8();
  const amount = r.u64();
  const state = r.u8();
  if (!(state in TrancheState)) throw new RangeError(`unknown tranche state ${state}`);
  return {
    escrow,
    index,
    amount,
    state: state as TrancheState,
    revision: r.u32(),
    verificationDeadline: r.i64(),
    claimedAt: r.i64(),
    verifiedAt: r.i64(),
    challengeUntil: r.i64(),
    disputedAt: r.i64(),
    settledAt: r.i64(),
    milestoneHash: r.bytes32(),
    evidenceHash: r.bytes32(),
    matchHash: r.bytes32(),
    reviewHash: r.bytes32(),
    disputeHash: r.bytes32(),
    resolutionHash: r.bytes32(),
    bump: r.u8(),
  };
}

export function encodeTranche(a: TrancheAccount): Uint8Array {
  return writer("Tranche")
    .address(a.escrow)
    .u8(a.index)
    .u64(a.amount)
    .u8(a.state)
    .u32(a.revision)
    .i64(a.verificationDeadline)
    .i64(a.claimedAt)
    .i64(a.verifiedAt)
    .i64(a.challengeUntil)
    .i64(a.disputedAt)
    .i64(a.settledAt)
    .bytes32(a.milestoneHash)
    .bytes32(a.evidenceHash)
    .bytes32(a.matchHash)
    .bytes32(a.reviewHash)
    .bytes32(a.disputeHash)
    .bytes32(a.resolutionHash)
    .u8(a.bump)
    .toBytes();
}

/** Account sizes including the discriminator (8 + INIT_SPACE). */
export const ACCOUNT_SIZES = {
  Config: 146,
  ReviewerRecord: 74,
  Escrow: 435,
  Tranche: 295,
} as const;
