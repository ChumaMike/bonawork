import {
  CHAIN_ROLE_CODE,
  LedgerError,
  idToBytes32,
  sha256Hex,
  type BlockchainReceipt,
  type ChainRole,
  type ChainStatus,
  type ContractErrorName,
  type FinanceRef,
  type Hex32,
  type LedgerEvent,
  type LedgerPort,
} from "@/shared";
import { createFinanceBook, type FinanceBook } from "./finance-book";

export { LedgerError };

/** Chain id of the in-memory ledger. Never a real network. */
export const MEMORY_CHAIN_ID = "bona:memory";

type Entry = {
  /** The institution whose operations contract would hold this report. */
  institution: Hex32;
  status: ChainStatus;
  evidence: Set<Hex32>;
  protections: Set<Hex32>;
  /** `hasActedForSchool`: the accounts that acted for the institution on this report. */
  actedForSchool: Set<string>;
  /** `hasReviewed`: the accounts that verified or disputed a claim on this report. */
  reviewed: Set<string>;
};

const refuse = (name: ContractErrorName, detail: string) =>
  LedgerError.fromContract(name, detail);

/**
 * The simulated accounts. On chain each role signs with its own key; here the
 * account of a role is simply the role's name, so "one key per role, all
 * different" holds by construction and the factory's `roleOf` is the identity.
 */
const roleOfAccount = (account: string): ChainRole | null =>
  Object.hasOwn(CHAIN_ROLE_CODE, account) ? (account as ChainRole) : null;

/**
 * A LedgerPort that keeps everything in memory and applies the same ordering
 * rules as the contracts. For local development and tests only: receipts carry
 * `MEMORY_CHAIN_ID`, so they can never be mistaken for Avalanche receipts.
 *
 * Report writes do not model signing keys. Who may call what is the backend's
 * job (`can`, `PERMISSION_FOR_STATUS`) and, on the real chain, the contract's.
 * `probeVerify` answers the way the contract would for each role so the UI
 * can show the same refusal in both environments.
 *
 * Finance writes mirror InstitutionFinance check for check (`finance-book.ts`),
 * with one book per institution, as the factory creates one finance contract
 * per institution. Each write is made by the one account the port fixes for
 * it, so the contract's separation of duties, supplier binding, voided
 * matches, disputes and release gate all answer as they would on chain. The
 * result is still a simulation: `info().finance` says `simulated` and every
 * receipt carries `MEMORY_CHAIN_ID`. The optional `institutionId` on the
 * report-scoped inputs is ignored: a report id is unique across institutions.
 */
