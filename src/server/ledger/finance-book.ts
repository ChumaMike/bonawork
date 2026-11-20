import {
  LedgerError,
  type ChainRole,
  type ChainStatus,
  type ContractErrorName,
  type Hex32,
} from "@/shared";

/**
 * A line-by-line mirror of `contracts/contracts/chain/InstitutionFinance.sol`
 * for ONE institution, kept in memory. Every method runs the contract's checks
 * in the contract's order and throws a `LedgerError` named after the custom
 * error the contract would revert with. Nothing is written until every check
 * has passed, which is what a revert does on chain.
 *
 * `sender` stands for `msg.sender`. Roles come from `roles.roleOf` (the
 * factory) and report state from `operations` (the institution's
 * InstitutionOperations), exactly the two things the contract reads.
 */

export type OrderStatus = "none" | "approved" | "acknowledged" | "release_authorised";

/** The stored record of one work order. Mirrors the contract's `WorkOrder` struct. */
export interface WorkOrderState {
  reportId: Hex32;
  commitment: Hex32;
  status: OrderStatus;
  disputeOpen: boolean;
  matchPassed: boolean;
  buyer: string;
  supplier: string | null;
  invoiceCount: number;
  disputeOpener: string | null;
  receiptCount: number;
  releasedBy: string | null;
  latestInvoice: Hex32 | null;
  latestReceipt: Hex32 | null;
  /** Null when there is no current match: none yet, or voided by a newer invoice or receipt. */
  currentMatch: Hex32 | null;
  releaseCommitment: Hex32 | null;
}

/** The part of the factory the finance contract reads. */
export interface RolesView {
  roleOf(account: string): ChainRole | null;
}

/** The part of InstitutionOperations the finance contract reads. */
export interface OperationsView {
  statusOf(reportId: Hex32): ChainStatus;
  hasActedForSchool(reportId: Hex32, account: string): boolean;
  hasReviewed(reportId: Hex32, account: string): boolean;
}

export interface FinanceBook {
  approveWorkOrder(
    sender: string,
    workOrderId: Hex32,
    reportId: Hex32,
    commitment: Hex32,
  ): void;
  acknowledgeWorkOrder(sender: string, workOrderId: Hex32): void;
  submitInvoice(sender: string, workOrderId: Hex32, commitment: Hex32): void;
  recordGoodsReceipt(sender: string, workOrderId: Hex32, commitment: Hex32): void;
  recordMatchResult(
    sender: string,
    workOrderId: Hex32,
    invoiceCommitment: Hex32,
    passed: boolean,
    commitment: Hex32,
  ): void;
  openPaymentDispute(sender: string, workOrderId: Hex32, commitment: Hex32): void;
  closePaymentDispute(sender: string, workOrderId: Hex32, commitment: Hex32): void;
  authoriseRelease(sender: string, workOrderId: Hex32, commitment: Hex32): void;
  /**
   * The first check `authoriseRelease` would fail for `sender`, or null when it
   * would go through. What an `eth_call` of `authoriseRelease` with an unused
   * fingerprint reports on chain.
   */
  releaseBlocker(sender: string, workOrderId: Hex32): ContractErrorName | null;
  /** The contract's `getWorkOrder`. Null where the contract returns all zeros. */
  getWorkOrder(workOrderId: Hex32): WorkOrderState | null;
  /** The contract's `actedAs`. Null where the contract returns `Role.None`. */
  actedAs(workOrderId: Hex32, account: string): ChainRole | null;
}

const ZERO: Hex32 = `0x${"0".repeat(64)}`;

const refuse = (name: ContractErrorName, detail: string) =>
  LedgerError.fromContract(name, detail);

