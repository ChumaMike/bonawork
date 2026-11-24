/**
 * Solana RPC access for the server: one client, small retries with backoff for
 * the rate-limited public endpoint, and a polling confirm that needs no
 * websocket. Money operations never fall back to the in-memory ledger: when
 * the network cannot be reached they fail with `SolanaUnavailableError`.
 */
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Base64EncodedWireTransaction,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type Signature,
  type SolanaRpcApi,
  type Transaction,
} from "@solana/kit";

import { bonaErrorMessage, getBonaError, type BonaErrorName } from "@/solana";

export const DEFAULT_SOLANA_RPC_URL = "https://api.devnet.solana.com";

export type BonaRpc = Rpc<SolanaRpcApi>;

export function solanaRpcUrl(source: Record<string, string | undefined> = process.env) {
  return source.SOLANA_RPC_URL?.trim() || DEFAULT_SOLANA_RPC_URL;
}

let cachedRpc: { url: string; rpc: BonaRpc } | null = null;

/** Process-wide RPC client for SOLANA_RPC_URL (devnet by default). */
export function getSolanaRpc(url = solanaRpcUrl()): BonaRpc {
  if (cachedRpc?.url !== url) cachedRpc = { url, rpc: createSolanaRpc(url) };
  return cachedRpc.rpc;
}

// --------------------------------------------------------------------- errors

/** The network could not be reached or did not answer. Nothing is known to have changed. */
export class SolanaUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      "The Solana network is unavailable right now. No money moved. Try again in a minute." +
        (detail ? ` (${detail})` : ""),
    );
    this.name = "SolanaUnavailableError";
  }
}

/** The BonaWork program refused the transaction. `message` is plain English. */
export class BonaProgramFailure extends Error {
  readonly code: number;
  readonly errorName: BonaErrorName | null;
  readonly logs: readonly string[];
  readonly signature?: Signature;
  constructor(code: number, logs: readonly string[] = [], signature?: Signature) {
    super(bonaErrorMessage(code));
    this.name = "BonaProgramFailure";
    this.code = code;
    this.errorName = getBonaError(code)?.name ?? null;
    this.logs = logs;
    this.signature = signature;
  }
}

/** The transaction failed on-chain for a reason that is not a BonaWork error. */
export class SolanaTransactionError extends Error {
  readonly logs: readonly string[];
  readonly signature?: Signature;
  constructor(detail: string, logs: readonly string[] = [], signature?: Signature) {
    super(`The network rejected the transaction: ${detail}`);
    this.name = "SolanaTransactionError";
    this.logs = logs;
    this.signature = signature;
  }
}

/**
 * Finds a custom program error code anywhere in an RPC error or a transaction
 * error value: `{ InstructionError: [i, { Custom: n }] }`, or a kit SolanaError
 * whose context carries `code` for an instruction custom error.
 */
export function findCustomErrorCode(value: unknown, depth = 0): number | null {
  if (value == null || depth > 6 || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.Custom === "number") return obj.Custom;
  if (typeof obj.Custom === "bigint") return Number(obj.Custom);
  const ctx = obj.context as Record<string, unknown> | undefined;
  if (
    ctx &&
    (ctx.__code === 4615026 || /custom program error/i.test(String(obj.message ?? ""))) &&
    (typeof ctx.code === "number" || typeof ctx.code === "bigint")
  ) {
    return Number(ctx.code);
  }
  for (const key of ["InstructionError", "err", "cause", "context"]) {
    const found = findCustomErrorCode(obj[key], depth + 1);
    if (found !== null) return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCustomErrorCode(item, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Network-level trouble worth retrying: timeouts, 429/5xx, dropped sockets. */
export function isTransientRpcError(error: unknown): boolean {
  if (findCustomErrorCode(error) !== null) return false;
  const status = Number(
    (error as { context?: { statusCode?: unknown } })?.context?.statusCode,
  );
  if (status === 429 || status >= 500) return true;
  const text = [
    (error as { message?: unknown })?.message,
    (error as { cause?: { message?: unknown; code?: unknown } })?.cause?.message,
    (error as { cause?: { code?: unknown } })?.cause?.code,
  ]
    .map((v) => String(v ?? ""))
    .join(" ");
  return /\b429\b|too many requests|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|socket hang up|timed? ?out|aborted/i.test(
    text,
  );
}

export type RetryOptions = { attempts?: number; baseDelayMs?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs an RPC call with exponential backoff on transient failures. When every
 * attempt fails for a network reason, throws `SolanaUnavailableError`.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 4, baseDelayMs = 600 }: RetryOptions = {},
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientRpcError(error)) throw error;
      last = error;
      if (i < attempts - 1) await sleep(baseDelayMs * 2 ** i);
    }
  }
  throw new SolanaUnavailableError((last as Error | undefined)?.message?.slice(0, 120));
}

// ----------------------------------------------------------------- building

export type BuiltTransaction = {
  transaction: Transaction;
  lastValidBlockHeight: bigint;
};

