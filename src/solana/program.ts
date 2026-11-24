/**
 * Client for the BonaWork Anchor program (Solana devnet).
 *
 * Mirrors programs/bonawork/src/lib.rs and the account orders proven in
 * tests-litesvm/tests/escrow.rs. Instruction data is the 8-byte Anchor
 * discriminator (sha256("global:<name>")[0..8]) followed by Borsh args.
 */
import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit";

import { BorshReader, BorshWriter, bytesEqual, type Bytes32 } from "./borsh";

// ------------------------------------------------------------------ constants

export const BONAWORK_PROGRAM_ADDRESS = address(
  "5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY",
);
export const TOKEN_PROGRAM_ADDRESS = address(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
export const COMPUTE_BUDGET_PROGRAM_ADDRESS = address(
  "ComputeBudget111111111111111111111111111111",
);

/** All-zero public key. Used by the program for "no funder challenge wallet". */
export const DEFAULT_PUBKEY = SYSTEM_PROGRAM_ADDRESS;

/** The demo rand mint has 2 decimals: 300000 base units = R3 000.00. */
export const MINT_DECIMALS = 2;
export const TRANCHE_COUNT = 2;

const utf8 = new TextEncoder();
export const SEEDS = {
  config: utf8.encode("config"),
  reviewer: utf8.encode("reviewer"),
  escrow: utf8.encode("escrow"),
  tranche: utf8.encode("tranche"),
} as const;

// ------------------------------------------------------------- discriminators

export const INSTRUCTION_NAMES = [
  "initialize_config",
  "set_paused",
  "set_reviewer",
  "create_escrow",
  "activate_funding",
  "cancel_unfunded",
  "claim_tranche",
  "verify_tranche",
  "open_dispute",
  "resolve_dispute",
  "release_tranche",
  "refund_expired",
] as const;
export type BonaInstructionName = (typeof INSTRUCTION_NAMES)[number];

/** sha256("global:<name>")[0..8], precomputed so this module needs no hashing at runtime. */
export const INSTRUCTION_DISCRIMINATORS: Record<BonaInstructionName, Uint8Array> = {
  initialize_config: Uint8Array.of(208, 127, 21, 1, 194, 190, 196, 70),
  set_paused: Uint8Array.of(91, 60, 125, 192, 176, 225, 166, 218),
  set_reviewer: Uint8Array.of(255, 174, 164, 9, 160, 26, 230, 17),
  create_escrow: Uint8Array.of(253, 215, 165, 116, 36, 108, 68, 80),
  activate_funding: Uint8Array.of(94, 45, 112, 118, 232, 251, 174, 192),
  cancel_unfunded: Uint8Array.of(7, 11, 92, 226, 201, 56, 156, 158),
  claim_tranche: Uint8Array.of(45, 125, 67, 159, 88, 225, 29, 224),
  verify_tranche: Uint8Array.of(99, 36, 66, 134, 18, 188, 243, 78),
  open_dispute: Uint8Array.of(137, 25, 99, 119, 23, 223, 161, 42),
  resolve_dispute: Uint8Array.of(231, 6, 202, 6, 96, 103, 12, 230),
  release_tranche: Uint8Array.of(156, 137, 159, 5, 80, 38, 133, 227),
  refund_expired: Uint8Array.of(118, 153, 164, 244, 40, 128, 242, 250),
};

/** sha256("account:<StructName>")[0..8]. */
export const ACCOUNT_DISCRIMINATORS = {
  Config: Uint8Array.of(155, 12, 170, 224, 30, 250, 204, 130),
  ReviewerRecord: Uint8Array.of(220, 234, 48, 115, 1, 68, 15, 177),
  Escrow: Uint8Array.of(31, 213, 123, 187, 186, 22, 218, 155),
  Tranche: Uint8Array.of(58, 171, 37, 93, 206, 204, 41, 22),
} as const;

// ----------------------------------------------------------------------- PDAs

const addressBytes = (a: Address) => getAddressEncoder().encode(a);

async function pda(seeds: Uint8Array[]): Promise<Address> {
  const [found] = await getProgramDerivedAddress({
    programAddress: BONAWORK_PROGRAM_ADDRESS,
    seeds,
  });
  return found;
}

export function findConfigPda(): Promise<Address> {
  return pda([SEEDS.config]);
}

export function findReviewerPda(wallet: Address): Promise<Address> {
  return pda([SEEDS.reviewer, Uint8Array.from(addressBytes(wallet))]);
}

export async function findEscrowPda(
  funder: Address,
  caseHash: Bytes32,
): Promise<Address> {
  assert32(caseHash, "caseHash");
  return pda([
    SEEDS.escrow,
    Uint8Array.from(addressBytes(funder)),
    Uint8Array.from(caseHash),
  ]);
}

export async function findTranchePda(escrow: Address, index: number): Promise<Address> {
  if (index !== 0 && index !== 1)
    throw new RangeError(`tranche index must be 0 or 1, got ${index}`);
  return pda([
    SEEDS.tranche,
    Uint8Array.from(addressBytes(escrow)),
    Uint8Array.of(index),
  ]);
}

/** The canonical associated token account for classic SPL Token. */
export async function findAssociatedTokenAddress(
  owner: Address,
  mint: Address,
): Promise<Address> {
  const [found] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [addressBytes(owner), addressBytes(TOKEN_PROGRAM_ADDRESS), addressBytes(mint)],
  });
  return found;
}

