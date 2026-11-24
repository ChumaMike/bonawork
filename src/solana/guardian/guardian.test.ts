import {
  AccountRole,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getAddressDecoder,
  getBase64EncodedWireTransaction,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import {
  getTransferCheckedInstruction,
  getTransferInstruction,
} from "@solana-program/token";
import { beforeAll, describe, expect, it } from "vitest";

import { TrancheState, type EscrowAccount, type TrancheAccount } from "../accounts";
import {
  DEFAULT_PUBKEY,
  findAssociatedTokenAddress,
  findEscrowAddresses,
  findReviewerPda,
  getClaimTrancheInstruction,
  getReleaseTrancheInstruction,
  getVerifyTrancheInstruction,
  type EscrowAddresses,
  type VerifyTrancheArgs,
} from "../program";
import { decodeTransaction } from "./decode";
import { describeTransaction } from "./describe";
import {
  checkReleaseTransaction,
  checkVerifyTransaction,
  type VerifyExpectation,
} from "./policy";

const h = (n: number) => new Uint8Array(32).fill(n);
const key = (n: number): Address => getAddressDecoder().decode(h(n));

const feePayer = key(1);
const reviewer = key(2);
const funder = key(3);
const contractor = key(4);
const attacker = key(66);
const mint = key(8);
const caseHash = h(42);

let ids: EscrowAddresses;
let reviewerRecord: Address;

beforeAll(async () => {
  ids = await findEscrowAddresses(funder, caseHash, mint);
  reviewerRecord = await findReviewerPda(reviewer);
});

/** Builds and compiles a real v0 transaction; no network needed. */
function wire(payer: Address, instructions: Instruction[]): string {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: blockhash(key(99)), lastValidBlockHeight: BigInt(1000) },
        m,
      ),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

const goodArgs = (): VerifyTrancheArgs => ({
  expectedRevision: 1,
  expectedEvidenceHash: h(20),
  expectedMatchHash: h(120),
  reviewHash: h(50),
});

function verifyIx(
  overrides: { tranche?: Address; args?: Partial<VerifyTrancheArgs> } = {},
) {
  return getVerifyTrancheInstruction(
    {
      reviewer,
      reviewerRecord,
      escrow: ids.escrow,
      tranche: overrides.tranche ?? ids.tranche1,
    },
    { ...goodArgs(), ...overrides.args },
  );
}

function expected(): VerifyExpectation {
  return {
    feePayer,
    reviewer,
    escrow: ids.escrow,
    tranche: ids.tranche1,
    revision: 1,
    evidenceHash: h(20),
    matchHash: h(120),
  };
}

const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

