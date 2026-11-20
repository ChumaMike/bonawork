import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Abi,
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
  CHAIN_ROLE_CODE,
  EVIDENCE_KIND_CODE,
  FINANCE_CHAIN_ROLES,
  LedgerError,
  idToBytes32,
  type BlockchainReceipt,
  type ChainRole,
  type ChainStatus,
  type ContractErrorName,
  type FinanceChainRole,
  type FinanceEvent,
  type FinanceRef,
  type Hex32,
  type LedgerEvent,
  type LedgerInfo,
  type LedgerPort,
  type OperationsChainRole,
  type RegistryEvent,
} from "@/shared";
import {
  bonaChainFactoryAbi,
  institutionFinanceAbi,
  institutionOperationsAbi,
} from "./abi";
import {
  CHAIN_STATUS_BY_CODE,
  DEFAULT_CONFIRM_TIMEOUT_MS,
  EXPLORERS,
  readMined,
  requireFuji,
  revertName,
  toLedgerError,
} from "./chain-common";

export interface ChainLedgerConfig {
  rpcUrl: string;
  /** CAIP-2 id. Only Avalanche Fuji (`eip155:43113`) is accepted. */
  chainId: string;
  /** The BonaChainFactory. Every other address is read from it. */
  factoryAddress: string;
  /**
   * One key per on-chain role, all different. The three operations keys are
   * required; finance is `live` only when all four finance keys are present.
   */
  signers: Record<OperationsChainRole, string> &
    Partial<Record<FinanceChainRole, string>>;
  /** `off` refuses every finance write with `not_configured`. */
  financeMode?: "auto" | "off";
  /**
   * The earlier single BonaRegistry, if one is still configured. This adapter
   * never sends anything to it.
   */
  legacyContractAddress?: string;
  /** How long to wait for the transaction to be mined before returning `pending`. */
  confirmTimeoutMs?: number;
  /** Replaces the HTTP transport. For tests. */
  transport?: Transport;
}

