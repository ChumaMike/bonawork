/**
 * Checks a funder's Pollar transfer before the escrow is activated.
 *
 * The funder signs in with email on our page (Pollar sends a 6-digit code) and
 * Pollar's embedded Solana wallet sends BDZAR to the escrow with
 * `sendPayment({ chain: "SOLANA", destination: <escrow PDA>, mint, amount })`.
 * Pollar derives the destination's associated token account, which is the
 * escrow's vault. The browser then hands us the signature. Nothing the browser
 * says is trusted: this reads the transaction from Solana and checks it.
 *
 * Accepted only when all hold:
 * - the transaction exists at `confirmed` or `finalized` and did not fail;
 * - the token being moved is the BDZAR mint;
 * - the vault (ATA of the escrow PDA for that mint) gained exactly `amount`;
 * - a token account owned by the funder's wallet lost exactly `amount`;
 * - an SPL transfer in it moved `amount` from that account to the vault, signed
 *   by the funder's wallet.
 *
 * The coordinator calls `activateFunding` only after this says `ok`. Activate
 * itself also checks the vault balance on-chain, so this is a second lock, not
 * the only one.
 */
import { address, type Address } from "@solana/kit";
import { findAssociatedTokenAddress } from "@/solana/program";
import { solanaRpcUrl } from "../solana/rpc";

/* ------------------------------ RPC shapes ------------------------------ */

type TokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
};

type ParsedInstruction = {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
};

/** The parts of `getTransaction` (jsonParsed) the check reads. */
export type ParsedTransaction = {
  slot: number;
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    innerInstructions?: { index: number; instructions: ParsedInstruction[] }[];
  } | null;
  transaction: {
    message: {
      accountKeys: ({ pubkey: string; signer?: boolean } | string)[];
      instructions: ParsedInstruction[];
    };
  };
};

export type SignatureStatus = "processed" | "confirmed" | "finalized" | null;

export interface FundingRpc {
  getTransaction(signature: string): Promise<ParsedTransaction | null>;
  getSignatureStatus(signature: string): Promise<SignatureStatus>;
}

/** Plain JSON-RPC over fetch against SOLANA_RPC_URL (devnet by default). */
export function jsonRpcFundingRpc(url = solanaRpcUrl(), doFetch: typeof fetch = fetch): FundingRpc {
  async function call<T>(method: string, params: unknown[]): Promise<T> {
    const response = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`rpc ${response.status}`);
    const body = (await response.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? "rpc error");
    return body.result as T;
  }
  return {
    getTransaction: (signature) =>
      call<ParsedTransaction | null>("getTransaction", [
        signature,
        { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
      ]),
    async getSignatureStatus(signature) {
      const result = await call<{ value: ({ confirmationStatus?: SignatureStatus } | null)[] }>(
        "getSignatureStatuses",
        [[signature], { searchTransactionHistory: true }],
      );
      return result.value[0]?.confirmationStatus ?? null;
    },
  };
}

/* -------------------------------- The check ------------------------------- */

export interface FundingExpectation {
  signature: string;
  /** The funder's Pollar wallet (the owner, not its token account). */
  funderWallet: string;
  /** The escrow PDA. Its BDZAR associated token account is the vault. */
  escrow: string;
  /** The BDZAR mint from config/solana-devnet.json. */
  mint: string;
  /** Exact amount in base units (cents: BDZAR has 2 decimals). */
  amount: bigint;
}

export type FundingRejection =
  | "not_found"
  | "not_confirmed"
  | "failed"
  | "wrong_mint"
  | "wrong_destination"
  | "wrong_amount"
  | "wrong_source"
  | "no_transfer"
  | "network";

export type FundingCheck =
  | { ok: true; vault: string; slot: number; status: "confirmed" | "finalized" }
  | { ok: false; reason: FundingRejection; message: string };

const MESSAGES: Record<FundingRejection, string> = {
  not_found: "This transaction is not on Solana devnet yet. Wait a few seconds and check again.",
  not_confirmed: "This transaction is not confirmed yet. Check again in a few seconds.",
  failed: "This transaction failed on Solana, so nothing moved.",
  wrong_mint: "This transfer is not in BDZAR, the escrow's sandbox rand.",
  wrong_destination: "This transfer did not go to this escrow's vault.",
  wrong_amount: "This transfer is not the escrow's full amount.",
  wrong_source: "This transfer did not come from the funder's wallet.",
  no_transfer: "This transaction has no token transfer from the funder to the vault.",
  network: "Solana devnet could not be reached. Nothing was changed. Try again.",
};