/** The escrow's vault: the escrow PDA's associated token account. */
export function findVaultAddress(escrow: Address, mint: Address): Promise<Address> {
  return findAssociatedTokenAddress(escrow, mint);
}

export type EscrowAddresses = {
  escrow: Address;
  tranche0: Address;
  tranche1: Address;
  vault: Address;
};

export async function findEscrowAddresses(
  funder: Address,
  caseHash: Bytes32,
  mint: Address,
): Promise<EscrowAddresses> {
  const escrow = await findEscrowPda(funder, caseHash);
  const [tranche0, tranche1, vault] = await Promise.all([
    findTranchePda(escrow, 0),
    findTranchePda(escrow, 1),
    findVaultAddress(escrow, mint),
  ]);
  return { escrow, tranche0, tranche1, vault };
}

// ----------------------------------------------------------------------- args

export enum DisputeOutcome {
  Refund = 0,
  RequireReverification = 1,
}

export type ConfigArgs = {
  matchAuthority: Address;
  disputeAuthority: Address;
  minChallengeSeconds: number;
  maxChallengeSeconds: number;
};
export type SetPausedArgs = { paused: boolean };
export type SetReviewerArgs = { wallet: Address; aliasHash: Bytes32; active: boolean };
export type CreateEscrowArgs = {
  caseHash: Bytes32;
  termsHash: Bytes32;
  funder: Address;
  /** DEFAULT_PUBKEY when the funder chose no challenge wallet. */
  funderChallenger: Address;
  contractor: Address;
  school: Address;
  reviewer: Address;
  amounts: readonly [bigint, bigint];
  milestoneHashes: readonly [Bytes32, Bytes32];
  fundingDeadline: bigint;
  verificationDeadlines: readonly [bigint, bigint];
  challengeSeconds: number;
  disputeSeconds: number;
};
export type ClaimTrancheArgs = {
  expectedRevision: number;
  evidenceHash: Bytes32;
  matchHash: Bytes32;
};
export type VerifyTrancheArgs = {
  expectedRevision: number;
  expectedEvidenceHash: Bytes32;
  expectedMatchHash: Bytes32;
  reviewHash: Bytes32;
};
export type OpenDisputeArgs = { expectedRevision: number; reasonHash: Bytes32 };
export type ResolveDisputeArgs = {
  outcome: DisputeOutcome;
  resolutionHash: Bytes32;
  /** Ignored by the program for a refund; pass 0n. */
  newVerificationDeadline: bigint;
};
export type NoArgs = Record<string, never>;

export type BonaInstructionArgs = {
  initialize_config: ConfigArgs;
  set_paused: SetPausedArgs;
  set_reviewer: SetReviewerArgs;
  create_escrow: CreateEscrowArgs;
  activate_funding: NoArgs;
  cancel_unfunded: NoArgs;
  claim_tranche: ClaimTrancheArgs;
  verify_tranche: VerifyTrancheArgs;
  open_dispute: OpenDisputeArgs;
  resolve_dispute: ResolveDisputeArgs;
  release_tranche: NoArgs;
  refund_expired: NoArgs;
};

type ArgsCodec<T> = {
  write: (w: BorshWriter, args: T) => void;
  read: (r: BorshReader) => T;
};
const noArgs: ArgsCodec<NoArgs> = { write: () => {}, read: () => ({}) };

