import {
  BaseError,
  ContractFunctionRevertedError,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
} from "viem";
import {
  AVALANCHE_CHAINS,
  CHAIN_STATUS_CODE,
  LedgerError,
  type ChainStatus,
} from "@/shared";

/*
 * What the two chain adapters share: BonaRegistry (`viem-ledger.ts`) and the
 * Bona Chain factory suite (`chain-ledger.ts`). Both run on Avalanche Fuji
 * only, decode a revert into the contract's own error name, and never report a
 * confirmation without a mined receipt.
 */

export const EXPLORERS: Record<string, { name: string; tx: string }> = {
  [AVALANCHE_CHAINS.fuji]: {
    name: "Avalanche Fuji C-Chain",
    tx: "https://testnet.snowtrace.io/tx/",
  },
};

/** How long a write waits to be mined before it returns `pending`. */
export const DEFAULT_CONFIRM_TIMEOUT_MS = 15_000;

export const CHAIN_STATUS_BY_CODE = Object.fromEntries(
  Object.entries(CHAIN_STATUS_CODE).map(([name, code]) => [code, name]),
) as Record<number, ChainStatus>;

/** Testnet only: anything but Fuji is refused before a client is built. */
export function requireFuji(chainId: string): void {
  if (chainId !== AVALANCHE_CHAINS.fuji) {
    throw new LedgerError(
      "not_configured",
      null,
      `Unsupported LEDGER_CHAIN_ID ${chainId}; only ${AVALANCHE_CHAINS.fuji} (Fuji) is allowed.`,
    );
  }
}

/** The custom error name a viem call failed with, or null if it did not revert. */
export function revertName(error: unknown): string | null {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return revert.data?.errorName ?? revert.reason ?? "reverted";
    }
  }
  return null;
}

/**
 * A revert becomes a `LedgerError` named after the contract's error; anything
 * else means the ledger could not be reached. `contract` names the contract in
 * the message.
 */
export function toLedgerError(
  error: unknown,
  what: string,
  contract: string,
): LedgerError {
  if (error instanceof LedgerError) return error;
  const name = revertName(error);
  if (name) return LedgerError.fromContract(name, `${what} was rejected by ${contract}`);
  const message = error instanceof Error ? error.message : String(error);
  return new LedgerError(
    "rpc_unavailable",
    null,
    `${what}: ledger unreachable (${message})`,
  );
}

export interface MinedTransaction {
  status: "confirmed" | "failed";
  blockNumber: number;
  blockTimestamp: string;
  /** The contract the transaction was sent to. */
  to: string | null;
}

/**
 * The mined result of a transaction, or null when it is not mined yet or the
 * RPC is down. With `timeoutMs` above zero it waits that long to be mined;
 * with zero it looks once. A confirmation is never reported without a mined
 * receipt: the caller keeps the write `pending` on null and asks again later.
 */
export async function readMined(
  publicClient: PublicClient<Transport, Chain>,
  txId: string,
  timeoutMs: number,
): Promise<MinedTransaction | null> {
  try {
    const mined =
      timeoutMs > 0
        ? await publicClient.waitForTransactionReceipt({
            hash: txId as Hex,
            timeout: timeoutMs,
          })
        : await publicClient.getTransactionReceipt({ hash: txId as Hex });
    const block = await publicClient.getBlock({ blockNumber: mined.blockNumber });
    return {
      status: mined.status === "success" ? "confirmed" : "failed",
      blockNumber: Number(mined.blockNumber),
      blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      to: mined.to ?? null,
    };
  } catch {
    return null;
  }
}
