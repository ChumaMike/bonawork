import {
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getAddressDecoder,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signBytes,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { getTransferCheckedInstruction } from "@solana-program/token";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_SIZES,
  DEFAULT_PUBKEY,
  TrancheState,
  encodeEscrow,
  encodeTranche,
  findAssociatedTokenAddress,
  findEscrowAddresses,
  findReviewerPda,
  getVerifyTrancheInstruction,
  type EscrowAddresses,
} from "@/solana";

import {
  GuardianRejectedError,
  createEscrowService,
  type EscrowService,
} from "./escrow-service";
import { generateKeypairBytes, signerFromBytes } from "./keys";
import type { BonaNetwork } from "./network";
import { SolanaUnavailableError, withRetry, type BonaRpc } from "./rpc";

const h = (n: number) => new Uint8Array(32).fill(n);
const key = (n: number): Address => getAddressDecoder().decode(h(n));
const BLOCKHASH = blockhash(key(99));

let feepayer: KeyPairSigner;
let reviewer: KeyPairSigner;
let attacker: KeyPairSigner;
let ids: EscrowAddresses;
let service: EscrowService;
let sendTransaction: ReturnType<typeof vi.fn>;
const mint = key(8);
const funder = key(3);
const contractor = key(4);
const evidenceHash = h(20);
const matchHash = h(21);
const reviewHash = h(50);

function padded(data: Uint8Array, size: number) {
  const out = new Uint8Array(size);
  out.set(data);
  return out;
}

/** A fake RPC that answers only what the verify flow asks for. */
function mockRpc(accounts: Map<string, Uint8Array>) {
  const reply = <T>(value: T) => ({ send: async () => value });
  sendTransaction = vi.fn((wire: string) => {
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
    const sig = Object.values(tx.signatures)[0]!;
    return reply(getAddressDecoder().decode(sig.slice(0, 32)) as string);
  });
  return {
    getAccountInfo: (a: Address) => {
      const data = accounts.get(a);
      return reply({
        value: data
          ? { data: [getBase64Decoder().decode(data), "base64"], owner: key(7) }
          : null,
      });
    },
    getLatestBlockhash: () =>
      reply({ value: { blockhash: BLOCKHASH, lastValidBlockHeight: BigInt(1_000) } }),
    getBlockHeight: () => reply(BigInt(900)),
    sendTransaction,
    getSignatureStatuses: () =>
      reply({ value: [{ confirmationStatus: "confirmed", err: null }] }),
  } as unknown as BonaRpc;
}

beforeAll(async () => {
  feepayer = await signerFromBytes(generateKeypairBytes());
  reviewer = await signerFromBytes(generateKeypairBytes());
  attacker = await signerFromBytes(generateKeypairBytes());
  ids = await findEscrowAddresses(funder, h(42), mint);

  const accounts = new Map<string, Uint8Array>();
  accounts.set(
    ids.escrow,
    padded(
      encodeEscrow({
        caseHash: h(42),
        termsHash: h(43),
        funder,
        funderChallenger: DEFAULT_PUBKEY,
        contractor,
        school: key(5),
        reviewer: reviewer.address,
        mint,
        matchAuthority: key(10),
        disputeAuthority: key(11),
        totalAmount: BigInt(500_000),
        releasedAmount: BigInt(0),
        refundedAmount: BigInt(0),
        fundingDeadline: BigInt(100),
        challengeSeconds: 60,
        disputeSeconds: 3_600,
        funded: true,
        cancelled: false,
        bump: 255,
      }),
      ACCOUNT_SIZES.Escrow,
    ),
  );
  accounts.set(
    ids.tranche0,
    padded(
      encodeTranche({
        escrow: ids.escrow,
        index: 0,
        amount: BigInt(300_000),
        state: TrancheState.Claimed,
        revision: 1,
        verificationDeadline: BigInt(9_999_999_999),
        claimedAt: BigInt(1),
        verifiedAt: BigInt(0),
        challengeUntil: BigInt(0),
        disputedAt: BigInt(0),
        settledAt: BigInt(0),
        milestoneHash: h(30),
        evidenceHash,
        matchHash,
        reviewHash: new Uint8Array(32),
        disputeHash: new Uint8Array(32),
        resolutionHash: new Uint8Array(32),
        bump: 254,
      }),
      ACCOUNT_SIZES.Tranche,
    ),
  );

  const network: BonaNetwork = {
    cluster: "devnet",
    chainId: "solana:devnet",
    explorerBase: "https://explorer.solana.com",
    programId: key(1),
    mint,
    mintDecimals: 2,
    admin: key(12),
    match: key(10),
    dispute: key(11),
    feepayer: feepayer.address,
    treasury: key(13),
    keeper: key(14),
    demoReviewer: reviewer.address,
  };
  service = createEscrowService({
    rpc: mockRpc(accounts),
    network,
    signers: { feepayer },
  });
});

const decode = (wire: string) =>
  getTransactionDecoder().decode(getBase64Encoder().encode(wire));

async function signAs(signer: KeyPairSigner, wire: string) {
  return getBase64EncodedWireTransaction(
    await partiallySignTransaction([signer.keyPair], decode(wire)),
  );
}

