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
  getRequestHeapFrameInstruction,
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
  findConfigPda,
  findEscrowAddresses,
  findReviewerPda,
  getClaimTrancheInstruction,
  getReassignReviewerInstruction,
  getRefundExpiredInstruction,
  getReleaseTrancheInstruction,
  getSweepSurplusInstruction,
  getVerifyTrancheInstruction,
  type EscrowAddresses,
  type VerifyTrancheArgs,
} from "../program";
import {
  MAX_COMPUTE_UNIT_LIMIT,
  MAX_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
} from "./compute-budget";
import { decodeTransaction } from "./decode";
import { describeTransaction } from "./describe";
import {
  checkReassignReviewerTransaction,
  checkReleaseTransaction,
  checkSweepTransaction,
  checkVerifyTransaction,
  type VerifyExpectation,
} from "./policy";

const h = (n: number) => new Uint8Array(32).fill(n);
const key = (n: number): Address => getAddressDecoder().decode(h(n));

const feePayer = key(1);
const reviewer = key(2);
const funder = key(3);
const contractor = key(4);
const supplier = key(7);
const school = key(9);
const admin = key(10);
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

  it("accepts the compute budget exactly at the caps", async () => {
    const tx = wire(feePayer, [
      getSetComputeUnitLimitInstruction({ units: MAX_COMPUTE_UNIT_LIMIT }),
      getSetComputeUnitPriceInstruction({
        microLamports: BigInt(MAX_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS),
      }),
      verifyIx(),
    ]);
    expect((await checkVerifyTransaction(tx, expected())).ok).toBe(true);
  });

  it("REJECTS two priority-fee instructions", async () => {
    const tx = wire(feePayer, [
      getSetComputeUnitPriceInstruction({ microLamports: BigInt(1) }),
      getSetComputeUnitPriceInstruction({ microLamports: BigInt(2) }),
      verifyIx(),
    ]);
    const result = await checkVerifyTransaction(tx, expected());
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["DUPLICATE_COMPUTE_BUDGET"]);
  });

  it("REJECTS a huge priority fee or compute limit", async () => {
    const price = await checkVerifyTransaction(
      wire(feePayer, [
        getSetComputeUnitPriceInstruction({ microLamports: BigInt(5_000_000_000) }),
        verifyIx(),
      ]),
      expected(),
    );
    expect(price.ok).toBe(false);
    expect(codes(price)).toEqual(["PRIORITY_FEE_TOO_HIGH"]);
    expect(price.findings[0].message).toMatch(/1 000 000 000 lamports \(1 SOL\)/);

    const limit = await checkVerifyTransaction(
      wire(feePayer, [
        getSetComputeUnitLimitInstruction({ units: MAX_COMPUTE_UNIT_LIMIT + 1 }),
        verifyIx(),
      ]),
      expected(),
    );
    expect(codes(limit)).toEqual(["COMPUTE_LIMIT_TOO_HIGH"]);
  });

  it("REJECTS any other compute budget instruction", async () => {
    const tx = wire(feePayer, [
      getRequestHeapFrameInstruction({ bytes: 64 * 1024 }),
      verifyIx(),
    ]);
    const result = await checkVerifyTransaction(tx, expected());
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(["UNEXPECTED_COMPUTE_BUDGET"]);
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
  const escrowAccount = { payees: [supplier, contractor] as [Address, Address], mint };

  async function releaseIx(overrides: { payeeAta?: Address; payee?: Address } = {}) {
    return getReleaseTrancheInstruction({
      caller: keeper,
      escrow: ids.escrow,
      tranche: ids.tranche0,
      vault: ids.vault,
      mint,
      payee: overrides.payee ?? supplier,
      payeeAta: overrides.payeeAta ?? (await findAssociatedTokenAddress(supplier, mint)),
    });
  }
  const exp = () => ({
    feePayer: keeper,
    escrow: ids.escrow,
    tranche: ids.tranche0,
    index: 0 as const,
    escrowAccount,
  });

  it("accepts a Check 1 release to the supplier's canonical token account", async () => {
    const result = await checkReleaseTransaction(
      wire(keeper, [await releaseIx()]),
      exp(),
    );
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("REJECTS a payout redirected to another token account", async () => {
    const redirected = await releaseIx({
      payeeAta: await findAssociatedTokenAddress(attacker, mint),
    });
    const result = await checkReleaseTransaction(wire(keeper, [redirected]), exp());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("WRONG_RECIPIENT");
  });

  it("REJECTS a Check 1 release sent to the contractor instead of the supplier", async () => {
    const swapped = await releaseIx({
      payee: contractor,
      payeeAta: await findAssociatedTokenAddress(contractor, mint),
    });
    const result = await checkReleaseTransaction(wire(keeper, [swapped]), exp());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("WRONG_RECIPIENT");
  });

  it("checks Check 2 against the second payee", async () => {
    const ix = getReleaseTrancheInstruction({
      caller: keeper,
      escrow: ids.escrow,
      tranche: ids.tranche1,
      vault: ids.vault,
      mint,
      payee: contractor,
      payeeAta: await findAssociatedTokenAddress(contractor, mint),
    });
    const result = await checkReleaseTransaction(wire(keeper, [ix]), {
      ...exp(),
      tranche: ids.tranche1,
      index: 1,
    });
    expect(result.findings).toEqual([]);
  });

  it("REJECTS any instruction other than release_tranche", async () => {
    const result = await checkReleaseTransaction(wire(keeper, [verifyIx()]), exp());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("WRONG_INSTRUCTION");
  });
});

describe("checkSweepTransaction", () => {
  const keeper = key(5);
  const escrowAccount = { funder, mint };
  const sweep = async (tokenOwner: Address, extra: Instruction[] = []) =>
    wire(keeper, [
      getSweepSurplusInstruction({
        caller: keeper,
        escrow: ids.escrow,
        vault: ids.vault,
        mint,
        funder,
        funderAta: await findAssociatedTokenAddress(tokenOwner, mint),
      }),
      ...extra,
    ]);
  const exp = () => ({ feePayer: keeper, escrow: ids.escrow, escrowAccount });

  it("accepts a sweep to the funder's own token account", async () => {
    const result = await checkSweepTransaction(await sweep(funder), exp());
    expect(result.findings).toEqual([]);
  });

  it("REJECTS a sweep to any other token account", async () => {
    const result = await checkSweepTransaction(await sweep(attacker), exp());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("WRONG_RECIPIENT");
  });

  it("REJECTS a sweep with a hidden token transfer", async () => {
    const theft = getTransferCheckedInstruction({
      source: await findAssociatedTokenAddress(keeper, mint),
      mint,
      destination: await findAssociatedTokenAddress(attacker, mint),
      authority: keeper,
      amount: BigInt(1),
      decimals: 2,
    });
    const result = await checkSweepTransaction(await sweep(funder, [theft]), exp());
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("TOKEN_PROGRAM_CALLED");
  });
});

describe("checkReassignReviewerTransaction", () => {
  const newReviewer = key(12);
  const build = async (named: Address, record: Address) =>
    wire(feePayer, [
      getReassignReviewerInstruction(
        {
          admin,
          config: await findConfigPda(),
          school,
          escrow: ids.escrow,
          tranche0: ids.tranche0,
          tranche1: ids.tranche1,
          newReviewerRecord: await findReviewerPda(record),
        },
        { newReviewer: named },
      ),
    ]);
  const exp = () => ({
    feePayer,
    admin,
    school,
    escrow: ids.escrow,
    newReviewer,
  });

  it("accepts the admin and the school naming the agreed reviewer", async () => {
    const result = await checkReassignReviewerTransaction(
      await build(newReviewer, newReviewer),
      exp(),
    );
    expect(result.findings).toEqual([]);
  });

  it("REJECTS a different reviewer than the one agreed", async () => {
    const result = await checkReassignReviewerTransaction(
      await build(attacker, attacker),
      exp(),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("WRONG_ACCOUNT");
  });

  it("REJECTS a transaction without the school's signature slot", async () => {
    const result = await checkReassignReviewerTransaction(
      await build(newReviewer, newReviewer),
      { ...exp(), school: attacker },
    );
    expect(result.ok).toBe(false);
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

  it("describes a verify in plain words, using on-chain data passed in", async () => {
    const lines = await describeTransaction(wire(feePayer, [verifyIx()]), {
      tranches: { [ids.tranche1]: tranche1 },
      escrows: { [ids.escrow]: escrow },
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^No money moves now\. This starts a 60-second challenge window for Check 2: Work done \(R3 000\.00\)\./,
    );
    expect(lines[1]).toBe("No priority fee is set. Only the base network fee applies.");
  });

  it("states the maximum priority fee in lamports and SOL", async () => {
    const lines = await describeTransaction(
      wire(feePayer, [
        getSetComputeUnitLimitInstruction({ units: 200_000 }),
        getSetComputeUnitPriceInstruction({ microLamports: BigInt(50_000) }),
        verifyIx(),
      ]),
    );
    expect(lines[0]).toBe("Sets the compute limit to 200000 units. No money moves.");
    expect(lines[1]).toMatch(/priority fee of 50000 micro-lamports per compute unit/);
    // 200 000 units x 50 000 micro-lamports = 10 000 lamports.
    expect(lines[3]).toMatch(
      /^Maximum priority fee: 10 000 lamports \(0\.00001 SOL\), paid by /,
    );
  });

  it("assumes the network default limit when only a price is set", async () => {
    const lines = await describeTransaction(
      wire(feePayer, [
        getSetComputeUnitPriceInstruction({ microLamports: BigInt(1_000) }),
        verifyIx(),
      ]),
    );
    // One working instruction: 200 000 units x 1 000 micro-lamports = 200 lamports.
    expect(lines.at(-1)).toMatch(
      /^Maximum priority fee: 200 lamports \(0\.0000002 SOL\)/,
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
    const lines = await describeTransaction(wire(feePayer, [verifyIx(), theft]));
    expect(lines[0]).toMatch(/challenge window for the payment stage at/);
    expect(lines[1]).toMatch(/^Moves R3 000\.00 from .+ to .+\.$/);
  });

  const fullEscrow = {
    challengeSeconds: 60,
    contractor,
    funder,
    mint,
    payees: [supplier, contractor],
  } as EscrowAccount;
  const tranche0 = { ...tranche1, index: 0, amount: BigInt(200_000) } as TrancheAccount;
  const releaseCtx = () => ({
    escrows: { [ids.escrow]: fullEscrow },
    tranches: { [ids.tranche0]: tranche0 },
  });

  async function release(owner: Address, tokenOwner: Address) {
    return getReleaseTrancheInstruction({
      caller: feePayer,
      escrow: ids.escrow,
      tranche: ids.tranche0,
      vault: ids.vault,
      mint,
      payee: owner,
      payeeAta: await findAssociatedTokenAddress(tokenOwner, mint),
    });
  }

  it("release: confirms Check 1 goes to the payee fixed in the escrow", async () => {
    const [line] = await describeTransaction(
      wire(feePayer, [await release(supplier, supplier)]),
      releaseCtx(),
    );
    expect(line).toMatch(
      /^Releases Check 1: Materials on site \(R2 000\.00\) from the escrow vault as a sandbox payout\./,
    );
    expect(line).toMatch(/That is the payee's own token account\./);
    expect(line).toMatch(/The program checks the recipient against the escrow\./);
    expect(line).not.toMatch(/WARNING|Nobody can change/);
  });

  it("release: warns when the token account is not the payee's", async () => {
    const [redirected] = await describeTransaction(
      wire(feePayer, [await release(supplier, attacker)]),
      releaseCtx(),
    );
    expect(redirected).toMatch(
      /WARNING: This sends money to an account that is NOT the payee's/,
    );
    const [wrongOwner] = await describeTransaction(
      wire(feePayer, [await release(contractor, contractor)]),
      releaseCtx(),
    );
    expect(wrongOwner).toMatch(/NOT the payee's/);
  });

  it("release without escrow data says it could not compare", async () => {
    const [line] = await describeTransaction(
      wire(feePayer, [await release(contractor, contractor)]),
    );
    expect(line).toMatch(/could not be compared with the escrow's payee/);
    expect(DEFAULT_PUBKEY).toBe("11111111111111111111111111111111");
  });

  it("refund: checks the funder's token account, match and mismatch", async () => {
    const refund = async (tokenOwner: Address) =>
      getRefundExpiredInstruction({
        caller: feePayer,
        escrow: ids.escrow,
        tranche: ids.tranche0,
        vault: ids.vault,
        mint,
        funder,
        funderAta: await findAssociatedTokenAddress(tokenOwner, mint),
      });
    const ctx = { escrows: { [ids.escrow]: fullEscrow } };
    const [good] = await describeTransaction(wire(feePayer, [await refund(funder)]), ctx);
    expect(good).toMatch(/That is the funder's own token account\./);
    const [bad] = await describeTransaction(
      wire(feePayer, [await refund(attacker)]),
      ctx,
    );
    expect(bad).toMatch(
      /WARNING: This sends money to an account that is NOT the funder's/,
    );
  });
});
