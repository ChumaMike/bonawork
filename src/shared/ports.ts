import type { BlockchainReceipt, ChainStatus, EvidenceKind } from "./domain";
import type { Hex32, Id } from "./primitives";
import type { ChainRole } from "./roles";

/** Names one work order on one institution's InstitutionFinance contract. */
export type FinanceRef = { institutionId: Id; workOrderId: Id };

/**
 * The only way the backend talks to the ledger contracts. One method per contract
 * write, taking off-chain ids; the adapter derives the bytes32 ids with
 * `idToBytes32` and signs with the one key that the
 * contract accepts for that call.
 *
 * Implemented by the Blockchain team in `src/blockchain/`; called by the
 * Backend team from `src/server/`. Nothing else may import a chain library.
 *
 * Every write resolves once the transaction is submitted (status `pending`
 * or `confirmed`) and rejects with a `LedgerError` if the contract reverts.
 */
export interface LedgerPort {
  /** Which ledger this is. The UI must never present a non-`live` ledger as Avalanche. */
  info(): LedgerInfo;
  /** Signed by the registrar key. */
  registerReport(input: {
    reportId: Id;
    institutionId: Id;
    commitment: Hex32;
  }): Promise<BlockchainReceipt>;
  /**
   * Signed by the key matching `kind`: report → registrar, repair → school admin, review → reviewer.
   *
   * `institutionId` on this and the other report-scoped inputs picks the
   * institution's InstitutionOperations contract. BonaRegistry ignores it.
   */
  registerEvidence(input: {
    reportId: Id;
    institutionId?: Id;
    digest: Hex32;
    kind: EvidenceKind;
  }): Promise<BlockchainReceipt>;
  /** Signed by the school admin key. */
  acknowledgeReport(input: {
    reportId: Id;
    institutionId?: Id;
  }): Promise<BlockchainReceipt>;
  /** Signed by the school admin key. Does not change status. */
  recordInterimProtection(input: {
    reportId: Id;
    institutionId?: Id;
    commitment: Hex32;
  }): Promise<BlockchainReceipt>;
  /** Signed by the school admin key. */
  claimRepair(input: {
    reportId: Id;
    institutionId?: Id;
    commitment: Hex32;
  }): Promise<BlockchainReceipt>;
  /** Signed by the reviewer key. */
  verifyRepair(input: {
    reportId: Id;
    institutionId?: Id;
    reviewCommitment: Hex32;
  }): Promise<BlockchainReceipt>;
  /** Signed by the reviewer key. */
  disputeRepair(input: {
    reportId: Id;
    institutionId?: Id;
    reviewCommitment: Hex32;
  }): Promise<BlockchainReceipt>;
  /**
   * Ask the contract — without sending a transaction — whether the key for
   * `as` would be allowed to verify this report right now. Lets the app show
   * a school administrator the contract's own refusal
   * (`SchoolAdminCannotVerify`) rather than only an application 403.
   */
  probeVerify(input: {
    reportId: Id;
    institutionId?: Id;
    as: ChainRole;
  }): Promise<{ allowed: boolean; revert: ContractErrorName | null }>;
  /** On-chain status. `none` means the report is not registered. */
  statusOf(reportId: Id, institutionId?: Id): Promise<ChainStatus>;
  /** Refresh a pending receipt. */
  getReceipt(txId: Hex32, event: BlockchainReceipt["event"]): Promise<BlockchainReceipt>;

  /*
   * Finance writes (InstitutionFinance). Fingerprints only: no amount, name or
   * document reaches the ledger. Each rejects with `not_configured` while
   * `info().finance` is `off`.
   */

  /** Signed by the buyer key. The report must exist on the institution's operations contract. */
  approveWorkOrder(
    input: FinanceRef & { reportId: Id; commitment: Hex32 },
  ): Promise<BlockchainReceipt>;
  /** Signed by the supplier key. Binds the order to that supplier. */
  acknowledgeWorkOrder(input: FinanceRef): Promise<BlockchainReceipt>;
  /** Signed by the bound supplier's key. */
  submitInvoice(input: FinanceRef & { commitment: Hex32 }): Promise<BlockchainReceipt>;
  /** Signed by the receiver key. */
  recordGoodsReceipt(
    input: FinanceRef & { commitment: Hex32 },
  ): Promise<BlockchainReceipt>;
  /** Signed by the registrar key (the platform relayer), for the rule engine. */
  recordMatchResult(
    input: FinanceRef & { invoiceCommitment: Hex32; passed: boolean; commitment: Hex32 },
  ): Promise<BlockchainReceipt>;
  /** Signed by the buyer or the receiver key, as `as` says. */
  openPaymentDispute(
    input: FinanceRef & { commitment: Hex32; as: "buyer" | "receiver" },
  ): Promise<BlockchainReceipt>;
  /** Signed by the key that opened the dispute. */
  closePaymentDispute(
    input: FinanceRef & { commitment: Hex32; as: "buyer" | "receiver" },
  ): Promise<BlockchainReceipt>;
  /** Signed by the payment approver key. A release instruction: no money moves. */
  authoriseRelease(input: FinanceRef & { commitment: Hex32 }): Promise<BlockchainReceipt>;
  /**
   * Ask the contract — without sending a transaction — whether the payment
   * approver key could authorise this release right now. `revert` is the
   * contract error name when it could not.
   */
  probeRelease(input: FinanceRef): Promise<{ allowed: boolean; revert: string | null }>;
}

