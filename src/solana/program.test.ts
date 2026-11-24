import { createHash } from "node:crypto";

import { AccountRole, getAddressDecoder, type Address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_SIZES,
  decodeConfig,
  decodeEscrow,
  decodeReviewerRecord,
  decodeTranche,
  encodeConfig,
  encodeEscrow,
  encodeReviewerRecord,
  encodeTranche,
  TrancheState,
  type EscrowAccount,
  type TrancheAccount,
} from "./accounts";
import { bonaErrorMessage, BONA_ERRORS, getBonaError, getBonaErrorCode } from "./errors";
import {
  ACCOUNT_DISCRIMINATORS,
  ACCOUNT_LAYOUTS,
  BONAWORK_PROGRAM_ADDRESS,
  decodeInstructionData,
  DEFAULT_PUBKEY,
  DisputeOutcome,
  encodeInstructionData,
  findConfigPda,
  findEscrowAddresses,
  findEscrowPda,
  findReviewerPda,
  findTranchePda,
  findVaultAddress,
  formatRand,
  getActivateFundingInstruction,
  getCancelUnfundedInstruction,
  getClaimTrancheInstruction,
  getCreateEscrowInstruction,
  getInitializeConfigInstruction,
  getOpenDisputeInstruction,
  getRefundExpiredInstruction,
  getReleaseTrancheInstruction,
  getResolveDisputeInstruction,
  getSetPausedInstruction,
  getSetReviewerInstruction,
  getVerifyTrancheInstruction,
  identifyBonaInstruction,
  INSTRUCTION_DISCRIMINATORS,
  INSTRUCTION_NAMES,
  SYSTEM_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  type BonaInstructionArgs,
  type BonaInstructionName,
} from "./program";

const sha8 = (s: string) =>
  Array.from(createHash("sha256").update(s).digest().subarray(0, 8));
const h = (n: number) => new Uint8Array(32).fill(n);
const key = (n: number): Address => getAddressDecoder().decode(h(n));

describe("discriminators", () => {
  it("match sha256('global:<name>') for all 12 instructions", () => {
    expect(INSTRUCTION_NAMES).toHaveLength(12);
    for (const name of INSTRUCTION_NAMES) {
      expect(Array.from(INSTRUCTION_DISCRIMINATORS[name]), name).toEqual(
        sha8(`global:${name}`),
      );
    }
  });

  it("match sha256('account:<Name>') for all 4 accounts", () => {
    for (const [name, disc] of Object.entries(ACCOUNT_DISCRIMINATORS)) {
      expect(Array.from(disc), name).toEqual(sha8(`account:${name}`));
    }
  });

  it("every builder starts its data with the right discriminator", () => {
    const built: Record<BonaInstructionName, Uint8Array> = {
      initialize_config: getInitializeConfigInstruction(
        { admin: key(1), config: key(2), mint: key(3) },
        {
          matchAuthority: key(4),
          disputeAuthority: key(5),
          minChallengeSeconds: 60,
          maxChallengeSeconds: 600,
        },
      ).data,
      set_paused: getSetPausedInstruction(
        { admin: key(1), config: key(2) },
        { paused: true },
      ).data,
      set_reviewer: getSetReviewerInstruction(
        { admin: key(1), config: key(2), reviewerRecord: key(3) },
        { wallet: key(4), aliasHash: h(9), active: true },
      ).data,
      create_escrow: getCreateEscrowInstruction(
        {
          admin: key(1),
          config: key(2),
          reviewerRecord: key(3),
          escrow: key(4),
          tranche0: key(5),
          tranche1: key(6),
          vault: key(7),
          mint: key(8),
        },
        sampleCreateArgs(),
      ).data,
      activate_funding: getActivateFundingInstruction({
        escrow: key(1),
        vault: key(2),
        mint: key(3),
      }).data,
      cancel_unfunded: getCancelUnfundedInstruction({
        caller: key(1),
        escrow: key(2),
        vault: key(3),
        mint: key(4),
        funder: key(5),
        funderAta: key(6),
      }).data,
      claim_tranche: getClaimTrancheInstruction(
        { contractor: key(1), matchAuthority: key(2), escrow: key(3), tranche: key(4) },
        { expectedRevision: 0, evidenceHash: h(10), matchHash: h(110) },
      ).data,
      verify_tranche: getVerifyTrancheInstruction(
        { reviewer: key(1), reviewerRecord: key(2), escrow: key(3), tranche: key(4) },
        {
          expectedRevision: 1,
          expectedEvidenceHash: h(10),
          expectedMatchHash: h(110),
          reviewHash: h(50),
        },
      ).data,
      open_dispute: getOpenDisputeInstruction(
        { challenger: key(1), escrow: key(2), tranche: key(3) },
        { expectedRevision: 1, reasonHash: h(60) },
      ).data,
      resolve_dispute: getResolveDisputeInstruction(
        {
          disputeAuthority: key(1),
          escrow: key(2),
          tranche: key(3),
          vault: key(4),
          mint: key(5),
          funder: key(6),
          funderAta: key(7),
        },
        {
          outcome: DisputeOutcome.Refund,
          resolutionHash: h(70),
          newVerificationDeadline: BigInt(0),
        },
      ).data,
      release_tranche: getReleaseTrancheInstruction({
        caller: key(1),
        escrow: key(2),
        tranche: key(3),
        vault: key(4),
        mint: key(5),
        contractor: key(6),
        contractorAta: key(7),
      }).data,
      refund_expired: getRefundExpiredInstruction({
        caller: key(1),
        escrow: key(2),
        tranche: key(3),
        vault: key(4),
        mint: key(5),
        funder: key(6),
        funderAta: key(7),
      }).data,
    };
    for (const name of INSTRUCTION_NAMES) {
      expect(Array.from(built[name].subarray(0, 8)), name).toEqual(
        sha8(`global:${name}`),
      );
      expect(identifyBonaInstruction(built[name])).toBe(name);
    }
  });
});

