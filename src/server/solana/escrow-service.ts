/**
 * BonaWork escrow on Solana devnet, for the server.
 *
 * Who signs what is fixed here, never by the request:
 *   - treasury: mints sandbox demo rand (BDZAR) for a cash-in. No real money.
 *   - admin:    creates an escrow (pays its rent); feepayer pays the network fee.
 *   - contractor + match key: claim a payment stage. Until contractors sign
 *     with their own wallets the contractor key is a server-held DEMO key.
 *   - reviewer: signs verify_tranche in their own wallet. The server only
 *     prepares the transaction, checks it with Bona Guardian, and after the
 *     reviewer signs, checks it again and adds the feepayer signature.
 *   - keeper:   release_tranche / refund_expired once the rules allow it.
 *
 * Money operations never fall back to the in-memory ledger: if Solana cannot be
 * reached they throw SolanaUnavailableError.
 */
import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  isFullySignedTransaction,
  verifySignature,
  type Address,
  type KeyPairSigner,
  type Signature,
  type Transaction,
} from "@solana/kit";
import {
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToCheckedInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";

import {
  DEFAULT_PUBKEY,
  TrancheState,
  checkReleaseTransaction,
  checkVerifyTransaction,
  decodeEscrow,
  decodeTranche,
  describeTransaction,
  findAssociatedTokenAddress,
  findConfigPda,
  findEscrowAddresses,
  findReviewerPda,
  findTranchePda,
  findVaultAddress,
  formatRand,
  getActivateFundingInstruction,
  getClaimTrancheInstruction,
  getCreateEscrowInstruction,
  getRefundExpiredInstruction,
  getReleaseTrancheInstruction,
  getVerifyTrancheInstruction,
  toHex,
  type Bytes32,
  type CreateEscrowArgs,
  type EscrowAccount,
  type EscrowAddresses,
  type Finding,
  type GuardianResult,
  type TrancheAccount,
} from "@/solana";

import {
  loadSigners,
  PLATFORM_KEY_ROLES,
  KEY_ENV,
  type KeyRole,
  type ServerSigners,
} from "./keys";
import { devnetConfig, explorerAddress, explorerTx, type BonaNetwork } from "./network";
import { checkRefundTransaction } from "./refund-check";
import {
  buildSignSend,
  buildTransaction,
  getSolanaRpc,
  sendAndConfirm,
  signWith,
  simulate,
  throwSimulationFailure,
  withRetry,
  type BonaRpc,
} from "./rpc";

// --------------------------------------------------------------------- errors

/** A server key this step needs is not configured. */
export class MissingKeyError extends Error {
  constructor(role: KeyRole) {
    super(`${KEY_ENV[role]} is not set, so this step cannot be signed.`);
    this.name = "MissingKeyError";
  }
}

/** Bona Guardian found something wrong with a transaction. Nothing was signed or sent. */
export class GuardianRejectedError extends Error {
  readonly findings: Finding[];
  constructor(findings: Finding[]) {
    super(
      `Bona Guardian stopped this transaction: ${findings
        .filter((f) => f.severity === "error")
        .map((f) => f.message)
        .join(" ")}`,
    );
    this.name = "GuardianRejectedError";
    this.findings = findings;
  }
}

/** The request does not fit the escrow as it is on-chain (checked before sending). */
export class EscrowStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscrowStateError";
  }
}

// ---------------------------------------------------------------------- types

export type TrancheIndex = 0 | 1;

export type SentStep = { signature: Signature; explorerUrl: string };

export type CreateEscrowInput = Omit<CreateEscrowArgs, "funderChallenger"> & {
  /** Optional challenge wallet of the funder. */
  funderChallenger?: Address;
};

export type OnChainTranche = {
  address: Address;
  index: TrancheIndex;
  state: keyof typeof TrancheState;
  account: TrancheAccount;
};

export type OnChainCase = {
  escrow: Address;
  account: EscrowAccount;
  tranches: [OnChainTranche, OnChainTranche];
  vault: { address: Address; amount: bigint; label: string };
  links: { escrow: string; vault: string; mint: string };
};