/** The two contracts the factory created for one institution. */
interface Institution {
  operations: Hex;
  finance: Hex;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Which contract of an institution a call goes to. */
const TARGETS = {
  operations: { abi: institutionOperationsAbi as Abi, name: "InstitutionOperations" },
  finance: { abi: institutionFinanceAbi as Abi, name: "InstitutionFinance" },
} as const;
type TargetKind = keyof typeof TARGETS;

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** An unused, non-zero fingerprint for a simulated call that is never sent. */
function probeCommitment(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  bytes[0] |= 0x80;
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * `LedgerPort` backed by the Bona Chain contracts on Avalanche Fuji: one
 * BonaChainFactory, and for every institution an InstitutionOperations and an
 * InstitutionFinance contract that the factory created.
 *
 * Each call is routed by institution: the factory is asked once for the
 * institution's two addresses (`institutionOf`) and the answer is kept. An
 * institution the factory does not know gets no write at all.
 *
 * Holds one wallet per on-chain role. The role that signs is fixed by the
 * operation, so nothing in a request can choose which key signs. Every write
 * is simulated first, so a refusal arrives as the contract's own error name
 * rather than as a mined, failed transaction.
 */
export function createChainLedger(config: ChainLedgerConfig): LedgerPort {
  requireFuji(config.chainId);
  const chain = avalancheFuji;
  const factory = config.factoryAddress as Hex;
  const transport = config.transport ?? http(config.rpcUrl);
  const publicClient: PublicClient<Transport, Chain> = createPublicClient({
    chain,
    transport,
  });

  const financeKeysPresent = FINANCE_CHAIN_ROLES.every((role) => config.signers[role]);
  const financeLive = config.financeMode !== "off" && financeKeysPresent;

  const accounts: Partial<Record<ChainRole, Account>> = {};
  const wallets: Partial<Record<ChainRole, WalletClient<Transport, Chain, Account>>> = {};
  for (const role of Object.keys(CHAIN_ROLE_CODE) as ChainRole[]) {
    const key = config.signers[role];
    if (!key) continue;
    const account = privateKeyToAccount(key as Hex);
    accounts[role] = account;
    wallets[role] = createWalletClient({ chain, transport, account });
  }
  const addresses = Object.values(accounts).map((a) => a.address.toLowerCase());
  if (new Set(addresses).size !== addresses.length) {
    throw new LedgerError(
      "not_configured",
      null,
      "Every ledger role must sign with a different key.",
    );
  }
  if (
    config.legacyContractAddress &&
    sameAddress(config.legacyContractAddress, factory)
  ) {
    throw new LedgerError(
      "not_configured",
      null,
      "LEDGER_FACTORY_ADDRESS must be the BonaChainFactory, not the earlier BonaRegistry.",
    );
  }

  const confirmTimeoutMs = config.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS;
  const explorer = EXPLORERS[config.chainId];
  const info: LedgerInfo = {
    chainId: config.chainId,
    contractAddress: config.factoryAddress,
    networkName: explorer.name,
    explorerTxUrl: (txId) => `${explorer.tx}${txId}`,
    live: true,
    finance: financeLive ? "live" : "off",
  };

  const bytes32 = (id: string) => idToBytes32(id) as Hex;

  /* ------------------------------ routing -------------------------------- */

  /** Institutions the factory has confirmed, by bytes32 id. Kept for the process. */
  const institutions = new Map<Hex, Institution>();
  /** Lookups in flight, so concurrent calls ask the factory once. */
  const lookups = new Map<Hex, Promise<Institution>>();
  /** Which institution holds each report this process has seen. */
  const reportHome = new Map<Hex, Hex>();
  /** The contract each transaction sent by this process went to. */
  const sentTo = new Map<string, string>();

  async function lookUp(institution: Hex): Promise<Institution> {
    let found: readonly [Hex, Hex];
    try {
      found = await publicClient.readContract({
        address: factory,
        abi: bonaChainFactoryAbi,
        functionName: "institutionOf",
        args: [institution],
      });
    } catch (error) {
      throw toLedgerError(error, "Looking up the institution", "BonaChainFactory");
    }
    const [operations, finance] = found;
    if (sameAddress(operations, ZERO_ADDRESS) || sameAddress(finance, ZERO_ADDRESS)) {
      throw LedgerError.fromContract(
        "InstitutionNotFound",
        "the Bona Chain factory has no contracts for this institution",
      );
    }
    return { operations, finance };
  }

  /** The institution's contracts, from the cache or from the factory. Unknown: refused. */
  function resolveKey(key: Hex): Promise<Institution> {
    const known = institutions.get(key);
    if (known) return Promise.resolve(known);
    let lookup = lookups.get(key);
    if (!lookup) {
      lookup = lookUp(key)
        .then((found) => {
          // Only a confirmed institution is kept: one created later must be found later.
          institutions.set(key, found);
          return found;
        })
        .finally(() => lookups.delete(key));
      lookups.set(key, lookup);
    }
    return lookup;
  }
  const resolve = (institutionId: string) => resolveKey(bytes32(institutionId));

  async function reportStatusAt(operations: Hex, reportId: Hex): Promise<ChainStatus> {
    const code = await publicClient.readContract({
      address: operations,
      abi: institutionOperationsAbi,
      functionName: "statusOf",
      args: [reportId],
    });
    return CHAIN_STATUS_BY_CODE[Number(code)] ?? "none";
  }

  /**
   * The institution that holds a report. With `institutionId` it is a cache
   * hit or one factory read. Without it (an older caller), the factory's
   * institutions are searched for the one whose operations contract knows the
   * report; null when none does.
   */
  async function home(
    reportId: string,
    institutionId: string | undefined,
  ): Promise<Institution | null> {
    const report = bytes32(reportId);
    if (institutionId) {
      const found = await resolve(institutionId);
      reportHome.set(report, bytes32(institutionId));
      return found;
    }
    const remembered = reportHome.get(report);
    if (remembered) return resolveKey(remembered);
    try {
      const count = await publicClient.readContract({
        address: factory,
        abi: bonaChainFactoryAbi,
        functionName: "institutionCount",
      });
      for (let index = 0; index < Number(count); index++) {
        const id = await publicClient.readContract({
          address: factory,
          abi: bonaChainFactoryAbi,
          functionName: "institutionIdAt",
          args: [BigInt(index)],
        });
        const candidate = await resolveKey(id);
        if ((await reportStatusAt(candidate.operations, report)) !== "none") {
          reportHome.set(report, id);
          return candidate;
        }
      }
    } catch (error) {
      throw toLedgerError(error, "Finding the report's institution", "BonaChainFactory");
    }
    return null;
  }

  async function operationsOf(
    reportId: string,
    institutionId: string | undefined,
  ): Promise<Hex> {
    const found = await home(reportId, institutionId);
    if (!found) {
      throw LedgerError.fromContract(
        "ReportNotFound",
        "no institution on the Bona Chain factory holds this report",
      );
    }
    return found.operations;
  }

  /* ------------------------------- writes -------------------------------- */

  function signer(role: ChainRole) {
    const account = accounts[role];
    const wallet = wallets[role];
    if (!account || !wallet) {
      throw new LedgerError(
        "not_configured",
        null,
        `No ledger key is configured for the ${role} role.`,
      );
    }
    return { account, wallet };
  }

  /** The last line of defence: nothing is ever sent to the earlier BonaRegistry. */
  function refuseLegacy(address: Hex) {
    if (
      config.legacyContractAddress &&
      sameAddress(address, config.legacyContractAddress)
    ) {
      throw new LedgerError(
        "not_configured",
        null,
        "The Bona Chain adapter does not write to LEDGER_CONTRACT_ADDRESS (the earlier BonaRegistry).",
      );
    }
  }

  async function simulate(
    kind: TargetKind,
    address: Hex,
    role: ChainRole,
    functionName: string,
    args: readonly unknown[],
  ) {
    refuseLegacy(address);
    return publicClient.simulateContract({
      address,
      abi: TARGETS[kind].abi,
      functionName,
      args,
      account: signer(role).account,
    });
  }

  async function write(
    kind: TargetKind,
    address: Hex,
    role: ChainRole,
    functionName: string,
    args: readonly unknown[],
    event: LedgerEvent,
    what: string,
  ): Promise<BlockchainReceipt> {
    let hash: Hex;
    try {
      // Simulate first: a revert surfaces as a decoded custom error instead of
      // a mined-but-failed transaction that costs gas.
      const { request } = await simulate(kind, address, role, functionName, args);
      hash = await signer(role).wallet.writeContract(request);
    } catch (error) {
      throw toLedgerError(error, what, TARGETS[kind].name);
    }
    const txId = hash.toLowerCase() as Hex32;
    sentTo.set(txId, address);
    return refresh(txId, event, address, confirmTimeoutMs);
  }

  /**
   * `contractAddress` is the contract this process sent the transaction to,
   * or null when another process sent it. Then the chain is asked: the mined
   * receipt, or the transaction itself while it waits, names the contract.
   */
  async function refresh(
    txId: Hex32,
    event: LedgerEvent,
    contractAddress: string | null,
    timeoutMs: number,
  ): Promise<BlockchainReceipt> {
    const receipt = (address: string | null): BlockchainReceipt => ({
      chainId: config.chainId,
      // Only an unreachable RPC leaves the address unknown; the receipt is then
      // still pending and is refreshed again before anyone relies on it.
      contractAddress: address ?? config.factoryAddress,
      txId,
      status: "pending",
      blockNumber: null,
      blockTimestamp: null,
      event,
    });
    // Not mined yet, or the RPC is down: stay pending and try again later.
    // A confirmation is never reported without a mined receipt.
    const mined = await readMined(publicClient, txId, timeoutMs);
    if (!mined) return receipt(contractAddress ?? (await recipientOf(txId)));
    return {
      ...receipt(contractAddress ?? (mined.to ? getAddress(mined.to) : null)),
      status: mined.status,
      blockNumber: mined.blockNumber,
      blockTimestamp: mined.blockTimestamp,
    };
  }

  /** The contract a not-yet-mined transaction was sent to, if the RPC knows it. */
  async function recipientOf(txId: Hex32): Promise<string | null> {
    try {
      const sent = await publicClient.getTransaction({ hash: txId as Hex });
      return sent.to ? getAddress(sent.to) : null;
    } catch {
      return null;
    }
  }

  /** A write to the operations contract of the report's institution. */
  async function operationsWrite(
    input: { reportId: string; institutionId?: string },
    role: OperationsChainRole,
    functionName: string,
    args: readonly unknown[],
    event: RegistryEvent,
    what: string,
  ): Promise<BlockchainReceipt> {
    const address = await operationsOf(input.reportId, input.institutionId);
    return write("operations", address, role, functionName, args, event, what);
  }

  function requireFinance() {
    if (!financeLive) {
      throw new LedgerError(
        "not_configured",
        null,
        config.financeMode === "off"
          ? "Finance steps are switched off on this ledger (LEDGER_FINANCE_MODE=off)."
          : "Finance steps are not configured on this ledger: a finance key is missing.",
      );
    }
  }

  /** A write to the finance contract of the order's institution. */
  async function financeWrite(
    ref: FinanceRef,
    role: ChainRole,
    functionName: string,
    args: readonly unknown[],
    event: FinanceEvent,
    what: string,
  ): Promise<BlockchainReceipt> {
    requireFinance();
    const { finance } = await resolve(ref.institutionId);
    return write("finance", finance, role, functionName, args, event, what);
  }

  /** Turn a simulated call into the probe answer: allowed, or the contract's error name. */
  async function probe(
    run: () => Promise<unknown>,
    what: string,
    contract: string,
  ): Promise<{ allowed: boolean; revert: ContractErrorName | null }> {
    try {
      await run();
      return { allowed: true, revert: null };
    } catch (error) {
      const name = error instanceof LedgerError ? error.contractError : revertName(error);
      // Only an error the contracts declare is an answer. Anything else is a failure.
      const revert = name ? LedgerError.fromContract(name, what).contractError : null;
      if (revert) return { allowed: false, revert };
      throw toLedgerError(error, what, contract);
    }
  }

  return {
    info: () => info,

    async registerReport({ reportId, institutionId, commitment }) {
      const { operations } = await resolve(institutionId);
      reportHome.set(bytes32(reportId), bytes32(institutionId));
      // InstitutionOperations serves one institution: there is no school id argument.
      return write(
        "operations",
        operations,
        "registrar",
        "registerReport",
        [bytes32(reportId), commitment],
        "ReportRegistered",
        "Registering the report",
      );
    },

    registerEvidence: (input) =>
      operationsWrite(
        input,
        input.kind === "report"
          ? "registrar"
          : input.kind === "repair"
            ? "school_admin"
            : "reviewer",
        "registerEvidence",
        [bytes32(input.reportId), input.digest, EVIDENCE_KIND_CODE[input.kind]],
        "EvidenceRegistered",
        "Registering evidence",
      ),

    acknowledgeReport: (input) =>
      operationsWrite(
        input,
        "school_admin",
        "acknowledgeReport",
        [bytes32(input.reportId)],
        "ReportAcknowledged",
        "Acknowledging the report",
      ),

    recordInterimProtection: (input) =>
      operationsWrite(
        input,
        "school_admin",
        "recordInterimProtection",
        [bytes32(input.reportId), input.commitment],
        "InterimProtectionRecorded",
        "Recording interim protection",
      ),

    claimRepair: (input) =>
      operationsWrite(
        input,
        "school_admin",
        "claimRepair",
        [bytes32(input.reportId), input.commitment],
        "RepairClaimed",
        "Recording the repair claim",
      ),

    verifyRepair: (input) =>
      operationsWrite(
        input,
        "reviewer",
        "verifyRepair",
        [bytes32(input.reportId), input.reviewCommitment],
        "RepairVerified",
        "Independent verification",
      ),

    disputeRepair: (input) =>
      operationsWrite(
        input,
        "reviewer",
        "disputeRepair",
        [bytes32(input.reportId), input.reviewCommitment],
        "RepairDisputed",
        "Independent dispute",
      ),

    async probeVerify({ reportId, institutionId, as }) {
      // A role without a key here cannot be the reviewer: the contract would say the same.
      if (!accounts[as]) return { allowed: false, revert: "Unauthorized" };
      return probe(
        async () => {
          const operations = await operationsOf(reportId, institutionId);
          // A throw-away commitment: the call is simulated, never sent.
          await simulate("operations", operations, as, "verifyRepair", [
            bytes32(reportId),
            probeCommitment(),
          ]);
        },
        "Probing verification",
        TARGETS.operations.name,
      );
    },

    async statusOf(reportId, institutionId) {
      try {
        const found = await home(reportId, institutionId);
        if (!found) return "none";
        return await reportStatusAt(found.operations, bytes32(reportId));
      } catch (error) {
        throw toLedgerError(error, "Reading the report status", TARGETS.operations.name);
      }
    },

    async getReceipt(txId, event) {
      return refresh(txId, event, sentTo.get(txId) ?? null, 0);
    },

    approveWorkOrder: (input) =>
      financeWrite(
        input,
        "buyer",
        "approveWorkOrder",
        [bytes32(input.workOrderId), bytes32(input.reportId), input.commitment],
        "WorkOrderApproved",
        "Approving the work order",
      ),

    acknowledgeWorkOrder: (input) =>
      financeWrite(
        input,
        "supplier",
        "acknowledgeWorkOrder",
        [bytes32(input.workOrderId)],
        "WorkOrderAcknowledged",
        "Acknowledging the work order",
      ),

    submitInvoice: (input) =>
      financeWrite(
        input,
        "supplier",
        "submitInvoice",
        [bytes32(input.workOrderId), input.commitment],
        "InvoiceSubmitted",
        "Submitting the invoice",
      ),

    recordGoodsReceipt: (input) =>
      financeWrite(
        input,
        "receiver",
        "recordGoodsReceipt",
        [bytes32(input.workOrderId), input.commitment],
        "GoodsReceiptRecorded",
        "Recording the goods receipt",
      ),

    // The rule engine has no key of its own: the platform relayer records its result.
    recordMatchResult: (input) =>
      financeWrite(
        input,
        "registrar",
        "recordMatchResult",
        [
          bytes32(input.workOrderId),
          input.invoiceCommitment,
          input.passed,
          input.commitment,
        ],
        "MatchRecorded",
        "Recording the match result",
      ),

    openPaymentDispute: (input) =>
      financeWrite(
        input,
        input.as === "receiver" ? "receiver" : "buyer",
        "openPaymentDispute",
        [bytes32(input.workOrderId), input.commitment],
        "PaymentDisputeOpened",
        "Opening the payment dispute",
      ),

    closePaymentDispute: (input) =>
      financeWrite(
        input,
        input.as === "receiver" ? "receiver" : "buyer",
        "closePaymentDispute",
        [bytes32(input.workOrderId), input.commitment],
        "PaymentDisputeClosed",
        "Closing the payment dispute",
      ),

    authoriseRelease: (input) =>
      financeWrite(
        input,
        "payment_approver",
        "authoriseRelease",
        [bytes32(input.workOrderId), input.commitment],
        "ReleaseAuthorised",
        "Authorising the release",
      ),

    async probeRelease(ref) {
      requireFinance();
      return probe(
        async () => {
          const { finance } = await resolve(ref.institutionId);
          // An unused fingerprint: the call reverts with the first blocker or succeeds.
          await simulate("finance", finance, "payment_approver", "authoriseRelease", [
            bytes32(ref.workOrderId),
            probeCommitment(),
          ]);
        },
        "Probing the release",
        TARGETS.finance.name,
      );
    },
  };
}
