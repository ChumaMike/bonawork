import { LedgerError, type LedgerPort } from "@/shared";
import type { Env } from "@/server/env";
import { createMemoryLedger } from "@/server/ledger/memory";
import { createViemLedger } from "./viem-ledger";

export { createViemLedger, revertName } from "./viem-ledger";

export type LedgerMode = "avalanche" | "memory" | "off";

/** Which ledger the environment selects. */
export function ledgerMode(env: Env): LedgerMode {
  if (env.LEDGER_MODE === "off") return "off";
  if (env.LEDGER_MODE === "memory") return "memory";
  if (
    env.LEDGER_RPC_URL &&
    env.LEDGER_CHAIN_ID &&
    env.LEDGER_CONTRACT_ADDRESS &&
    env.LEDGER_REGISTRAR_PRIVATE_KEY &&
    env.LEDGER_SCHOOL_ADMIN_PRIVATE_KEY &&
    env.LEDGER_REVIEWER_PRIVATE_KEY
  ) {
    return "avalanche";
  }
  return "memory";
}

/**
 * Build the ledger for this process. With a complete Avalanche configuration
 * it is the real BonaRegistry; otherwise the clearly-labelled in-memory ledger,
 * or nothing at all (`LEDGER_MODE=off`), in which case every write throws
 * `not_configured` and records simply keep a null receipt.
 */
export function createLedger(env: Env): LedgerPort {
  switch (ledgerMode(env)) {
    case "avalanche":
      return createViemLedger({
        rpcUrl: env.LEDGER_RPC_URL!,
        chainId: env.LEDGER_CHAIN_ID,
        contractAddress: env.LEDGER_CONTRACT_ADDRESS!,
        signers: {
          registrar: env.LEDGER_REGISTRAR_PRIVATE_KEY!,
          school_admin: env.LEDGER_SCHOOL_ADMIN_PRIVATE_KEY!,
          reviewer: env.LEDGER_REVIEWER_PRIVATE_KEY!,
        },
      });
    case "memory":
      return createMemoryLedger();
    case "off":
      return unconfiguredLedger();
  }
}

function unconfiguredLedger(): LedgerPort {
  const refuse = async (): Promise<never> => {
    throw new LedgerError(
      "not_configured",
      null,
      "The ledger is not configured (LEDGER_MODE=off).",
    );
  };
  return {
    info: () => ({
      chainId: "none",
      contractAddress: "",
      networkName: "No ledger configured",
      explorerTxUrl: () => null,
      live: false,
    }),
    registerReport: refuse,
    registerEvidence: refuse,
    acknowledgeReport: refuse,
    recordInterimProtection: refuse,
    claimRepair: refuse,
    verifyRepair: refuse,
    disputeRepair: refuse,
    probeVerify: refuse,
    statusOf: async () => "none",
    getReceipt: refuse,
  };
}
