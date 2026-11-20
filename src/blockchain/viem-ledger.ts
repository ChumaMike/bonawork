import {
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
  EVIDENCE_KIND_CODE,
  LedgerError,
  idToBytes32,
  type BlockchainReceipt,
  type ChainRole,
  type Hex32,
  type LedgerEvent,
  type LedgerInfo,
  type LedgerPort,
  type OperationsChainRole,
  type RegistryEvent,
} from "@/shared";
import { bonaRegistryAbi } from "./abi";
import {
  CHAIN_STATUS_BY_CODE,
  DEFAULT_CONFIRM_TIMEOUT_MS,
  EXPLORERS,
  readMined,
  requireFuji,
  revertName,
  toLedgerError as toLedgerErrorFor,
} from "./chain-common";

export { revertName };

export interface ViemLedgerConfig {
  rpcUrl: string;
  /** CAIP-2 id. Only Avalanche Fuji (`eip155:43113`) is accepted. */
  chainId: string;
  contractAddress: string;
  signers: Record<OperationsChainRole, string>;
  /** How long to wait for the transaction to be mined before returning `pending`. */
  confirmTimeoutMs?: number;
}

const toLedgerError = (error: unknown, what: string) =>
  toLedgerErrorFor(error, what, "BonaRegistry");

type WriteFunction =
  | "registerReport"
  | "registerEvidence"
  | "acknowledgeReport"
  | "recordInterimProtection"
  | "claimRepair"
  | "verifyRepair"
  | "disputeRepair";

/** BonaRegistry has no finance functions: every finance write is refused. */
const financeOff = async (): Promise<never> => {
  throw new LedgerError(
    "not_configured",
    null,
    "Finance steps are not configured on this ledger.",
  );
};

/**
 * `LedgerPort` backed by the real BonaRegistry contract on Avalanche Fuji.
 * Holds one wallet per on-chain role; the role is fixed by the operation, so
 * nothing in a request can choose which key signs.
 */
export function createViemLedger(config: ViemLedgerConfig): LedgerPort {
  requireFuji(config.chainId);
  const chain = avalancheFuji;
  const address = config.contractAddress as Hex;
  const transport = http(config.rpcUrl);
  const publicClient: PublicClient<Transport, Chain> = createPublicClient({
    chain,
    transport,
  });
  const accounts: Record<OperationsChainRole, Account> = {
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
  const isOperationsRole = (role: ChainRole): role is OperationsChainRole =>
    Object.hasOwn(accounts, role);
  const wallets: Record<OperationsChainRole, WalletClient<Transport, Chain, Account>> = {
    registrar: createWalletClient({ chain, transport, account: accounts.registrar }),
    school_admin: createWalletClient({
      chain,
      transport,
      account: accounts.school_admin,
    }),
    reviewer: createWalletClient({ chain, transport, account: accounts.reviewer }),
  };
  const confirmTimeoutMs = config.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS;
  const explorer = EXPLORERS[config.chainId];
  const info: LedgerInfo = {
    chainId: config.chainId,
    contractAddress: config.contractAddress,
    networkName: explorer.name,
    explorerTxUrl: (txId) => `${explorer.tx}${txId}`,
    live: true,
    finance: "off",
  };

  const bytes32 = (id: string) => idToBytes32(id) as Hex;

  async function write(
    signer: OperationsChainRole,
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
    event: LedgerEvent,
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
    // Not mined yet, or the RPC is down: stay pending and try again later.
    // A confirmation is never reported without a mined receipt.
    const mined = await readMined(publicClient, txId, timeoutMs);
    if (!mined) return pending;
    return {
      ...pending,
      status: mined.status,
      blockNumber: mined.blockNumber,
      blockTimestamp: mined.blockTimestamp,
    };
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
      // A finance role holds no key here and no role on BonaRegistry, which
      // refuses any caller that is not the reviewer.
      if (!isOperationsRole(as)) return { allowed: false, revert: "Unauthorized" };
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

    approveWorkOrder: financeOff,
    acknowledgeWorkOrder: financeOff,
    submitInvoice: financeOff,
    recordGoodsReceipt: financeOff,
    recordMatchResult: financeOff,
    openPaymentDispute: financeOff,
    closePaymentDispute: financeOff,
    authoriseRelease: financeOff,
    probeRelease: financeOff,
  };
}