export function createFinanceBook(
  roles: RolesView,
  operations: OperationsView,
): FinanceBook {
  const orders = new Map<Hex32, WorkOrderState>();
  const commitmentUsed = new Set<Hex32>();
  const acted = new Map<Hex32, Map<string, ChainRole>>();

  const priorRole = (workOrderId: Hex32, account: string): ChainRole | null =>
    acted.get(workOrderId)?.get(account) ?? null;

  /** `_load` */
  const load = (workOrderId: Hex32): WorkOrderState => {
    const order = orders.get(workOrderId);
    if (!order) throw refuse("WorkOrderNotFound", workOrderId);
    return order;
  };

  /** The checks of `_actAs`: separation of duties first, then the role. */
  const checkActAs = (
    sender: string,
    workOrderId: Hex32,
    required: ChainRole,
    held: ChainRole | null,
  ) => {
    const prior = priorRole(workOrderId, sender);
    if (prior !== null && prior !== required) {
      throw refuse(
        "SeparationOfDuties",
        `${sender} already acted on this order as ${prior}`,
      );
    }
    if (held !== required) throw refuse("Unauthorized", `${sender} is not ${required}`);
  };

  /** The write of `_actAs`. Called only after every check has passed. */
  const noteActed = (sender: string, workOrderId: Hex32, role: ChainRole) => {
    const byAccount = acted.get(workOrderId) ?? new Map<string, ChainRole>();
    if (!byAccount.has(sender)) byAccount.set(sender, role);
    acted.set(workOrderId, byAccount);
  };

  /** `_enter` without its write. */
  const enter = (
    sender: string,
    workOrderId: Hex32,
    required: ChainRole,
  ): WorkOrderState => {
    const order = load(workOrderId);
    checkActAs(sender, workOrderId, required, roles.roleOf(sender));
    return order;
  };

  const requireStatus = (
    workOrderId: Hex32,
    order: WorkOrderState,
    wanted: OrderStatus,
  ) => {
    if (order.status !== wanted) {
      throw refuse("InvalidOrderState", `${workOrderId} is ${order.status}`);
    }
  };

  /** `_requireOpenOrder` */
  const requireOpenOrder = (workOrderId: Hex32, order: WorkOrderState) => {
    if (order.status === "release_authorised") {
      throw refuse("InvalidOrderState", `${workOrderId} is ${order.status}`);
    }
  };

  const requireValue = (...values: Hex32[]) => {
    if (values.includes(ZERO)) throw refuse("ZeroValue", "a zero value was given");
  };

  const checkUnused = (commitment: Hex32) => {
    if (commitmentUsed.has(commitment)) throw refuse("DuplicateCommitment", commitment);
  };

  const voidMatch = (order: WorkOrderState) => {
    order.currentMatch = null;
    order.matchPassed = false;
  };

  /**
   * `authoriseRelease` from `_load` up to (not including) `_useCommitment`, in
   * the contract's order: WorkOrderNotFound -> SeparationOfDuties -> Unauthorized
   * -> InvalidOrderState -> NoInvoice -> NoGoodsReceipt -> MatchNotPassing ->
   * DisputeOpen -> RepairNotVerified.
   */
  const checkRelease = (sender: string, workOrderId: Hex32): WorkOrderState => {
    const order = load(workOrderId);
    if (
      operations.hasActedForSchool(order.reportId, sender) ||
      operations.hasReviewed(order.reportId, sender)
    ) {
      throw refuse("SeparationOfDuties", `${sender} already acted on the report`);
    }
    checkActAs(sender, workOrderId, "payment_approver", roles.roleOf(sender));
    requireStatus(workOrderId, order, "acknowledged");
    if (order.invoiceCount === 0) throw refuse("NoInvoice", workOrderId);
    if (order.receiptCount === 0) throw refuse("NoGoodsReceipt", workOrderId);
    if (!order.matchPassed) throw refuse("MatchNotPassing", workOrderId);
    if (order.disputeOpen) throw refuse("DisputeOpen", workOrderId);
    const reportStatus = operations.statusOf(order.reportId);
    if (reportStatus !== "verified") {
      throw refuse("RepairNotVerified", `the report is ${reportStatus}`);
    }
    return order;
  };

  return {
    approveWorkOrder(sender, workOrderId, reportId, commitment) {
      requireValue(workOrderId, reportId, commitment);
      if (roles.roleOf(sender) !== "buyer") {
        throw refuse("Unauthorized", `${sender} is not buyer`);
      }
      if (orders.has(workOrderId)) throw refuse("WorkOrderAlreadyExists", workOrderId);
      if (operations.statusOf(reportId) === "none") {
        throw refuse("ReportNotFound", reportId);
      }
      checkUnused(commitment);

      commitmentUsed.add(commitment);
      orders.set(workOrderId, {
        reportId,
        commitment,
        status: "approved",
        disputeOpen: false,
        matchPassed: false,
        buyer: sender,
        supplier: null,
        invoiceCount: 0,
        disputeOpener: null,
        receiptCount: 0,
        releasedBy: null,
        latestInvoice: null,
        latestReceipt: null,
        currentMatch: null,
        releaseCommitment: null,
      });
      // The contract writes `actedAs[workOrderId][msg.sender] = Role.Buyer` outright.
      acted.set(workOrderId, new Map([[sender, "buyer"]]));
    },

    acknowledgeWorkOrder(sender, workOrderId) {
      const order = enter(sender, workOrderId, "supplier");
      requireStatus(workOrderId, order, "approved");

      noteActed(sender, workOrderId, "supplier");
      order.status = "acknowledged";
      order.supplier = sender;
    },

    submitInvoice(sender, workOrderId, commitment) {
      requireValue(commitment);
      const order = enter(sender, workOrderId, "supplier");
      requireStatus(workOrderId, order, "acknowledged");
      if (sender !== order.supplier) {
        throw refuse("Unauthorized", `${sender} is not the supplier bound to this order`);
      }
      checkUnused(commitment);

      noteActed(sender, workOrderId, "supplier");
      commitmentUsed.add(commitment);
      order.invoiceCount += 1;
      order.latestInvoice = commitment;
      voidMatch(order);
    },

    recordGoodsReceipt(sender, workOrderId, commitment) {
      requireValue(commitment);
      const order = enter(sender, workOrderId, "receiver");
      requireOpenOrder(workOrderId, order);
      checkUnused(commitment);

      noteActed(sender, workOrderId, "receiver");
      commitmentUsed.add(commitment);
      order.receiptCount += 1;
      order.latestReceipt = commitment;
      voidMatch(order);
    },

    recordMatchResult(sender, workOrderId, invoiceCommitment, passed, commitment) {
      requireValue(commitment);
      const order = enter(sender, workOrderId, "registrar");
      requireStatus(workOrderId, order, "acknowledged");
      if (order.invoiceCount === 0) throw refuse("NoInvoice", workOrderId);
      if (invoiceCommitment !== order.latestInvoice) {
        throw refuse("StaleInvoice", invoiceCommitment);
      }
      checkUnused(commitment);

      noteActed(sender, workOrderId, "registrar");
      commitmentUsed.add(commitment);
      order.currentMatch = commitment;
      order.matchPassed = passed;
    },

    openPaymentDispute(sender, workOrderId, commitment) {
      requireValue(commitment);
      const order = load(workOrderId);
      const held = roles.roleOf(sender);
      const required: ChainRole = held === "receiver" ? "receiver" : "buyer";
      checkActAs(sender, workOrderId, required, held);
      requireOpenOrder(workOrderId, order);
      if (order.disputeOpen) throw refuse("DisputeOpen", workOrderId);
      checkUnused(commitment);

      noteActed(sender, workOrderId, required);
      commitmentUsed.add(commitment);
      order.disputeOpen = true;
      order.disputeOpener = sender;
    },

    closePaymentDispute(sender, workOrderId, commitment) {
      requireValue(commitment);
      const order = load(workOrderId);
      if (!order.disputeOpen || order.disputeOpener === null) {
        throw refuse("NoOpenDispute", workOrderId);
      }
      const opener = order.disputeOpener;
      // The opener acted when it opened the dispute, so this is never null.
      const required = priorRole(workOrderId, opener) ?? "buyer";
      checkActAs(sender, workOrderId, required, roles.roleOf(sender));
      if (sender !== opener) {
        throw refuse("Unauthorized", `${sender} did not open this dispute`);
      }
      checkUnused(commitment);

      commitmentUsed.add(commitment);
      order.disputeOpen = false;
      order.disputeOpener = null;
    },

    authoriseRelease(sender, workOrderId, commitment) {
      requireValue(commitment);
      const order = checkRelease(sender, workOrderId);
      checkUnused(commitment);

      noteActed(sender, workOrderId, "payment_approver");
      commitmentUsed.add(commitment);
      order.status = "release_authorised";
      order.releasedBy = sender;
      order.releaseCommitment = commitment;
    },

    releaseBlocker(sender, workOrderId) {
      try {
        checkRelease(sender, workOrderId);
        return null;
      } catch (error) {
        if (error instanceof LedgerError && error.contractError) {
          return error.contractError;
        }
        throw error;
      }
    },

    getWorkOrder: (workOrderId) => {
      const order = orders.get(workOrderId);
      return order ? { ...order } : null;
    },

    actedAs: priorRole,
  };
}