export interface LedgerInfo {
  /** CAIP-2, e.g. `eip155:43113`. */
  chainId: string;
  contractAddress: string;
  /** Human-readable network name for the UI. */
  networkName: string;
  /** Null when the network has no public explorer (e.g. the in-memory ledger). */
  explorerTxUrl: (txId: string) => string | null;
  /** True only for a real chain adapter with every signer configured. */
  live: boolean;
  /**
   * Whether finance writes reach a ledger: `live` on a real chain with the
   * finance signers configured, `simulated` on the in-memory ledger, `off`
   * when they are not available. Only `live` may be presented as Avalanche.
   */
  finance: "live" | "simulated" | "off";
}

/** Custom errors of the ledger contracts, exactly as named in their ABIs. */
export const CONTRACT_ERRORS = [
  "SchoolAdminCannotVerify",
  "Unauthorized",
  "InvalidState",
  "ReportAlreadyRegistered",
  "DuplicateCommitment",
  "DuplicateEvidence",
  "DuplicateProtection",
  "ReportNotFound",
  "SchoolNotRegistered",
  "RoleConflict",
  "RoleNotHeld",
  "ZeroValue",
  "ZeroAddress",
  "NotOwner",
  /* BonaChainFactory */
  "NotPendingOwner",
  "InvalidRole",
  "InstitutionAlreadyExists",
  "InstitutionNotFound",
  /* InstitutionFinance */
  "SeparationOfDuties",
  "WorkOrderAlreadyExists",
  "WorkOrderNotFound",
  "InvalidOrderState",
  "StaleInvoice",
  "NoInvoice",
  "NoGoodsReceipt",
  "MatchNotPassing",
  "DisputeOpen",
  "NoOpenDispute",
  "RepairNotVerified",
] as const;
export type ContractErrorName = (typeof CONTRACT_ERRORS)[number];

/** What the backend should do about a ledger failure. */
export type LedgerErrorCode =
  | "not_configured"
  | "unauthorized"
  | "self_verification"
  | "invalid_state"
  /** The same account already acted on this order under another role. HTTP 403. */
  | "separation_of_duties"
  /** The contract will not let the release through yet. HTTP 409. */
  | "release_blocked"
  | "duplicate"
  | "not_found"
  | "rpc_unavailable"
  | "reverted";

const CODE_FOR_CONTRACT_ERROR: Record<ContractErrorName, LedgerErrorCode> = {
  SchoolAdminCannotVerify: "self_verification",
  Unauthorized: "unauthorized",
  InvalidState: "invalid_state",
  ReportAlreadyRegistered: "duplicate",
  DuplicateCommitment: "duplicate",
  DuplicateEvidence: "duplicate",
  DuplicateProtection: "duplicate",
  ReportNotFound: "not_found",
  SchoolNotRegistered: "not_found",
  RoleConflict: "reverted",
  RoleNotHeld: "reverted",
  ZeroValue: "reverted",
  ZeroAddress: "reverted",
  NotOwner: "unauthorized",
  NotPendingOwner: "unauthorized",
  InvalidRole: "reverted",
  InstitutionAlreadyExists: "duplicate",
  InstitutionNotFound: "not_found",
  SeparationOfDuties: "separation_of_duties",
  WorkOrderAlreadyExists: "duplicate",
  WorkOrderNotFound: "not_found",
  InvalidOrderState: "invalid_state",
  StaleInvoice: "invalid_state",
  NoInvoice: "release_blocked",
  NoGoodsReceipt: "release_blocked",
  MatchNotPassing: "release_blocked",
  DisputeOpen: "release_blocked",
  NoOpenDispute: "invalid_state",
  RepairNotVerified: "release_blocked",
};

/**
 * Thrown by every `LedgerPort` write that the contract or the network refuses.
 * `contractError` is the contract error name when the contract (or the
 * in-memory ledger mirroring it) said no; `code` says what to do about it.
 */
export class LedgerError extends Error {
  constructor(
    readonly code: LedgerErrorCode,
    readonly contractError: ContractErrorName | null,
    detail: string,
  ) {
    super(contractError ? `${contractError}: ${detail}` : detail);
    this.name = "LedgerError";
  }

  /** Build from a contract revert, mapping the error name to a code. */
  static fromContract(name: string, detail: string): LedgerError {
    const known = (CONTRACT_ERRORS as readonly string[]).includes(name)
      ? (name as ContractErrorName)
      : null;
    return new LedgerError(
      known ? CODE_FOR_CONTRACT_ERROR[known] : "reverted",
      known,
      known ? detail : `${detail} (${name})`,
    );
  }
}
