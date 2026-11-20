import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import {
  AVALANCHE_CHAINS,
  CHAIN_STATUS_CODE,
  EVIDENCE_KIND_CODE,
  LedgerError,
  idToBytes32,
  type BlockchainReceipt,
  type ChainRole,
  type ChainStatus,
  type Hex32,
  type LedgerInfo,
  type LedgerPort,
  type RegistryEvent,
} from "@/shared";
import { bonaRegistryAbi } from "./abi";

export interface ViemLedgerConfig {
  rpcUrl: string;
  /** CAIP-2 id. Only Avalanche Fuji (`eip155:43113`) is accepted. */
  chainId: string;
  contractAddress: string;
  signers: Record<ChainRole, string>;
  /** How long to wait for the transaction to be mined before returning `pending`. */
  confirmTimeoutMs?: number;
}

const EXPLORERS: Record<string, { name: string; tx: string }> = {
  [AVALANCHE_CHAINS.fuji]: {
    name: "Avalanche Fuji C-Chain",
    tx: "https://testnet.snowtrace.io/tx/",
  },
};

const CHAIN_STATUS_BY_CODE = Object.fromEntries(
  Object.entries(CHAIN_STATUS_CODE).map(([name, code]) => [code, name]),
) as Record<number, ChainStatus>;

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

function toLedgerError(error: unknown, what: string): LedgerError {
  if (error instanceof LedgerError) return error;
  const name = revertName(error);
  if (name) return LedgerError.fromContract(name, `${what} was rejected by BonaRegistry`);
  const message = error instanceof Error ? error.message : String(error);
  return new LedgerError(
    "rpc_unavailable",
    null,
    `${what}: ledger unreachable (${message})`,
  );
}

type WriteFunction =
  | "registerReport"
  | "registerEvidence"
  | "acknowledgeReport"
  | "recordInterimProtection"
  | "claimRepair"
  | "verifyRepair"
  | "disputeRepair";

/**
 * `LedgerPort` backed by the real BonaRegistry contract on Avalanche Fuji.
 * Holds one wallet per on-chain role; the role is fixed by the operation, so
 * nothing in a request can choose which key signs.
 */
