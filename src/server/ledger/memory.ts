import {
  LedgerError,
  idToBytes32,
  sha256Hex,
  type BlockchainReceipt,
  type ChainStatus,
  type ContractErrorName,
  type Hex32,
  type LedgerPort,
  type RegistryEvent,
} from "@/shared";

export { LedgerError };

/** Chain id of the in-memory ledger. Never a real network. */
export const MEMORY_CHAIN_ID = "bona:memory";

type Entry = { status: ChainStatus; evidence: Set<Hex32>; protections: Set<Hex32> };

const refuse = (name: ContractErrorName, detail: string) =>
  LedgerError.fromContract(name, detail);

/** Finance writes are not modelled here yet: every one of them is refused. */
const financeOff = async (): Promise<never> => {
  throw new LedgerError(
    "not_configured",
    null,
    "The in-memory ledger does not record finance steps yet.",
  );
};

/**
 * A LedgerPort that keeps everything in memory and applies the same ordering
 * rules as BonaRegistry. For local development and tests only: receipts carry
 * `MEMORY_CHAIN_ID`, so they can never be mistaken for Avalanche receipts.
 *
 * It does not model signing keys. Who may call what is the backend's job
 * (`can`, `PERMISSION_FOR_STATUS`) and, on the real chain, the contract's.
 * `probeVerify` answers the way the contract would for each role so the UI
 * can show the same refusal in both environments.
 */
export function createMemoryLedger(): LedgerPort {
  const reports = new Map<Hex32, Entry>();
  const commitments = new Set<Hex32>();
  const receipts = new Map<Hex32, BlockchainReceipt>();
  let block = 0;

  const load = (reportId: string): Entry => {
    const entry = reports.get(idToBytes32(reportId));
    if (!entry) throw refuse("ReportNotFound", reportId);
    return entry;
  };
  const requireStatus = (reportId: string, entry: Entry, allowed: ChainStatus[]) => {
    if (!allowed.includes(entry.status)) {
      throw refuse("InvalidState", `${reportId} is ${entry.status}`);
    }
  };
  const claimCommitment = (commitment: Hex32) => {
    if (commitments.has(commitment)) throw refuse("DuplicateCommitment", commitment);
    commitments.add(commitment);
  };
  const receipt = async (event: RegistryEvent): Promise<BlockchainReceipt> => {
    block += 1;
    const txId = await sha256Hex(new TextEncoder().encode(`${MEMORY_CHAIN_ID}:${block}`));
    const made: BlockchainReceipt = {
      chainId: MEMORY_CHAIN_ID,
      contractAddress: "0x0000000000000000000000000000000000000000",
      txId,
      status: "confirmed",
      blockNumber: block,
      blockTimestamp: new Date().toISOString(),
      event,
    };
    receipts.set(txId, made);
    return made;
  };

  return {
    info: () => ({
      chainId: MEMORY_CHAIN_ID,
      contractAddress: "0x0000000000000000000000000000000000000000",
      networkName: "In-memory ledger (not a blockchain)",
      explorerTxUrl: () => null,
      live: false,
      finance: "off",
    }),
    async registerReport({ reportId, commitment }) {
      const key = idToBytes32(reportId);
      if (reports.has(key)) throw refuse("ReportAlreadyRegistered", reportId);
      claimCommitment(commitment);
      reports.set(key, {
        status: "reported",
        evidence: new Set(),
        protections: new Set(),
      });
      return receipt("ReportRegistered");
    },
    async registerEvidence({ reportId, digest }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, [
        "reported",
        "acknowledged",
        "repair_claimed",
        "disputed",
      ]);
      if (entry.evidence.has(digest)) throw refuse("DuplicateEvidence", digest);
      entry.evidence.add(digest);
      return receipt("EvidenceRegistered");
    },
    async acknowledgeReport({ reportId }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["reported"]);
      entry.status = "acknowledged";
      return receipt("ReportAcknowledged");
    },
    async recordInterimProtection({ reportId, commitment }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["acknowledged", "repair_claimed", "disputed"]);
      if (entry.protections.has(commitment)) {
        throw refuse("DuplicateProtection", commitment);
      }
      entry.protections.add(commitment);
      return receipt("InterimProtectionRecorded");
    },
    async claimRepair({ reportId, commitment }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["acknowledged", "disputed"]);
      claimCommitment(commitment);
      entry.status = "repair_claimed";
      return receipt("RepairClaimed");
    },
    async verifyRepair({ reportId }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["repair_claimed"]);
      entry.status = "verified";
      return receipt("RepairVerified");
    },
    async disputeRepair({ reportId }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["repair_claimed"]);
      entry.status = "disputed";
      return receipt("RepairDisputed");
    },
    async probeVerify({ reportId, as }) {
      // BonaRegistry._review refuses a conflicted caller and a non-reviewer before
      // it looks at the claim. This ledger answers those two from the role alone:
      // on a serverless host each instance has its own memory, so a report
      // registered by another instance is unknown here, and the role answer is
      // the one the contract would give for any registered report.
      if (as === "school_admin")
        return { allowed: false, revert: "SchoolAdminCannotVerify" };
      if (as !== "reviewer") return { allowed: false, revert: "Unauthorized" };
      const entry = load(reportId);
      if (entry.status !== "repair_claimed")
        return { allowed: false, revert: "InvalidState" };
      return { allowed: true, revert: null };
    },
    async statusOf(reportId) {
      return reports.get(idToBytes32(reportId))?.status ?? "none";
    },
    async getReceipt(txId) {
      const found = receipts.get(txId);
      if (!found) throw new LedgerError("not_found", null, `unknown transaction ${txId}`);
      return found;
    },
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