describe("PDAs", () => {
  it("are stable", async () => {
    expect(await findConfigPda()).toBe("DWz2r2eibjve4rZDjyKN7x4pn5ZriC4quFJ73tY3EPtR");
    const escrow = await findEscrowPda(key(11), h(1));
    expect(escrow).toBe("9aK6q3c3yt7RWJ8UcqZZjHomwTpp5nhpwecXwXMy3Tbx");
    expect(await findTranchePda(escrow, 1)).toBe(
      "6Xp2ciJpSyCYLCgsjz4UzNvYiDF1qUtcKbzbZWgnE2e1",
    );
    expect(await findTranchePda(escrow, 0)).not.toBe(await findTranchePda(escrow, 1));
    expect(await findReviewerPda(key(5))).toBe(await findReviewerPda(key(5)));
    await expect(findTranchePda(escrow, 2)).rejects.toThrow();
  });

  it("vault matches the SPL associated token address", async () => {
    const escrow = await findEscrowPda(key(11), h(1));
    const [expected] = await findAssociatedTokenPda({
      owner: escrow,
      mint: key(8),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    expect(await findVaultAddress(escrow, key(8))).toBe(expected);
    const all = await findEscrowAddresses(key(11), h(1), key(8));
    expect(all).toEqual({
      escrow,
      tranche0: await findTranchePda(escrow, 0),
      tranche1: await findTranchePda(escrow, 1),
      vault: expected,
    });
  });
});

function sampleCreateArgs(): BonaInstructionArgs["create_escrow"] {
  return {
    caseHash: h(1),
    termsHash: h(2),
    funder: key(20),
    funderChallenger: DEFAULT_PUBKEY,
    contractor: key(21),
    school: key(22),
    reviewer: key(23),
    amounts: [BigInt(200_000), BigInt(300_000)],
    milestoneHashes: [h(3), h(4)],
    fundingDeadline: BigInt(1_800_003_600),
    verificationDeadlines: [BigInt(1_800_604_800), BigInt(1_801_209_600)],
    challengeSeconds: 60,
    disputeSeconds: 86_400,
  };
}

describe("instruction args", () => {
  const samples: { [K in BonaInstructionName]: BonaInstructionArgs[K] } = {
    initialize_config: {
      matchAuthority: key(4),
      disputeAuthority: key(5),
      minChallengeSeconds: 60,
      maxChallengeSeconds: 604_800,
    },
    set_paused: { paused: true },
    set_reviewer: { wallet: key(6), aliasHash: h(9), active: false },
    create_escrow: sampleCreateArgs(),
    activate_funding: {},
    cancel_unfunded: {},
    claim_tranche: { expectedRevision: 3, evidenceHash: h(10), matchHash: h(110) },
    verify_tranche: {
      expectedRevision: 2,
      expectedEvidenceHash: h(11),
      expectedMatchHash: h(111),
      reviewHash: h(50),
    },
    open_dispute: { expectedRevision: 1, reasonHash: h(60) },
    resolve_dispute: {
      outcome: DisputeOutcome.RequireReverification,
      resolutionHash: h(70),
      newVerificationDeadline: BigInt(-5),
    },
    release_tranche: {},
    refund_expired: {},
  };

  it("round-trip through encode and decode for every instruction", () => {
    for (const name of INSTRUCTION_NAMES) {
      const data = encodeInstructionData(name, samples[name] as never);
      expect(decodeInstructionData(data), name).toEqual({ name, args: samples[name] });
    }
  });

  it("use the exact Borsh sizes the program expects", () => {
    const size = (name: BonaInstructionName) =>
      encodeInstructionData(name, samples[name] as never).length - 8;
    expect(size("initialize_config")).toBe(32 + 32 + 4 + 4);
    expect(size("set_reviewer")).toBe(32 + 32 + 1);
    expect(size("create_escrow")).toBe(
      32 * 2 + 32 * 5 + 8 * 2 + 32 * 2 + 8 + 8 * 2 + 4 + 4,
    );
    expect(size("claim_tranche")).toBe(4 + 32 + 32);
    expect(size("verify_tranche")).toBe(4 + 32 * 3);
    expect(size("open_dispute")).toBe(4 + 32);
    expect(size("resolve_dispute")).toBe(1 + 32 + 8);
    expect(size("release_tranche")).toBe(0);
  });

  it("encodes integers little-endian, as in the LiteSVM test", () => {
    const data = encodeInstructionData("verify_tranche", {
      expectedRevision: 0x01020304,
      expectedEvidenceHash: h(10),
      expectedMatchHash: h(110),
      reviewHash: h(50),
    });
    expect(Array.from(data.subarray(8, 12))).toEqual([4, 3, 2, 1]);
    expect(data[12]).toBe(10);
    expect(data[12 + 32]).toBe(110);
    expect(data[12 + 64]).toBe(50);
  });

  it("rejects trailing bytes, unknown tags and out-of-range values", () => {
    const data = encodeInstructionData("open_dispute", samples.open_dispute);
    expect(() => decodeInstructionData(Uint8Array.from([...data, 0]))).toThrow(
      /trailing/,
    );
    const bad = encodeInstructionData("resolve_dispute", samples.resolve_dispute);
    bad[8] = 7;
    expect(() => decodeInstructionData(bad)).toThrow(/outcome/);
    expect(() => decodeInstructionData(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8))).toThrow();
    expect(() =>
      encodeInstructionData("claim_tranche", {
        ...samples.claim_tranche,
        evidenceHash: new Uint8Array(31),
      }),
    ).toThrow();
    expect(() =>
      encodeInstructionData("open_dispute", {
        ...samples.open_dispute,
        expectedRevision: -1,
      }),
    ).toThrow();
  });
});

describe("account metas", () => {
  it("verify_tranche: reviewer signs read-only, only the tranche is writable", () => {
    const ix = getVerifyTrancheInstruction(
      { reviewer: key(1), reviewerRecord: key(2), escrow: key(3), tranche: key(4) },
      {
        expectedRevision: 1,
        expectedEvidenceHash: h(10),
        expectedMatchHash: h(110),
        reviewHash: h(50),
      },
    );
    expect(ix.programAddress).toBe(BONAWORK_PROGRAM_ADDRESS);
    expect(ix.accounts).toEqual([
      { address: key(1), role: AccountRole.READONLY_SIGNER },
      { address: key(2), role: AccountRole.READONLY },
      { address: key(3), role: AccountRole.READONLY },
      { address: key(4), role: AccountRole.WRITABLE },
    ]);
  });

  it("an absent optional account is the program id", () => {
    const claim0 = getClaimTrancheInstruction(
      { contractor: key(1), matchAuthority: key(2), escrow: key(3), tranche: key(4) },
      { expectedRevision: 0, evidenceHash: h(10), matchHash: h(110) },
    );
    expect(claim0.accounts[4]).toEqual({
      address: BONAWORK_PROGRAM_ADDRESS,
      role: AccountRole.READONLY,
    });
    const claim1 = getClaimTrancheInstruction(
      {
        contractor: key(1),
        matchAuthority: key(2),
        escrow: key(3),
        tranche: key(4),
        priorTranche: key(5),
      },
      { expectedRevision: 0, evidenceHash: h(10), matchHash: h(110) },
    );
    expect(claim1.accounts[4].address).toBe(key(5));
  });

  it("release_tranche fills in the fixed programs in the LiteSVM order", () => {
    const ix = getReleaseTrancheInstruction({
      caller: key(1),
      escrow: key(2),
      tranche: key(3),
      vault: key(4),
      mint: key(5),
      contractor: key(6),
      contractorAta: key(7),
    });
    expect(ix.accounts.map((a) => a.role)).toEqual([
      AccountRole.WRITABLE_SIGNER,
      AccountRole.WRITABLE,
      AccountRole.WRITABLE,
      AccountRole.WRITABLE,
      AccountRole.READONLY,
      AccountRole.READONLY,
      AccountRole.WRITABLE,
      AccountRole.READONLY,
      AccountRole.READONLY,
      AccountRole.READONLY,
    ]);
    expect(ix.accounts[7].address).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(ix.accounts[9].address).toBe(SYSTEM_PROGRAM_ADDRESS);
    expect(ACCOUNT_LAYOUTS.refund_expired).toHaveLength(11);
    expect(ACCOUNT_LAYOUTS.create_escrow).toHaveLength(11);
  });

  it("throws when a required account is missing", () => {
    expect(() =>
      getActivateFundingInstruction({
        escrow: key(1),
        vault: key(2),
      } as unknown as Parameters<typeof getActivateFundingInstruction>[0]),
    ).toThrow(/mint/);
  });
});

describe("accounts", () => {
  const escrow: EscrowAccount = {
    caseHash: h(1),
    termsHash: h(2),
    funder: key(20),
    funderChallenger: DEFAULT_PUBKEY,
    contractor: key(21),
    school: key(22),
    reviewer: key(23),
    mint: key(8),
    matchAuthority: key(24),
    disputeAuthority: key(25),
    totalAmount: BigInt(500_000),
    releasedAmount: BigInt(200_000),
    refundedAmount: BigInt(0),
    fundingDeadline: BigInt(1_800_003_600),
    challengeSeconds: 60,
    disputeSeconds: 86_400,
    funded: true,
    cancelled: false,
    bump: 254,
  };
  const tranche: TrancheAccount = {
    escrow: key(30),
    index: 1,
    amount: BigInt(300_000),
    state: TrancheState.Verified,
    revision: 2,
    verificationDeadline: BigInt(1_801_209_600),
    claimedAt: BigInt(1_800_000_100),
    verifiedAt: BigInt(1_800_000_200),
    challengeUntil: BigInt(1_800_000_260),
    disputedAt: BigInt(0),
    settledAt: BigInt(0),
    milestoneHash: h(4),
    evidenceHash: h(20),
    matchHash: h(120),
    reviewHash: h(50),
    disputeHash: h(0),
    resolutionHash: h(0),
    bump: 253,
  };

  it("round-trip and match 8 + INIT_SPACE", () => {
    const config = {
      admin: key(1),
      mint: key(8),
      matchAuthority: key(24),
      disputeAuthority: key(25),
      minChallengeSeconds: 60,
      maxChallengeSeconds: 604_800,
      paused: false,
      bump: 255,
    };
    const reviewer = { wallet: key(23), aliasHash: h(9), active: true, bump: 252 };
    expect(decodeConfig(encodeConfig(config))).toEqual(config);
    expect(decodeReviewerRecord(encodeReviewerRecord(reviewer))).toEqual(reviewer);
    expect(decodeEscrow(encodeEscrow(escrow))).toEqual(escrow);
    expect(decodeTranche(encodeTranche(tranche))).toEqual(tranche);
    expect(encodeConfig(config)).toHaveLength(ACCOUNT_SIZES.Config);
    expect(encodeReviewerRecord(reviewer)).toHaveLength(ACCOUNT_SIZES.ReviewerRecord);
    expect(encodeEscrow(escrow)).toHaveLength(ACCOUNT_SIZES.Escrow);
    expect(encodeTranche(tranche)).toHaveLength(ACCOUNT_SIZES.Tranche);
  });

  it("refuse data from a different account type", () => {
    expect(() => decodeTranche(encodeEscrow(escrow))).toThrow(/Tranche/);
  });
});

describe("errors and formatting", () => {
  it("maps Anchor codes from 6000 in errors.rs order", () => {
    expect(BONA_ERRORS).toHaveLength(28);
    expect(getBonaError(6000)?.name).toBe("Unauthorized");
    expect(getBonaErrorCode("ChallengeWindowActive")).toBe(6022);
    expect(bonaErrorMessage(6022)).toBe(
      "The money is locked until the challenge window ends.",
    );
    expect(getBonaError(6027)?.name).toBe("ArithmeticOverflow");
    expect(getBonaError(6028)).toBeNull();
    expect(bonaErrorMessage(1)).toMatch(/code 1/);
  });

  it("formats demo rand", () => {
    expect(formatRand(BigInt(300_000))).toBe("R3 000.00");
    expect(formatRand(BigInt(5))).toBe("R0.05");
    expect(formatRand(BigInt(123_456_789))).toBe("R1 234 567.89");
  });
});
