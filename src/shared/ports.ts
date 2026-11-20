import type { BlockchainReceipt, ChainStatus, EvidenceKind } from "./domain";
import type { Hex32, Id } from "./primitives";
import type { ChainRole } from "./roles";

/**
 * The only way the backend talks to BonaRegistry. One method per contract
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
  /** Signed by the key matching `kind`: report → registrar, repair → school admin, review → reviewer. */
  registerEvidence(input: {
    reportId: Id;
    digest: Hex32;
    kind: EvidenceKind;
  }): Promise<BlockchainReceipt>;
  /** Signed by the school admin key. */
  acknowledgeReport(input: { reportId: Id }): Promise<BlockchainReceipt>;
  /** Signed by the school admin key. Does not change status. */
  recordInterimProtection(input: {
    reportId: Id;
    commitment: Hex32;
  }): Promise<BlockchainReceipt>;
  /** Signed by the school admin key. */
  claimRepair(input: { reportId: Id; commitment: Hex32 }): Promise<BlockchainReceipt>;
  /** Signed by the reviewer key. */
  verifyRepair(input: {
    reportId: Id;
    reviewCommitment: Hex32;
  }): Promise<BlockchainReceipt>;
  /** Signed by the reviewer key. */
  disputeRepair(input: {
    reportId: Id;
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
    as: ChainRole;
  }): Promise<{ allowed: boolean; revert: ContractErrorName | null }>;
  /** On-chain status. `none` means the report is not registered. */
  statusOf(reportId: Id): Promise<ChainStatus>;
  /** Refresh a pending receipt. */
  getReceipt(txId: Hex32, event: BlockchainReceipt["event"]): Promise<BlockchainReceipt>;
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
}

/** Custom errors of BonaRegistry, exactly as named in the ABI. */
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
] as const;
export type ContractErrorName = (typeof CONTRACT_ERRORS)[number];

/** What the backend should do about a ledger failure. */
export type LedgerErrorCode =
  | "not_configured"
  | "unauthorized"
  | "self_verification"
  | "invalid_state"
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
};

/**
 * Thrown by every `LedgerPort` write that the contract or the network refuses.
 * `contractError` is the BonaRegistry error name when the contract (or the
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