describe("checkVerifyTransaction", () => {
  it("accepts the correct verify transaction, with fee-budget instructions", async () => {
    const tx = wire(feePayer, [
      getSetComputeUnitLimitInstruction({ units: 50_000 }),
      getSetComputeUnitPriceInstruction({ microLamports: BigInt(1000) }),
      verifyIx(),
    ]);
    const result = await checkVerifyTransaction(tx, expected());
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("accepts wire bytes as well as base64", async () => {
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(feePayer, m),
      (m) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: blockhash(key(99)), lastValidBlockHeight: BigInt(1000) },
          m,
        ),
      (m) => appendTransactionMessageInstructions([verifyIx()], m),
    );
    const bytes = Uint8Array.from(
      getTransactionEncoder().encode(compileTransaction(message)),
    );
    expect((await checkVerifyTransaction(bytes, expected())).ok).toBe(true);
  });

  it("REJECTS a verify with an SPL Token transfer appended", async () => {
    const reviewerTokens = await findAssociatedTokenAddress(reviewer, mint);
    const theft = getTransferInstruction({
      source: reviewerTokens,
      destination: await findAssociatedTokenAddress(attacker, mint),
      authority: reviewer,
      amount: BigInt(300_000),
    });
    const tx = wire(feePayer, [verifyIx(), theft]);
    const result = await checkVerifyTransaction(tx, expected());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("TOKEN_PROGRAM_CALLED");
    expect(codes(result)).toContain("UNEXPECTED_WRITABLE");
    expect(
      result.findings.find((f) => f.code === "TOKEN_PROGRAM_CALLED")?.message,
    ).toMatch(/move tokens.*Do not sign/);
  });

  it("REJECTS the wrong tranche", async () => {
    const result = await checkVerifyTransaction(
      wire(feePayer, [verifyIx({ tranche: ids.tranche0 })]),
      expected(),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("WRONG_TRANCHE");
  });

  it("REJECTS a stale revision", async () => {
    const result = await checkVerifyTransaction(
      wire(feePayer, [verifyIx({ args: { expectedRevision: 0 } })]),
      expected(),
    );
    expect(codes(result)).toEqual(["STALE_REVISION"]);
    expect(result.ok).toBe(false);
  });

  it("REJECTS evidence the reviewer did not see", async () => {
    const result = await checkVerifyTransaction(
      wire(feePayer, [verifyIx({ args: { expectedMatchHash: h(121) } })]),
      expected(),
    );
    expect(codes(result)).toEqual(["EVIDENCE_MISMATCH"]);
  });

  it("REJECTS an extra signer", async () => {
    const ix = verifyIx();
    const withSigner = {
      ...ix,
      accounts: [
        ...ix.accounts,
        { address: attacker, role: AccountRole.READONLY_SIGNER },
      ],
    };
    const result = await checkVerifyTransaction(wire(feePayer, [withSigner]), expected());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("UNEXPECTED_SIGNER");
  });

  it("REJECTS a different program id", async () => {
    const fake = { ...verifyIx(), programAddress: key(77) };
    const result = await checkVerifyTransaction(wire(feePayer, [fake]), expected());
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(
      expect.arrayContaining(["UNEXPECTED_PROGRAM", "WRONG_INSTRUCTION_COUNT"]),
    );
  });

  it("REJECTS an extra writable account", async () => {
    const ix = verifyIx();
    const writableEscrow = {
      ...ix,
      accounts: ix.accounts.map((a, i) =>
        i === 2 ? { ...a, role: AccountRole.WRITABLE } : a,
      ),
    };
    const result = await checkVerifyTransaction(
      wire(feePayer, [writableEscrow]),
      expected(),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(
      expect.arrayContaining(["UNEXPECTED_WRITABLE", "WRONG_ACCOUNT_ROLE"]),
    );
  });

  it("REJECTS two verify instructions, a wrong fee payer and unreadable input", async () => {
    const twice = await checkVerifyTransaction(
      wire(feePayer, [verifyIx(), verifyIx()]),
      expected(),
    );
    expect(codes(twice)).toContain("WRONG_INSTRUCTION_COUNT");

    const otherPayer = await checkVerifyTransaction(
      wire(attacker, [verifyIx()]),
      expected(),
    );
    expect(codes(otherPayer)).toEqual(
      expect.arrayContaining([
        "FEE_PAYER_MISMATCH",
        "UNEXPECTED_SIGNER",
        "MISSING_SIGNER",
      ]),
    );

    const garbage = await checkVerifyTransaction("bm90IGEgdHJhbnNhY3Rpb24=", expected());
    expect(garbage.ok).toBe(false);
    expect(codes(garbage)).toEqual(["UNREADABLE"]);
  });

  it("REJECTS a claim dressed up as the reviewer's step", async () => {
    const claim = getClaimTrancheInstruction(
      {
        contractor: reviewer,
        matchAuthority: feePayer,
        escrow: ids.escrow,
        tranche: ids.tranche1,
        priorTranche: ids.tranche0,
      },
      { expectedRevision: 1, evidenceHash: h(20), matchHash: h(120) },
    );
    const result = await checkVerifyTransaction(wire(feePayer, [claim]), expected());
    expect(codes(result)).toContain("WRONG_INSTRUCTION");
  });
});

describe("checkReleaseTransaction", () => {
  const keeper = key(5);
  const escrowAccount = { contractor, mint };

  async function releaseIx(
    overrides: { contractorAta?: Address; contractor?: Address } = {},
  ) {
    return getReleaseTrancheInstruction({
      caller: keeper,
      escrow: ids.escrow,
      tranche: ids.tranche0,
      vault: ids.vault,
      mint,
      contractor: overrides.contractor ?? contractor,
      contractorAta:
        overrides.contractorAta ?? (await findAssociatedTokenAddress(contractor, mint)),
    });
  }
  const exp = () => ({
    feePayer: keeper,
    escrow: ids.escrow,
    tranche: ids.tranche0,
    escrowAccount,
  });

  it("accepts a release to the contractor's canonical token account", async () => {
    const result = await checkReleaseTransaction(
      wire(keeper, [await releaseIx()]),
      exp(),
    );
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("REJECTS a payout redirected to another token account", async () => {
    const redirected = await releaseIx({
      contractorAta: await findAssociatedTokenAddress(attacker, mint),
    });
    const result = await checkReleaseTransaction(wire(keeper, [redirected]), exp());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("WRONG_RECIPIENT");
  });

  it("REJECTS any instruction other than release_tranche", async () => {
    const result = await checkReleaseTransaction(wire(keeper, [verifyIx()]), exp());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("WRONG_INSTRUCTION");
  });
});

describe("decodeTransaction and describeTransaction", () => {
  const tranche1: TrancheAccount = {
    escrow: key(0),
    index: 1,
    amount: BigInt(300_000),
    state: TrancheState.Claimed,
    revision: 1,
    verificationDeadline: BigInt(0),
    claimedAt: BigInt(0),
    verifiedAt: BigInt(0),
    challengeUntil: BigInt(0),
    disputedAt: BigInt(0),
    settledAt: BigInt(0),
    milestoneHash: h(4),
    evidenceHash: h(20),
    matchHash: h(120),
    reviewHash: h(0),
    disputeHash: h(0),
    resolutionHash: h(0),
    bump: 255,
  };
  const escrow = { challengeSeconds: 60, contractor } as EscrowAccount;

  it("names our instruction, its accounts, signers and writable accounts", () => {
    const decoded = decodeTransaction(wire(feePayer, [verifyIx()]));
    expect(decoded.feePayer).toBe(feePayer);
    expect(decoded.signers).toEqual([feePayer, reviewer]);
    expect(new Set(decoded.writableAccounts)).toEqual(new Set([feePayer, ids.tranche1]));
    const [ix] = decoded.instructions;
    expect(ix.program).toBe("BonaWork");
    expect(ix.name).toBe("verify_tranche");
    expect(ix.accounts.map((a) => a.name)).toEqual([
      "reviewer",
      "reviewerRecord",
      "escrow",
      "tranche",
    ]);
    expect(ix.args).toEqual(goodArgs());
  });

  it("describes a verify in plain words, using on-chain data passed in", () => {
    const lines = describeTransaction(wire(feePayer, [verifyIx()]), {
      tranches: { [ids.tranche1]: tranche1 },
      escrows: { [ids.escrow]: escrow },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^No money moves now\. This starts a 60-second challenge window for tranche 2 \(R3 000\.00\)\./,
    );
  });

  it("describes a hidden token transfer as money moving", async () => {
    const theft = getTransferCheckedInstruction({
      source: await findAssociatedTokenAddress(reviewer, mint),
      mint,
      destination: await findAssociatedTokenAddress(attacker, mint),
      authority: reviewer,
      amount: BigInt(300_000),
      decimals: 2,
    });
    const lines = describeTransaction(wire(feePayer, [verifyIx(), theft]));
    expect(lines[0]).toMatch(/challenge window for the payment stage at/);
    expect(lines[1]).toMatch(/^Moves R3 000\.00 from .+ to .+\.$/);
  });

  it("describes a release without data as best it can", async () => {
    const release = getReleaseTrancheInstruction({
      caller: feePayer,
      escrow: ids.escrow,
      tranche: ids.tranche0,
      vault: ids.vault,
      mint,
      contractor,
      contractorAta: await findAssociatedTokenAddress(contractor, mint),
    });
    const [line] = describeTransaction(wire(feePayer, [release]), {
      escrows: { [ids.escrow]: escrow },
    });
    expect(line).toMatch(
      /^Pays the payment stage at .+ from the escrow vault to the contractor/,
    );
    expect(DEFAULT_PUBKEY).toBe("11111111111111111111111111111111");
  });
});