export function createMemoryLedger(): LedgerPort {
  const reports = new Map<Hex32, Entry>();
  const commitments = new Set<Hex32>();
  const receipts = new Map<Hex32, BlockchainReceipt>();
  const books = new Map<Hex32, FinanceBook>();
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
  const receipt = async (event: LedgerEvent): Promise<BlockchainReceipt> => {
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

  /** The finance book of one institution. It sees only that institution's reports. */
  const bookOf = (institutionId: string): FinanceBook => {
    const institution = idToBytes32(institutionId);
    let book = books.get(institution);
    if (!book) {
      const own = (reportId: Hex32) => {
        const entry = reports.get(reportId);
        return entry?.institution === institution ? entry : null;
      };
      book = createFinanceBook(
        { roleOf: roleOfAccount },
        {
          statusOf: (reportId) => own(reportId)?.status ?? "none",
          hasActedForSchool: (reportId, account) =>
            own(reportId)?.actedForSchool.has(account) ?? false,
          hasReviewed: (reportId, account) =>
            own(reportId)?.reviewed.has(account) ?? false,
        },
      );
      books.set(institution, book);
    }
    return book;
  };
  const order = (ref: FinanceRef) =>
    [bookOf(ref.institutionId), idToBytes32(ref.workOrderId)] as const;

  return {
    info: () => ({
      chainId: MEMORY_CHAIN_ID,
      contractAddress: "0x0000000000000000000000000000000000000000",
      networkName: "In-memory ledger (not a blockchain)",
      explorerTxUrl: () => null,
      live: false,
      finance: "simulated",
    }),
    async registerReport({ reportId, institutionId, commitment }) {
      const key = idToBytes32(reportId);
      const institution = idToBytes32(institutionId);
      if (reports.has(key)) throw refuse("ReportAlreadyRegistered", reportId);
      claimCommitment(commitment);
      reports.set(key, {
        institution,
        status: "reported",
        evidence: new Set(),
        protections: new Set(),
        actedForSchool: new Set(),
        reviewed: new Set(),
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
      entry.actedForSchool.add("school_admin");
      return receipt("ReportAcknowledged");
    },
    async recordInterimProtection({ reportId, commitment }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["acknowledged", "repair_claimed", "disputed"]);
      if (entry.protections.has(commitment)) {
        throw refuse("DuplicateProtection", commitment);
      }
      entry.protections.add(commitment);
      entry.actedForSchool.add("school_admin");
      return receipt("InterimProtectionRecorded");
    },
    async claimRepair({ reportId, commitment }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["acknowledged", "disputed"]);
      claimCommitment(commitment);
      entry.status = "repair_claimed";
      entry.actedForSchool.add("school_admin");
      return receipt("RepairClaimed");
    },
    async verifyRepair({ reportId }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["repair_claimed"]);
      entry.status = "verified";
      entry.reviewed.add("reviewer");
      return receipt("RepairVerified");
    },
    async disputeRepair({ reportId }) {
      const entry = load(reportId);
      requireStatus(reportId, entry, ["repair_claimed"]);
      entry.status = "disputed";
      entry.reviewed.add("reviewer");
      return receipt("RepairDisputed");
    },
    async probeVerify({ reportId, as }) {
      // The contract's _review refuses a conflicted caller and a non-reviewer before
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

    /*
     * Finance. The account that signs is fixed by the operation, as it is on
     * chain: nothing in the input can choose another one. A dispute is the one
     * step two roles may take, so its input names which of the two.
     */
    async approveWorkOrder(input) {
      const [book, workOrderId] = order(input);
      book.approveWorkOrder(
        "buyer",
        workOrderId,
        idToBytes32(input.reportId),
        input.commitment,
      );
      return receipt("WorkOrderApproved");
    },
    async acknowledgeWorkOrder(input) {
      const [book, workOrderId] = order(input);
      book.acknowledgeWorkOrder("supplier", workOrderId);
      return receipt("WorkOrderAcknowledged");
    },
    async submitInvoice(input) {
      const [book, workOrderId] = order(input);
      book.submitInvoice("supplier", workOrderId, input.commitment);
      return receipt("InvoiceSubmitted");
    },
    async recordGoodsReceipt(input) {
      const [book, workOrderId] = order(input);
      book.recordGoodsReceipt("receiver", workOrderId, input.commitment);
      return receipt("GoodsReceiptRecorded");
    },
    async recordMatchResult(input) {
      const [book, workOrderId] = order(input);
      book.recordMatchResult(
        "registrar",
        workOrderId,
        input.invoiceCommitment,
        input.passed,
        input.commitment,
      );
      return receipt("MatchRecorded");
    },
    async openPaymentDispute(input) {
      const [book, workOrderId] = order(input);
      book.openPaymentDispute(input.as, workOrderId, input.commitment);
      return receipt("PaymentDisputeOpened");
    },
    async closePaymentDispute(input) {
      const [book, workOrderId] = order(input);
      book.closePaymentDispute(input.as, workOrderId, input.commitment);
      return receipt("PaymentDisputeClosed");
    },
    async authoriseRelease(input) {
      const [book, workOrderId] = order(input);
      book.authoriseRelease("payment_approver", workOrderId, input.commitment);
      return receipt("ReleaseAuthorised");
    },
    async probeRelease(input) {
      const [book, workOrderId] = order(input);
      const revert = book.releaseBlocker("payment_approver", workOrderId);
      return { allowed: revert === null, revert };
    },
  };
}