const reject = (reason: FundingRejection): FundingCheck => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

const keyOf = (k: { pubkey: string } | string) => (typeof k === "string" ? k : k.pubkey);

function delta(tx: ParsedTransaction, accountIndex: number, mint: string): bigint {
  const pick = (list?: TokenBalance[]) =>
    BigInt(list?.find((b) => b.accountIndex === accountIndex && b.mint === mint)?.uiTokenAmount.amount ?? "0");
  return pick(tx.meta?.postTokenBalances) - pick(tx.meta?.preTokenBalances);
}

function allInstructions(tx: ParsedTransaction): ParsedInstruction[] {
  return [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions),
  ];
}

/** Amount of a parsed `transfer` / `transferChecked` in base units, or null. */
function transferAmount(info: Record<string, unknown>): bigint | null {
  const raw =
    typeof info.amount === "string"
      ? info.amount
      : (info.tokenAmount as { amount?: unknown } | undefined)?.amount;
  return typeof raw === "string" && /^\d+$/.test(raw) ? BigInt(raw) : null;
}

/** Read the transaction from Solana and check it moved exactly `amount` BDZAR from the funder to the vault. */
export async function verifyPollarFunding(
  rpc: FundingRpc,
  expected: FundingExpectation,
): Promise<FundingCheck> {
  let mint: Address;
  let vault: Address;
  let funder: Address;
  try {
    mint = address(expected.mint);
    funder = address(expected.funderWallet);
    vault = await findAssociatedTokenAddress(address(expected.escrow), mint);
  } catch {
    return reject("wrong_destination");
  }
  if (expected.amount <= BigInt(0)) return reject("wrong_amount");

  let tx: ParsedTransaction | null;
  let status: SignatureStatus;
  try {
    [tx, status] = await Promise.all([
      rpc.getTransaction(expected.signature),
      rpc.getSignatureStatus(expected.signature),
    ]);
  } catch {
    return reject("network");
  }
  if (!tx) return reject("not_found");
  if (status !== "confirmed" && status !== "finalized") return reject("not_confirmed");
  if (!tx.meta || tx.meta.err !== null) return reject("failed");

  const keys = tx.transaction.message.accountKeys.map(keyOf);
  const balances = [...(tx.meta.preTokenBalances ?? []), ...(tx.meta.postTokenBalances ?? [])];
  const vaultIndex = keys.indexOf(vault);

  // The vault must be in the transaction and gain exactly the amount of our mint.
  if (vaultIndex < 0) {
    return reject(balances.some((b) => b.mint !== mint) ? "wrong_mint" : "wrong_destination");
  }
  const vaultGain = delta(tx, vaultIndex, mint);
  if (vaultGain === BigInt(0)) {
    const otherMint = balances.some((b) => b.accountIndex === vaultIndex && b.mint !== mint);
    return reject(otherMint || balances.every((b) => b.mint !== mint) ? "wrong_mint" : "wrong_destination");
  }
  if (vaultGain !== expected.amount) return reject("wrong_amount");

  // The source: a token account of our mint, owned by the funder, that lost exactly the amount.
  const sourceIndexes = [
    ...new Set(
      balances
        .filter((b) => b.mint === mint && b.owner === funder && b.accountIndex !== vaultIndex)
        .map((b) => b.accountIndex),
    ),
  ];
  const source = sourceIndexes.find((i) => delta(tx, i, mint) === -expected.amount);
  if (source === undefined) return reject("wrong_source");
  const sourceKey = keys[source];

  // And an SPL transfer that says so, signed by the funder's wallet.
  const moved = allInstructions(tx)
    .filter((ix) => ix.program === "spl-token")
    .filter((ix) => ix.parsed?.type === "transfer" || ix.parsed?.type === "transferChecked")
    .filter((ix) => {
      const info = ix.parsed?.info ?? {};
      const authority = info.authority ?? info.multisigAuthority;
      return (
        info.source === sourceKey &&
        info.destination === vault &&
        authority === funder &&
        (info.mint === undefined || info.mint === mint)
      );
    })
    .reduce((sum, ix) => sum + (transferAmount(ix.parsed?.info ?? {}) ?? BigInt(0)), BigInt(0));
  if (moved === BigInt(0)) return reject("no_transfer");
  if (moved !== expected.amount) return reject("wrong_amount");

  return { ok: true, vault, slot: tx.slot, status };
}