/** Compiles a v0 transaction with a fresh blockhash. Nobody has signed it yet. */
export async function buildTransaction(
  rpc: BonaRpc,
  feePayer: Address,
  instructions: readonly Instruction[],
): Promise<BuiltTransaction> {
  const { value: latest } = await withRetry(() =>
    rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
  );
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return {
    transaction: compileTransaction(message),
    lastValidBlockHeight: latest.lastValidBlockHeight,
  };
}

/** Adds signatures from server-held keys. Other signatures are kept. */
export async function signWith(
  transaction: Transaction,
  signers: readonly KeyPairSigner[],
): Promise<Transaction> {
  return partiallySignTransaction(
    signers.map((s) => s.keyPair),
    transaction,
  );
}

export type SimulationResult = {
  ok: boolean;
  logs: string[];
  unitsConsumed?: bigint;
  /** Set when the BonaWork program (or another) returned a custom error. */
  errorCode: number | null;
  error: unknown;
};

/** Simulates without checking signatures, so a partly signed transaction can be tried. */
export async function simulate(
  rpc: BonaRpc,
  transaction: Transaction,
): Promise<SimulationResult> {
  const wire = getBase64EncodedWireTransaction(transaction);
  const { value } = await withRetry(() =>
    rpc
      .simulateTransaction(wire, {
        encoding: "base64",
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: "confirmed",
      })
      .send(),
  );
  return {
    ok: value.err === null,
    logs: [...(value.logs ?? [])],
    unitsConsumed: value.unitsConsumed ?? undefined,
    errorCode: value.err === null ? null : findCustomErrorCode(value.err),
    error: value.err,
  };
}

/** Throws the plain-English failure for a failed simulation. */
export function throwSimulationFailure(sim: SimulationResult): never {
  if (sim.errorCode !== null) throw new BonaProgramFailure(sim.errorCode, sim.logs);
  throw new SolanaTransactionError(stringifyError(sim.error), sim.logs);
}

function stringifyError(error: unknown): string {
  try {
    return JSON.stringify(error, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(error);
  }
}

export type ConfirmOptions = { timeoutMs?: number; pollMs?: number };

/**
 * Polls signature status until the transaction is confirmed, fails, or its
 * blockhash expires. No websocket needed.
 */
export async function confirmSignature(
  rpc: BonaRpc,
  signature: Signature,
  lastValidBlockHeight: bigint,
  { timeoutMs = 90_000, pollMs = 1_200 }: ConfirmOptions = {},
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { value } = await withRetry(() =>
      rpc.getSignatureStatuses([signature], { searchTransactionHistory: false }).send(),
    );
    const status = value[0];
    if (status) {
      if (status.err) {
        const code = findCustomErrorCode(status.err);
        if (code !== null) throw new BonaProgramFailure(code, [], signature);
        throw new SolanaTransactionError(stringifyError(status.err), [], signature);
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return;
      }
    } else {
      const height = await withRetry(() =>
        rpc.getBlockHeight({ commitment: "confirmed" }).send(),
      );
      if (height > lastValidBlockHeight) {
        throw new SolanaTransactionError(
          "the transaction expired before it was confirmed",
          [],
          signature,
        );
      }
    }
    await sleep(pollMs);
  }
  throw new SolanaUnavailableError(`no confirmation for ${signature} in time`);
}

/**
 * Sends a fully signed transaction (preflight on) and waits for confirmation.
 * Program errors surface as `BonaProgramFailure` with the plain message.
 */
export async function sendAndConfirm(
  rpc: BonaRpc,
  built: BuiltTransaction,
  options?: ConfirmOptions,
): Promise<Signature> {
  const signature = getSignatureFromTransaction(built.transaction);
  const wire: Base64EncodedWireTransaction = getBase64EncodedWireTransaction(
    built.transaction,
  );
  try {
    await withRetry(() =>
      rpc
        .sendTransaction(wire, {
          encoding: "base64",
          preflightCommitment: "confirmed",
          maxRetries: BigInt(3),
        })
        .send(),
    );
  } catch (error) {
    if (error instanceof SolanaUnavailableError) throw error;
    const code = findCustomErrorCode(error);
    const logs =
      ((error as { context?: { logs?: string[] } })?.context?.logs as string[]) ?? [];
    if (code !== null) throw new BonaProgramFailure(code, logs);
    throw new SolanaTransactionError((error as Error)?.message ?? String(error), logs);
  }
  await confirmSignature(rpc, signature, built.lastValidBlockHeight, options);
  return signature;
}

/** Build, sign with server keys, send and confirm. `signers[0]` need not be the fee payer. */
export async function buildSignSend(
  rpc: BonaRpc,
  feePayer: KeyPairSigner,
  instructions: readonly Instruction[],
  otherSigners: readonly KeyPairSigner[] = [],
): Promise<Signature> {
  const built = await buildTransaction(rpc, feePayer.address, instructions);
  const signers = [
    feePayer,
    ...otherSigners.filter((s) => s.address !== feePayer.address),
  ];
  const transaction = await signWith(built.transaction, signers);
  return sendAndConfirm(rpc, { ...built, transaction });
}