function compile(instructions: Instruction[]) {
  return getBase64EncodedWireTransaction(
    compileTransaction(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(feepayer.address, m),
        (m) =>
          setTransactionMessageLifetimeUsingBlockhash(
            { blockhash: BLOCKHASH, lastValidBlockHeight: BigInt(1_000) },
            m,
          ),
        (m) => appendTransactionMessageInstructions(instructions, m),
      ),
    ),
  );
}

describe("prepare and submit a reviewer's verify transaction", () => {
  it("prepares an unsigned transaction that passes Bona Guardian", async () => {
    const prepared = await service.prepareVerifyTransaction({
      escrow: ids.escrow,
      index: 0,
      reviewer: reviewer.address,
      reviewHash,
    });
    expect(prepared.guardian.ok).toBe(true);
    expect(prepared.guardian.decoded?.feePayer).toBe(feepayer.address);
    expect(prepared.description.join(" ")).toMatch(/challenge window/);
    expect(prepared.expected.revision).toBe(1);
    const tx = decode(prepared.transaction);
    expect(Object.values(tx.signatures).every((s) => s === null)).toBe(true);
  });

  it("adds the feepayer signature and sends once the reviewer has signed", async () => {
    sendTransaction.mockClear();
    const prepared = await service.prepareVerifyTransaction({
      escrow: ids.escrow,
      index: 0,
      reviewer: reviewer.address,
      reviewHash,
    });
    const step = await service.submitSignedVerify({
      transaction: await signAs(reviewer, prepared.transaction),
      escrow: ids.escrow,
      index: 0,
      reviewer: reviewer.address,
      reviewHash,
    });
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    const sentTx = decode(sendTransaction.mock.calls[0][0] as string);
    expect(sentTx.signatures[feepayer.address]).toBeTruthy();
    expect(sentTx.signatures[reviewer.address]).toBeTruthy();
    expect(step.explorerUrl).toContain("cluster=devnet");
  });

  it("rejects a tampered transaction that also moves tokens, and sends nothing", async () => {
    sendTransaction.mockClear();
    const verify = getVerifyTrancheInstruction(
      {
        reviewer: reviewer.address,
        reviewerRecord: await findReviewerPda(reviewer.address),
        escrow: ids.escrow,
        tranche: ids.tranche0,
      },
      {
        expectedRevision: 1,
        expectedEvidenceHash: evidenceHash,
        expectedMatchHash: matchHash,
        reviewHash,
      },
    );
    const theft = getTransferCheckedInstruction({
      source: await findAssociatedTokenAddress(reviewer.address, mint),
      mint,
      destination: await findAssociatedTokenAddress(attacker.address, mint),
      authority: reviewer.address,
      amount: BigInt(100_000),
      decimals: 2,
    });
    const tampered = await signAs(reviewer, compile([verify, theft]));
    const attempt = service.submitSignedVerify({
      transaction: tampered,
      escrow: ids.escrow,
      index: 0,
      reviewer: reviewer.address,
    });
    await expect(attempt).rejects.toBeInstanceOf(GuardianRejectedError);
    await expect(attempt).rejects.toThrow(/move tokens/);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("rejects a verify for the wrong evidence and one the reviewer never signed", async () => {
    sendTransaction.mockClear();
    const wrongEvidence = getVerifyTrancheInstruction(
      {
        reviewer: reviewer.address,
        reviewerRecord: await findReviewerPda(reviewer.address),
        escrow: ids.escrow,
        tranche: ids.tranche0,
      },
      {
        expectedRevision: 1,
        expectedEvidenceHash: h(77),
        expectedMatchHash: matchHash,
        reviewHash,
      },
    );
    await expect(
      service.submitSignedVerify({
        transaction: await signAs(reviewer, compile([wrongEvidence])),
        escrow: ids.escrow,
        index: 0,
        reviewer: reviewer.address,
      }),
    ).rejects.toThrow(/not the ones you reviewed/);

    const prepared = await service.prepareVerifyTransaction({
      escrow: ids.escrow,
      index: 0,
      reviewer: reviewer.address,
      reviewHash,
    });
    // Never signed by the reviewer.
    await expect(
      service.submitSignedVerify({
        transaction: prepared.transaction,
        escrow: ids.escrow,
        index: 0,
        reviewer: reviewer.address,
      }),
    ).rejects.toThrow(/reviewer's signature is missing/);
    // Another wallet's signature placed in the reviewer's slot.
    const tx = decode(prepared.transaction);
    const forged = {
      ...tx,
      signatures: {
        ...tx.signatures,
        [reviewer.address]: await signBytes(attacker.keyPair.privateKey, tx.messageBytes),
      },
    };
    await expect(
      service.submitSignedVerify({
        transaction: getBase64EncodedWireTransaction(forged),
        escrow: ids.escrow,
        index: 0,
        reviewer: reviewer.address,
      }),
    ).rejects.toThrow(/does not match this transaction/);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses a reviewer who is not assigned to the escrow", async () => {
    await expect(
      service.prepareVerifyTransaction({
        escrow: ids.escrow,
        index: 0,
        reviewer: attacker.address,
        reviewHash,
      }),
    ).rejects.toThrow(/Only the reviewer assigned/);
  });
});

describe("withRetry", () => {
  it("retries transient failures and then reports the network as unavailable", async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toBeInstanceOf(
      SolanaUnavailableError,
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a program error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue({ InstructionError: [0, { Custom: 6022 }], message: "429" });
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