export function createViemLedger(config: ViemLedgerConfig): LedgerPort {
  if (config.chainId !== AVALANCHE_CHAINS.fuji) {
    throw new LedgerError(
      "not_configured",
      null,
      `Unsupported LEDGER_CHAIN_ID ${config.chainId}; only ${AVALANCHE_CHAINS.fuji} (Fuji) is allowed.`,
    );
  }
  const chain = avalancheFuji;
  const address = config.contractAddress as Hex;
  const transport = http(config.rpcUrl);
  const publicClient: PublicClient<Transport, Chain> = createPublicClient({
    chain,
    transport,
  });
  const accounts: Record<ChainRole, Account> = {
    registrar: privateKeyToAccount(config.signers.registrar as Hex),
    school_admin: privateKeyToAccount(config.signers.school_admin as Hex),
    reviewer: privateKeyToAccount(config.signers.reviewer as Hex),
  };
  if (new Set(Object.values(accounts).map((a) => a.address.toLowerCase())).size !== 3) {
    throw new LedgerError(
      "not_configured",
      null,
      "Registrar, school admin and reviewer must be three different keys.",
    );
  }
  const wallets: Record<ChainRole, WalletClient<Transport, Chain, Account>> = {
    registrar: createWalletClient({ chain, transport, account: accounts.registrar }),
    school_admin: createWalletClient({
      chain,
      transport,
      account: accounts.school_admin,
    }),
    reviewer: createWalletClient({ chain, transport, account: accounts.reviewer }),
  };
  const confirmTimeoutMs = config.confirmTimeoutMs ?? 15_000;
  const explorer = EXPLORERS[config.chainId];
  const info: LedgerInfo = {
    chainId: config.chainId,
    contractAddress: config.contractAddress,
    networkName: explorer.name,
    explorerTxUrl: (txId) => `${explorer.tx}${txId}`,
    live: true,
  };

  const bytes32 = (id: string) => idToBytes32(id) as Hex;

  async function write(
    signer: ChainRole,
    functionName: WriteFunction,
    args: readonly unknown[],
    event: RegistryEvent,
    what: string,
  ): Promise<BlockchainReceipt> {
    let hash: Hex;
    try {
      // Simulate first: a revert surfaces as a decoded custom error instead of
      // a mined-but-failed transaction that costs gas.
      const { request } = await publicClient.simulateContract({
        address,
        abi: bonaRegistryAbi,
        functionName,
        // viem's overloads cannot narrow a dynamic function name.
        args: args as never,
        account: accounts[signer],
      });
      hash = await wallets[signer].writeContract(request);
    } catch (error) {
      throw toLedgerError(error, what);
    }
    return refresh(hash.toLowerCase() as Hex32, event, confirmTimeoutMs);
  }

  async function refresh(
    txId: Hex32,
    event: RegistryEvent,
    timeoutMs: number,
  ): Promise<BlockchainReceipt> {
    const pending: BlockchainReceipt = {
      chainId: config.chainId,
      contractAddress: config.contractAddress,
      txId,
      status: "pending",
      blockNumber: null,
      blockTimestamp: null,
      event,
    };
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
        ...pending,
        status: mined.status === "success" ? "confirmed" : "failed",
        blockNumber: Number(mined.blockNumber),
        blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      };
    } catch {
      // Not mined yet, or the RPC is down: stay pending and try again later.
      // A confirmation is never reported without a mined receipt.
      return pending;
    }
  }

  return {
    info: () => info,

    registerReport: ({ reportId, institutionId, commitment }) =>
      write(
        "registrar",
        "registerReport",
        [bytes32(reportId), bytes32(institutionId), commitment],
        "ReportRegistered",
        "Registering the report",
      ),

    registerEvidence: ({ reportId, digest, kind }) =>
      write(
        kind === "report" ? "registrar" : kind === "repair" ? "school_admin" : "reviewer",
        "registerEvidence",
        [bytes32(reportId), digest, EVIDENCE_KIND_CODE[kind]],
        "EvidenceRegistered",
        "Registering evidence",
      ),

    acknowledgeReport: ({ reportId }) =>
      write(
        "school_admin",
        "acknowledgeReport",
        [bytes32(reportId)],
        "ReportAcknowledged",
        "Acknowledging the report",
      ),

    recordInterimProtection: ({ reportId, commitment }) =>
      write(
        "school_admin",
        "recordInterimProtection",
        [bytes32(reportId), commitment],
        "InterimProtectionRecorded",
        "Recording interim protection",
      ),

    claimRepair: ({ reportId, commitment }) =>
      write(
        "school_admin",
        "claimRepair",
        [bytes32(reportId), commitment],
        "RepairClaimed",
        "Recording the repair claim",
      ),

    verifyRepair: ({ reportId, reviewCommitment }) =>
      write(
        "reviewer",
        "verifyRepair",
        [bytes32(reportId), reviewCommitment],
        "RepairVerified",
        "Independent verification",
      ),

    disputeRepair: ({ reportId, reviewCommitment }) =>
      write(
        "reviewer",
        "disputeRepair",
        [bytes32(reportId), reviewCommitment],
        "RepairDisputed",
        "Independent dispute",
      ),

    async probeVerify({ reportId, as }) {
      // A throw-away commitment: the call is simulated, never sent.
      const probe = `0x${"ab".repeat(32)}` as Hex;
      try {
        await publicClient.simulateContract({
          address,
          abi: bonaRegistryAbi,
          functionName: "verifyRepair",
          args: [bytes32(reportId), probe],
          account: accounts[as],
        });
        return { allowed: true, revert: null };
      } catch (error) {
        const name = revertName(error);
        if (name) {
          const known = LedgerError.fromContract(name, "probe").contractError;
          if (known) return { allowed: false, revert: known };
        }
        throw toLedgerError(error, "Probing verification");
      }
    },

    async statusOf(reportId) {
      try {
        const code = await publicClient.readContract({
          address,
          abi: bonaRegistryAbi,
          functionName: "statusOf",
          args: [bytes32(reportId)],
        });
        return CHAIN_STATUS_BY_CODE[Number(code)] ?? "none";
      } catch (error) {
        throw toLedgerError(error, "Reading the report status");
      }
    },

    getReceipt: (txId, event) => refresh(txId, event, 0),
  };
}