const ARGS_CODECS: { [K in BonaInstructionName]: ArgsCodec<BonaInstructionArgs[K]> } = {
  initialize_config: {
    write: (w, a) =>
      w
        .address(a.matchAuthority)
        .address(a.disputeAuthority)
        .u32(a.minChallengeSeconds)
        .u32(a.maxChallengeSeconds),
    read: (r) => ({
      matchAuthority: r.address(),
      disputeAuthority: r.address(),
      minChallengeSeconds: r.u32(),
      maxChallengeSeconds: r.u32(),
    }),
  },
  set_paused: { write: (w, a) => w.bool(a.paused), read: (r) => ({ paused: r.bool() }) },
  set_reviewer: {
    write: (w, a) => w.address(a.wallet).bytes32(a.aliasHash).bool(a.active),
    read: (r) => ({ wallet: r.address(), aliasHash: r.bytes32(), active: r.bool() }),
  },
  create_escrow: {
    write: (w, a) =>
      w
        .bytes32(a.caseHash)
        .bytes32(a.termsHash)
        .address(a.funder)
        .address(a.funderChallenger)
        .address(a.contractor)
        .address(a.school)
        .address(a.reviewer)
        .u64(a.amounts[0])
        .u64(a.amounts[1])
        .bytes32(a.milestoneHashes[0])
        .bytes32(a.milestoneHashes[1])
        .i64(a.fundingDeadline)
        .i64(a.verificationDeadlines[0])
        .i64(a.verificationDeadlines[1])
        .u32(a.challengeSeconds)
        .u32(a.disputeSeconds),
    read: (r) => ({
      caseHash: r.bytes32(),
      termsHash: r.bytes32(),
      funder: r.address(),
      funderChallenger: r.address(),
      contractor: r.address(),
      school: r.address(),
      reviewer: r.address(),
      amounts: [r.u64(), r.u64()],
      milestoneHashes: [r.bytes32(), r.bytes32()],
      fundingDeadline: r.i64(),
      verificationDeadlines: [r.i64(), r.i64()],
      challengeSeconds: r.u32(),
      disputeSeconds: r.u32(),
    }),
  },
  activate_funding: noArgs,
  cancel_unfunded: noArgs,
  claim_tranche: {
    write: (w, a) =>
      w.u32(a.expectedRevision).bytes32(a.evidenceHash).bytes32(a.matchHash),
    read: (r) => ({
      expectedRevision: r.u32(),
      evidenceHash: r.bytes32(),
      matchHash: r.bytes32(),
    }),
  },
  verify_tranche: {
    write: (w, a) =>
      w
        .u32(a.expectedRevision)
        .bytes32(a.expectedEvidenceHash)
        .bytes32(a.expectedMatchHash)
        .bytes32(a.reviewHash),
    read: (r) => ({
      expectedRevision: r.u32(),
      expectedEvidenceHash: r.bytes32(),
      expectedMatchHash: r.bytes32(),
      reviewHash: r.bytes32(),
    }),
  },
  open_dispute: {
    write: (w, a) => w.u32(a.expectedRevision).bytes32(a.reasonHash),
    read: (r) => ({ expectedRevision: r.u32(), reasonHash: r.bytes32() }),
  },
  resolve_dispute: {
    write: (w, a) =>
      w.u8(a.outcome).bytes32(a.resolutionHash).i64(a.newVerificationDeadline),
    read: (r) => {
      const tag = r.u8();
      if (tag !== DisputeOutcome.Refund && tag !== DisputeOutcome.RequireReverification) {
        throw new RangeError(`unknown dispute outcome ${tag}`);
      }
      return {
        outcome: tag as DisputeOutcome,
        resolutionHash: r.bytes32(),
        newVerificationDeadline: r.i64(),
      };
    },
  },
  release_tranche: noArgs,
  refund_expired: noArgs,
};

/** Discriminator + Borsh args. */
export function encodeInstructionData<K extends BonaInstructionName>(
  name: K,
  args: BonaInstructionArgs[K],
): Uint8Array {
  const w = new BorshWriter().raw(INSTRUCTION_DISCRIMINATORS[name]);
  ARGS_CODECS[name].write(w, args);
  return w.toBytes();
}

export type DecodedBonaInstructionData = {
  [K in BonaInstructionName]: { name: K; args: BonaInstructionArgs[K] };
}[BonaInstructionName];

export function identifyBonaInstruction(
  data: ArrayLike<number>,
): BonaInstructionName | null {
  if (data.length < 8) return null;
  const head = Array.from({ length: 8 }, (_, i) => data[i]);
  return (
    INSTRUCTION_NAMES.find((n) => bytesEqual(INSTRUCTION_DISCRIMINATORS[n], head)) ?? null
  );
}

