import { LedgerError, type LedgerPort } from "@/shared";
import type { Env } from "@/server/env";
import { createMemoryLedger } from "@/server/ledger/memory";
import { createChainLedger } from "./chain-ledger";
import { createViemLedger } from "./viem-ledger";

export { createChainLedger } from "./chain-ledger";
export { createViemLedger, revertName } from "./viem-ledger";

export type LedgerMode = "avalanche" | "memory" | "off";

/** Which contracts an Avalanche ledger talks to. */
export type LedgerContracts = "bona_chain" | "bona_registry";

/**
 * Which contracts the environment selects, or null when Avalanche is not fully
 * configured. Both need the RPC, the chain id and the three report-flow keys.
 *
 * - `bona_chain`: LEDGER_FACTORY_ADDRESS is set. The factory's institution
 *   contracts are used and LEDGER_CONTRACT_ADDRESS is ignored.
 * - `bona_registry`: only the earlier LEDGER_CONTRACT_ADDRESS is set.
 */
export function ledgerContracts(env: Env): LedgerContracts | null {
  if (
    !env.LEDGER_RPC_URL ||
    !env.LEDGER_CHAIN_ID ||
    !env.LEDGER_REGISTRAR_PRIVATE_KEY ||
    !env.LEDGER_SCHOOL_ADMIN_PRIVATE_KEY ||
    !env.LEDGER_REVIEWER_PRIVATE_KEY
  ) {
    return null;
  }
  if (env.LEDGER_FACTORY_ADDRESS) return "bona_chain";
  if (env.LEDGER_CONTRACT_ADDRESS) return "bona_registry";
  return null;
}

/** Which ledger the environment selects. */
export function ledgerMode(env: Env): LedgerMode {
  if (env.LEDGER_MODE === "off") return "off";
  if (env.LEDGER_MODE === "memory") return "memory";
  return ledgerContracts(env) ? "avalanche" : "memory";
}

/**
 * Build the ledger for this process. With a complete Avalanche configuration
 * it is the real chain: the Bona Chain contracts when a factory address is set
 * (finance is `live` with all seven keys and `LEDGER_FINANCE_MODE` not `off`),
 * else the earlier BonaRegistry (no finance). Otherwise the clearly-labelled
 * in-memory ledger, or nothing at all (`LEDGER_MODE=off`), in which case every
 * write throws `not_configured` and records simply keep a null receipt.
 */
export function createLedger(env: Env): LedgerPort {
  switch (ledgerMode(env)) {
    case "avalanche":
      if (ledgerContracts(env) === "bona_chain") {
        return createChainLedger({
          rpcUrl: env.LEDGER_RPC_URL!,
          chainId: env.LEDGER_CHAIN_ID,
          factoryAddress: env.LEDGER_FACTORY_ADDRESS!,
          // Named only so the adapter can refuse to ever write to it.
          legacyContractAddress: env.LEDGER_CONTRACT_ADDRESS,
          financeMode: env.LEDGER_FINANCE_MODE,
          signers: {
            registrar: env.LEDGER_REGISTRAR_PRIVATE_KEY!,
            school_admin: env.LEDGER_SCHOOL_ADMIN_PRIVATE_KEY!,
            reviewer: env.LEDGER_REVIEWER_PRIVATE_KEY!,
            buyer: env.LEDGER_BUYER_PRIVATE_KEY,
            supplier: env.LEDGER_SUPPLIER_PRIVATE_KEY,
            receiver: env.LEDGER_RECEIVER_PRIVATE_KEY,
            payment_approver: env.LEDGER_PAYMENT_APPROVER_PRIVATE_KEY,
          },
        });
      }
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
      finance: "off",
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
    approveWorkOrder: refuse,
    acknowledgeWorkOrder: refuse,
    submitInvoice: refuse,
    recordGoodsReceipt: refuse,
    recordMatchResult: refuse,
    openPaymentDispute: refuse,
    closePaymentDispute: refuse,
    authoriseRelease: refuse,
    probeRelease: refuse,
  };
}