export type PreparedVerify = {
  /** Base64 wire transaction, unsigned. Fee payer: the platform feepayer. */
  transaction: string;
  lastValidBlockHeight: bigint;
  guardian: GuardianResult;
  /** Plain-English lines for the reviewer to read before signing. */
  description: string[];
  expected: {
    revision: number;
    evidenceHash: string;
    matchHash: string;
    reviewHash: string;
  };
};

export type EscrowServiceDeps = {
  rpc: BonaRpc;
  network: BonaNetwork;
  signers: ServerSigners;
};

/** Largest sandbox cash-in: R1 000 000.00. */
export const MAX_SANDBOX_CASH_IN_CENTS = BigInt(100_000_000);

// -------------------------------------------------------------------- service

export function createEscrowService({ rpc, network, signers }: EscrowServiceDeps) {
  const mint = network.mint;
  const decimals = network.mintDecimals;

  function signer(role: KeyRole): KeyPairSigner {
    const s = signers[role];
    if (!s) throw new MissingKeyError(role);
    const pinned: Address | undefined = {
      admin: network.admin,
      match: network.match,
      dispute: network.dispute,
      feepayer: network.feepayer,
      treasury: network.treasury,
      keeper: network.keeper,
    }[role as string];
    if (pinned && pinned !== s.address) {
      throw new Error(
        `${KEY_ENV[role]} does not match the ${role} address in config/solana-devnet.json.`,
      );
    }
    return s;
  }

  const sent = (signature: Signature): SentStep => ({
    signature,
    explorerUrl: explorerTx(signature, network.explorerBase),
  });

  async function readAccount(a: Address): Promise<Uint8Array | null> {
    const { value } = await withRetry(() =>
      rpc.getAccountInfo(a, { encoding: "base64", commitment: "confirmed" }).send(),
    );
    return value ? Uint8Array.from(getBase64Encoder().encode(value.data[0])) : null;
  }

  async function readEscrow(escrow: Address): Promise<EscrowAccount> {
    const data = await readAccount(escrow);
    if (!data) throw new EscrowStateError("There is no escrow at this address.");
    return decodeEscrow(data);
  }

  async function readTranche(escrow: Address, index: TrancheIndex) {
    const address = await findTranchePda(escrow, index);
    const data = await readAccount(address);
    if (!data) throw new EscrowStateError("This payment stage does not exist.");
    return { address, account: decodeTranche(data) };
  }

  async function tokenBalance(account: Address): Promise<bigint> {
    try {
      const { value } = await withRetry(() =>
        rpc.getTokenAccountBalance(account, { commitment: "confirmed" }).send(),
      );
      return BigInt(value.amount);
    } catch (error) {
      if ((await readAccount(account)) === null) return BigInt(0);
      throw error;
    }
  }

  /** Sandbox cash-in: the treasury mints demo rand to the funder's token account. */
  async function sandboxCashIn(funderWallet: Address, amountCents: bigint | number) {
    const amount = BigInt(amountCents);
    if (amount <= BigInt(0) || amount > MAX_SANDBOX_CASH_IN_CENTS) {
      throw new EscrowStateError(
        "A sandbox cash-in must be between R0.01 and R1 000 000.",
      );
    }
    const feepayer = signer("feepayer");
    const treasury = signer("treasury");
    const tokenAccount = await findAssociatedTokenAddress(funderWallet, mint);
    const signature = await buildSignSend(
      rpc,
      feepayer,
      [
        getCreateAssociatedTokenIdempotentInstruction({
          payer: feepayer,
          ata: tokenAccount,
          owner: funderWallet,
          mint,
        }),
        getMintToCheckedInstruction({
          mint,
          token: tokenAccount,
          mintAuthority: treasury,
          amount,
          decimals,
        }),
      ],
      [treasury],
    );
    return {
      ...sent(signature),
      sandbox: true as const,
      label: `Sandbox cash-in of ${formatRand(amount)} demo rand. No real money moved.`,
      tokenAccount,
      amount,
    };
  }

  /** Creates the escrow, its two payment stages and its vault. Idempotent per (funder, case). */
  async function createEscrow(input: CreateEscrowInput) {
    const admin = signer("admin");
    const feepayer = signer("feepayer");
    const addresses = await findEscrowAddresses(input.funder, input.caseHash, mint);
    if (await readAccount(addresses.escrow)) {
      return {
        addresses,
        alreadyExisted: true as const,
        signature: null,
        explorerUrl: null,
      };
    }
    const ix = getCreateEscrowInstruction(
      {
        admin: admin.address,
        config: await findConfigPda(),
        reviewerRecord: await findReviewerPda(input.reviewer),
        ...addresses,
        mint,
      },
      { ...input, funderChallenger: input.funderChallenger ?? DEFAULT_PUBKEY },
    );
    const signature = await buildSignSend(rpc, feepayer, [ix], [admin]);
    return { addresses, alreadyExisted: false as const, ...sent(signature) };
  }

  /**
   * DEMO ONLY: moves the funder's demo rand into the vault, signed by a
   * server-held demo funder key. Real funders sign this in their own wallet.
   */
  async function fundEscrowAsDemoFunder(escrow: Address, funder: KeyPairSigner) {
    const account = await readEscrow(escrow);
    if (account.funder !== funder.address) {
      throw new EscrowStateError("This key is not the escrow's funder.");
    }
    const feepayer = signer("feepayer");
    const source = await findAssociatedTokenAddress(funder.address, mint);
    const vault = await findVaultAddress(escrow, mint);
    const signature = await buildSignSend(
      rpc,
      feepayer,
      [
        getTransferCheckedInstruction({
          source,
          mint,
          destination: vault,
          authority: funder,
          amount: account.totalAmount,
          decimals,
        }),
      ],
      [funder],
    );
    return sent(signature);
  }

  /** Marks the escrow funded once the vault holds the full amount. Anyone may call it. */
  async function activateFunding(escrow: Address) {
    const account = await readEscrow(escrow);
    if (account.funded) throw new EscrowStateError("This escrow is already funded.");
    const vault = await findVaultAddress(escrow, account.mint);
    const signature = await buildSignSend(rpc, signer("feepayer"), [
      getActivateFundingInstruction({ escrow, vault, mint: account.mint }),
    ]);
    return sent(signature);
  }

  /**
   * Claims a payment stage with fingerprints of the evidence and the
   * three-way match. Signed by the contractor and the match key.
   */
  async function claimTranche(input: {
    escrow: Address;
    index: TrancheIndex;
    evidenceHash: Bytes32;
    matchHash: Bytes32;
    /** Defaults to the server-held DEMO contractor key. */
    contractor?: KeyPairSigner;
  }) {
    const contractor = input.contractor ?? signer("demoContractor");
    const account = await readEscrow(input.escrow);
    if (account.contractor !== contractor.address) {
      throw new EscrowStateError("This key is not the escrow's contractor.");
    }
    const tranche = await readTranche(input.escrow, input.index);
    const ix = getClaimTrancheInstruction(
      {
        contractor: contractor.address,
        matchAuthority: signer("match").address,
        escrow: input.escrow,
        tranche: tranche.address,
        priorTranche:
          input.index === 1 ? await findTranchePda(input.escrow, 0) : undefined,
      },
      {
        expectedRevision: tranche.account.revision,
        evidenceHash: input.evidenceHash,
        matchHash: input.matchHash,
      },
    );
    const signature = await buildSignSend(
      rpc,
      signer("feepayer"),
      [ix],
      [contractor, signer("match")],
    );
    return { ...sent(signature), revision: tranche.account.revision + 1 };
  }

  async function verifyExpectation(
    escrow: Address,
    index: TrancheIndex,
    reviewer: Address,
    reviewHash?: Bytes32,
  ) {
    const account = await readEscrow(escrow);
    if (account.reviewer !== reviewer) {
      throw new EscrowStateError(
        "Only the reviewer assigned to this repair can verify it.",
      );
    }
    const tranche = await readTranche(escrow, index);
    if (tranche.account.state !== TrancheState.Claimed) {
      throw new EscrowStateError(
        "There is no claim waiting for review on this payment stage.",
      );
    }
    return {
      account,
      tranche,
      expectation: {
        feePayer: signer("feepayer").address,
        reviewer,
        escrow,
        tranche: tranche.address,
        revision: tranche.account.revision,
        evidenceHash: tranche.account.evidenceHash,
        matchHash: tranche.account.matchHash,
        reviewHash,
      },
    };
  }

  /**
   * Builds the verify transaction for the reviewer to sign in their own wallet.
   * The platform feepayer pays the fee; it signs only after the reviewer has.
   */
  async function prepareVerifyTransaction(input: {
    escrow: Address;
    index: TrancheIndex;
    reviewer: Address;
    reviewHash: Bytes32;
  }): Promise<PreparedVerify> {
    const { account, tranche, expectation } = await verifyExpectation(
      input.escrow,
      input.index,
      input.reviewer,
      input.reviewHash,
    );
    const ix = getVerifyTrancheInstruction(
      {
        reviewer: input.reviewer,
        reviewerRecord: await findReviewerPda(input.reviewer),
        escrow: input.escrow,
        tranche: tranche.address,
      },
      {
        expectedRevision: tranche.account.revision,
        expectedEvidenceHash: tranche.account.evidenceHash,
        expectedMatchHash: tranche.account.matchHash,
        reviewHash: input.reviewHash,
      },
    );
    const built = await buildTransaction(rpc, expectation.feePayer, [ix]);
    const wire = getBase64EncodedWireTransaction(built.transaction);
    const guardian = await checkVerifyTransaction(wire, expectation);
    const description = await describeTransaction(wire, {
      tranches: { [tranche.address]: tranche.account },
      escrows: { [input.escrow]: account },
    });
    return {
      transaction: wire,
      lastValidBlockHeight: built.lastValidBlockHeight,
      guardian,
      description,
      expected: {
        revision: tranche.account.revision,
        evidenceHash: toHex(tranche.account.evidenceHash),
        matchHash: toHex(tranche.account.matchHash),
        reviewHash: toHex(input.reviewHash),
      },
    };
  }

  /**
   * Takes the reviewer-signed transaction back, checks it again against the
   * chain as it is now, checks the reviewer's signature, then adds the
   * feepayer signature and sends it.
   */
  async function submitSignedVerify(input: {
    transaction: string;
    escrow: Address;
    index: TrancheIndex;
    reviewer: Address;
    reviewHash?: Bytes32;
  }): Promise<SentStep> {
    const { expectation } = await verifyExpectation(
      input.escrow,
      input.index,
      input.reviewer,
      input.reviewHash,
    );
    const guardian = await checkVerifyTransaction(input.transaction, expectation);
    if (!guardian.ok) throw new GuardianRejectedError(guardian.findings);

    const tx: Transaction = getTransactionDecoder().decode(
      getBase64Encoder().encode(input.transaction),
    );
    const reviewerSignature = tx.signatures[input.reviewer];
    const valid =
      !!reviewerSignature &&
      (await verifySignature(
        await getPublicKeyFromAddress(input.reviewer),
        reviewerSignature,
        tx.messageBytes,
      ));
    if (!valid) {
      throw new GuardianRejectedError([
        {
          code: "MISSING_SIGNER",
          severity: "error",
          message:
            "The reviewer's signature is missing or does not match this transaction.",
        },
      ]);
    }
    const signed = await signWith(tx, [signer("feepayer")]);
    if (!isFullySignedTransaction(signed)) {
      throw new GuardianRejectedError([
        {
          code: "MISSING_SIGNER",
          severity: "error",
          message: "A required signature is still missing.",
        },
      ]);
    }
    const height = await withRetry(() =>
      rpc.getBlockHeight({ commitment: "confirmed" }).send(),
    );
    const signature = await sendAndConfirm(rpc, {
      transaction: signed,
      lastValidBlockHeight: height + BigInt(150),
    });
    return sent(signature);
  }

  /** Keeper: pays a verified stage to the contractor once the challenge window has ended. */
  async function releaseTranche(escrow: Address, index: TrancheIndex): Promise<SentStep> {
    const keeper = signer("keeper");
    const account = await readEscrow(escrow);
    const tranche = await findTranchePda(escrow, index);
    const ix = getReleaseTrancheInstruction({
      caller: keeper.address,
      escrow,
      tranche,
      vault: await findVaultAddress(escrow, account.mint),
      mint: account.mint,
      contractor: account.contractor,
      contractorAta: await findAssociatedTokenAddress(account.contractor, account.mint),
    });
    const built = await buildTransaction(rpc, keeper.address, [ix]);
    const guardian = await checkReleaseTransaction(
      getBase64EncodedWireTransaction(built.transaction),
      { feePayer: keeper.address, escrow, tranche, escrowAccount: account },
    );
    if (!guardian.ok) throw new GuardianRejectedError(guardian.findings);
    return sent(await signSimulateSend(built, keeper));
  }

  /** Keeper: returns an expired, blocked or timed-out stage to the funder. */
  async function refundExpired(escrow: Address, index: TrancheIndex): Promise<SentStep> {
    const keeper = signer("keeper");
    const account = await readEscrow(escrow);
    const tranche = await findTranchePda(escrow, index);
    const priorTranche = index === 1 ? await findTranchePda(escrow, 0) : undefined;
    const ix = getRefundExpiredInstruction({
      caller: keeper.address,
      escrow,
      tranche,
      priorTranche,
      vault: await findVaultAddress(escrow, account.mint),
      mint: account.mint,
      funder: account.funder,
      funderAta: await findAssociatedTokenAddress(account.funder, account.mint),
    });
    const built = await buildTransaction(rpc, keeper.address, [ix]);
    const guardian = await checkRefundTransaction(
      getBase64EncodedWireTransaction(built.transaction),
      { feePayer: keeper.address, escrow, tranche, priorTranche, escrowAccount: account },
    );
    if (!guardian.ok) throw new GuardianRejectedError(guardian.findings);
    return sent(await signSimulateSend(built, keeper));
  }

  async function signSimulateSend(
    built: Awaited<ReturnType<typeof buildTransaction>>,
    keeper: KeyPairSigner,
  ): Promise<Signature> {
    const transaction = await signWith(built.transaction, [keeper]);
    const sim = await simulate(rpc, transaction);
    if (!sim.ok) throwSimulationFailure(sim);
    return sendAndConfirm(rpc, { ...built, transaction });
  }

  /** The escrow, both payment stages and the vault balance as they are on-chain. */
  async function getCaseOnChain(escrow: Address): Promise<OnChainCase> {
    const account = await readEscrow(escrow);
    const [t0, t1] = await Promise.all([readTranche(escrow, 0), readTranche(escrow, 1)]);
    const vault = await findVaultAddress(escrow, account.mint);
    const amount = await tokenBalance(vault);
    const stage = (t: typeof t0, index: TrancheIndex): OnChainTranche => ({
      address: t.address,
      index,
      state: TrancheState[t.account.state] as keyof typeof TrancheState,
      account: t.account,
    });
    return {
      escrow,
      account,
      tranches: [stage(t0, 0), stage(t1, 1)],
      vault: { address: vault, amount, label: formatRand(amount) },
      links: {
        escrow: explorerAddress(escrow, network.explorerBase),
        vault: explorerAddress(vault, network.explorerBase),
        mint: explorerAddress(account.mint, network.explorerBase),
      },
    };
  }

  /** Demo rand held by a wallet's token account (0 when it has none). */
  async function walletBalance(owner: Address): Promise<bigint> {
    return tokenBalance(await findAssociatedTokenAddress(owner, mint));
  }

  return {
    network,
    sandboxCashIn,
    createEscrow,
    fundEscrowAsDemoFunder,
    activateFunding,
    claimTranche,
    prepareVerifyTransaction,
    submitSignedVerify,
    releaseTranche,
    refundExpired,
    getCaseOnChain,
    walletBalance,
  };
}

export type EscrowService = ReturnType<typeof createEscrowService>;
export type { EscrowAddresses };

let cachedService: Promise<EscrowService> | null = null;

/** The process-wide service: devnet config, SOLANA_RPC_URL, keys from the environment. */
export function getEscrowService(): Promise<EscrowService> {
  cachedService ??= loadSigners([...PLATFORM_KEY_ROLES, "demoContractor"]).then(
    (signers) =>
      createEscrowService({ rpc: getSolanaRpc(), network: devnetConfig(), signers }),
  );
  cachedService.catch(() => {
    cachedService = null;
  });
  return cachedService;
}