/** Throws when the discriminator is unknown or the args do not fit the layout exactly. */
export function decodeInstructionData(
  data: ArrayLike<number>,
): DecodedBonaInstructionData {
  const name = identifyBonaInstruction(data);
  if (!name) throw new Error("Not a BonaWork instruction");
  const r = new BorshReader(Uint8Array.from(data).subarray(8));
  const args = ARGS_CODECS[name].read(r);
  r.end();
  return { name, args } as DecodedBonaInstructionData;
}

// ------------------------------------------------------------ account layouts

export type AccountSpec = {
  name: string;
  role: AccountRole;
  /** A program address that is always the same. */
  fixed?: Address;
  /** Anchor Option<Account>: pass the program id when absent. */
  optional?: boolean;
};

const ro = (name: string): AccountSpec => ({ name, role: AccountRole.READONLY });
const rw = (name: string): AccountSpec => ({ name, role: AccountRole.WRITABLE });
const ros = (name: string): AccountSpec => ({ name, role: AccountRole.READONLY_SIGNER });
const rws = (name: string): AccountSpec => ({ name, role: AccountRole.WRITABLE_SIGNER });
const optional = (name: string): AccountSpec => ({
  name,
  role: AccountRole.READONLY,
  optional: true,
});
const tokenProgram: AccountSpec = {
  name: "tokenProgram",
  role: AccountRole.READONLY,
  fixed: TOKEN_PROGRAM_ADDRESS,
};
const ataProgram: AccountSpec = {
  name: "associatedTokenProgram",
  role: AccountRole.READONLY,
  fixed: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
};
const systemProgram: AccountSpec = {
  name: "systemProgram",
  role: AccountRole.READONLY,
  fixed: SYSTEM_PROGRAM_ADDRESS,
};

/** Account order and signer/writable flags for each instruction, as the program expects them. */
export const ACCOUNT_LAYOUTS: Record<BonaInstructionName, readonly AccountSpec[]> = {
  initialize_config: [rws("admin"), rw("config"), ro("mint"), systemProgram],
  set_paused: [ros("admin"), rw("config")],
  set_reviewer: [rws("admin"), ro("config"), rw("reviewerRecord"), systemProgram],
  create_escrow: [
    rws("admin"),
    ro("config"),
    ro("reviewerRecord"),
    rw("escrow"),
    rw("tranche0"),
    rw("tranche1"),
    rw("vault"),
    ro("mint"),
    tokenProgram,
    ataProgram,
    systemProgram,
  ],
  activate_funding: [rw("escrow"), ro("vault"), ro("mint"), tokenProgram],
  cancel_unfunded: [
    rws("caller"),
    rw("escrow"),
    rw("vault"),
    ro("mint"),
    ro("funder"),
    rw("funderAta"),
    tokenProgram,
    ataProgram,
    systemProgram,
  ],
  claim_tranche: [
    ros("contractor"),
    ros("matchAuthority"),
    ro("escrow"),
    rw("tranche"),
    optional("priorTranche"),
  ],
  verify_tranche: [ros("reviewer"), ro("reviewerRecord"), ro("escrow"), rw("tranche")],
  open_dispute: [ros("challenger"), ro("escrow"), rw("tranche")],
  resolve_dispute: [
    rws("disputeAuthority"),
    rw("escrow"),
    rw("tranche"),
    rw("vault"),
    ro("mint"),
    ro("funder"),
    rw("funderAta"),
    tokenProgram,
    ataProgram,
    systemProgram,
  ],
  release_tranche: [
    rws("caller"),
    rw("escrow"),
    rw("tranche"),
    rw("vault"),
    ro("mint"),
    ro("contractor"),
    rw("contractorAta"),
    tokenProgram,
    ataProgram,
    systemProgram,
  ],
  refund_expired: [
    rws("caller"),
    rw("escrow"),
    rw("tranche"),
    optional("priorTranche"),
    rw("vault"),
    ro("mint"),
    ro("funder"),
    rw("funderAta"),
    tokenProgram,
    ataProgram,
    systemProgram,
  ],
};

// --------------------------------------------------------------- instructions

export type BonaInstruction = Instruction & {
  programAddress: typeof BONAWORK_PROGRAM_ADDRESS;
  accounts: { address: Address; role: AccountRole }[];
  data: Uint8Array;
};

function buildInstruction<K extends BonaInstructionName>(
  name: K,
  accounts: Record<string, Address | undefined>,
  args: BonaInstructionArgs[K],
): BonaInstruction {
  const metas = ACCOUNT_LAYOUTS[name].map((spec) => {
    const given = accounts[spec.name];
    const resolved =
      given ?? spec.fixed ?? (spec.optional ? BONAWORK_PROGRAM_ADDRESS : undefined);
    if (!resolved) throw new Error(`${name}: missing account "${spec.name}"`);
    return { address: resolved, role: spec.role };
  });
  return {
    programAddress: BONAWORK_PROGRAM_ADDRESS,
    accounts: metas,
    data: encodeInstructionData(name, args),
  };
}

export function getInitializeConfigInstruction(
  accounts: { admin: Address; config: Address; mint: Address },
  args: ConfigArgs,
): BonaInstruction {
  return buildInstruction("initialize_config", accounts, args);
}

export function getSetPausedInstruction(
  accounts: { admin: Address; config: Address },
  args: SetPausedArgs,
) {
  return buildInstruction("set_paused", accounts, args);
}

export function getSetReviewerInstruction(
  accounts: { admin: Address; config: Address; reviewerRecord: Address },
  args: SetReviewerArgs,
): BonaInstruction {
  return buildInstruction("set_reviewer", accounts, args);
}

export function getCreateEscrowInstruction(
  accounts: {
    admin: Address;
    config: Address;
    reviewerRecord: Address;
    escrow: Address;
    tranche0: Address;
    tranche1: Address;
    vault: Address;
    mint: Address;
  },
  args: CreateEscrowArgs,
): BonaInstruction {
  return buildInstruction("create_escrow", accounts, args);
}

export function getActivateFundingInstruction(accounts: {
  escrow: Address;
  vault: Address;
  mint: Address;
}) {
  return buildInstruction("activate_funding", accounts, {});
}

export function getCancelUnfundedInstruction(accounts: {
  caller: Address;
  escrow: Address;
  vault: Address;
  mint: Address;
  funder: Address;
  funderAta: Address;
}): BonaInstruction {
  return buildInstruction("cancel_unfunded", accounts, {});
}

export function getClaimTrancheInstruction(
  accounts: {
    contractor: Address;
    matchAuthority: Address;
    escrow: Address;
    tranche: Address;
    /** Required when claiming tranche 1 (completion): pass tranche 0. Omit for tranche 0. */
    priorTranche?: Address;
  },
  args: ClaimTrancheArgs,
): BonaInstruction {
  return buildInstruction("claim_tranche", accounts, args);
}

export function getVerifyTrancheInstruction(
  accounts: {
    reviewer: Address;
    reviewerRecord: Address;
    escrow: Address;
    tranche: Address;
  },
  args: VerifyTrancheArgs,
): BonaInstruction {
  return buildInstruction("verify_tranche", accounts, args);
}

export function getOpenDisputeInstruction(
  accounts: { challenger: Address; escrow: Address; tranche: Address },
  args: OpenDisputeArgs,
): BonaInstruction {
  return buildInstruction("open_dispute", accounts, args);
}

export function getResolveDisputeInstruction(
  accounts: {
    disputeAuthority: Address;
    escrow: Address;
    tranche: Address;
    vault: Address;
    mint: Address;
    funder: Address;
    funderAta: Address;
  },
  args: ResolveDisputeArgs,
): BonaInstruction {
  return buildInstruction("resolve_dispute", accounts, args);
}

export function getReleaseTrancheInstruction(accounts: {
  caller: Address;
  escrow: Address;
  tranche: Address;
  vault: Address;
  mint: Address;
  contractor: Address;
  contractorAta: Address;
}): BonaInstruction {
  return buildInstruction("release_tranche", accounts, {});
}

export function getRefundExpiredInstruction(accounts: {
  caller: Address;
  escrow: Address;
  tranche: Address;
  /** Optional: the materials tranche, when refunding the completion tranche because it was refunded. */
  priorTranche?: Address;
  vault: Address;
  mint: Address;
  funder: Address;
  funderAta: Address;
}): BonaInstruction {
  return buildInstruction("refund_expired", accounts, {});
}

// -------------------------------------------------------------------- helpers

function assert32(bytes: Uint8Array, label: string) {
  if (bytes.length !== 32)
    throw new RangeError(`${label} must be 32 bytes, got ${bytes.length}`);
}

/** 300000n -> "R3 000.00" (2-decimal demo rand). */
export function formatRand(amount: bigint): string {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const negative = amount < zero;
  const abs = negative ? -amount : amount;
  const rands = (abs / hundred).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const cents = (abs % hundred).toString().padStart(2, "0");
  return `${negative ? "-" : ""}R${rands}.${cents}`;
}
