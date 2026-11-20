import { describe, expect, it } from "vitest";
import {
  AVALANCHE_CHAINS,
  BlockchainReceiptSchema,
  FINANCE_EVENTS,
  LedgerError,
  idToBytes32,
  type ChainRole,
  type ChainStatus,
  type Hex32,
  type LedgerPort,
} from "@/shared";
import { createFinanceBook } from "./finance-book";
import { MEMORY_CHAIN_ID, createMemoryLedger } from "./memory";

const REPORT = "00000000-0000-4000-8000-000000000001";
const OTHER_REPORT = "00000000-0000-4000-8000-000000000002";
const INSTITUTION = "00000000-0000-4000-8000-000000000005";
const OTHER_INSTITUTION = "00000000-0000-4000-8000-000000000006";
const ORDER = "00000000-0000-4000-8000-0000000000a1";
const ref = { institutionId: INSTITUTION, workOrderId: ORDER };

let counter = 0;
/** A fresh fingerprint every time: the contract accepts each one once. */
const fresh = (): Hex32 => `0x${(++counter).toString(16).padStart(64, "0")}`;
const ZERO: Hex32 = `0x${"0".repeat(64)}`;

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => {
      if (!(error instanceof LedgerError)) throw error;
      return { contractError: error.contractError, code: error.code };
    },
  );

/** A ledger with one registered report, moved to `status` through the real writes. */
async function ledgerWithReport(status: ChainStatus = "repair_claimed") {
  const ledger = createMemoryLedger();
  await ledger.registerReport({
    reportId: REPORT,
    institutionId: INSTITUTION,
    commitment: fresh(),
  });
  if (status === "reported") return ledger;
  await ledger.acknowledgeReport({ reportId: REPORT });
  if (status === "acknowledged") return ledger;
  await ledger.claimRepair({ reportId: REPORT, commitment: fresh() });
  if (status === "repair_claimed") return ledger;
  if (status === "verified") {
    await ledger.verifyRepair({ reportId: REPORT, reviewCommitment: fresh() });
  } else {
    await ledger.disputeRepair({ reportId: REPORT, reviewCommitment: fresh() });
  }
  return ledger;
}

/** Order approved and acknowledged, one invoice, one receipt, a passing match. */
async function matched(ledger: LedgerPort) {
  await ledger.approveWorkOrder({ ...ref, reportId: REPORT, commitment: fresh() });
  await ledger.acknowledgeWorkOrder(ref);
  const invoice = fresh();
  await ledger.submitInvoice({ ...ref, commitment: invoice });
  await ledger.recordGoodsReceipt({ ...ref, commitment: fresh() });
  await ledger.recordMatchResult({
    ...ref,
    invoiceCommitment: invoice,
    passed: true,
    commitment: fresh(),
  });
  return invoice;
}

describe("memory ledger: the procurement trail", () => {
  it("says finance is simulated and is never presented as Avalanche", () => {
    const info = createMemoryLedger().info();
    expect(info).toMatchObject({ finance: "simulated", live: false });
    expect(info.chainId).toBe(MEMORY_CHAIN_ID);
    expect(Object.values(AVALANCHE_CHAINS)).not.toContain(info.chainId);
  });

  it("runs the whole trail and every receipt carries the memory chain id", async () => {
    const ledger = await ledgerWithReport("repair_claimed");
    const invoice = fresh();
    const receipts = [
      await ledger.approveWorkOrder({ ...ref, reportId: REPORT, commitment: fresh() }),
      await ledger.acknowledgeWorkOrder(ref),
      await ledger.submitInvoice({ ...ref, commitment: invoice }),
      await ledger.recordGoodsReceipt({ ...ref, commitment: fresh() }),
      await ledger.recordMatchResult({
        ...ref,
        invoiceCommitment: invoice,
        passed: true,
        commitment: fresh(),
      }),
      await ledger.openPaymentDispute({ ...ref, commitment: fresh(), as: "buyer" }),
      await ledger.closePaymentDispute({ ...ref, commitment: fresh(), as: "buyer" }),
    ];

    // The repair is claimed, not verified: the release stays shut.
    expect(await ledger.probeRelease(ref)).toEqual({
      allowed: false,
      revert: "RepairNotVerified",
    });
    await ledger.verifyRepair({ reportId: REPORT, reviewCommitment: fresh() });
    expect(await ledger.probeRelease(ref)).toEqual({ allowed: true, revert: null });
    receipts.push(await ledger.authoriseRelease({ ...ref, commitment: fresh() }));

    expect(receipts.map((r) => r.event)).toEqual([...FINANCE_EVENTS]);
    for (const receipt of receipts) {
      expect(BlockchainReceiptSchema.safeParse(receipt).success).toBe(true);
      // A simulated result is never an Avalanche transaction.
      expect(receipt.chainId).toBe("bona:memory");
      expect(receipt.chainId.startsWith("eip155:")).toBe(false);
      expect(await ledger.getReceipt(receipt.txId, receipt.event)).toEqual(receipt);
    }
    // Finance steps never change the report status.
    expect(await ledger.statusOf(REPORT)).toBe("verified");
  });

  it("voids the match when a newer invoice or a newer goods receipt arrives", async () => {
    const ledger = await ledgerWithReport("verified");
    const first = await matched(ledger);
    expect(await ledger.probeRelease(ref)).toEqual({ allowed: true, revert: null });

    // A newer invoice: the match was for the old one.
    const second = fresh();
    await ledger.submitInvoice({ ...ref, commitment: second });
    expect(await ledger.probeRelease(ref)).toEqual({
      allowed: false,
      revert: "MatchNotPassing",
    });
    // The platform cannot re-use the old invoice to get a pass back.
    expect(
      await refusal(
        ledger.recordMatchResult({
          ...ref,
          invoiceCommitment: first,
          passed: true,
          commitment: fresh(),
        }),
      ),
    ).toEqual({ contractError: "StaleInvoice", code: "invalid_state" });
    await ledger.recordMatchResult({
      ...ref,
      invoiceCommitment: second,
      passed: true,
      commitment: fresh(),
    });
    expect(await ledger.probeRelease(ref)).toEqual({ allowed: true, revert: null });

    // A newer goods receipt: the match did not see it.
    await ledger.recordGoodsReceipt({ ...ref, commitment: fresh() });
    expect(await ledger.probeRelease(ref)).toEqual({
      allowed: false,
      revert: "MatchNotPassing",
    });
    expect(
      await refusal(ledger.authoriseRelease({ ...ref, commitment: fresh() })),
    ).toEqual({ contractError: "MatchNotPassing", code: "release_blocked" });

    // A failing match is recorded, and blocks.
    await ledger.recordMatchResult({
      ...ref,
      invoiceCommitment: second,
      passed: false,
      commitment: fresh(),
    });
    expect(
      await refusal(ledger.authoriseRelease({ ...ref, commitment: fresh() })),
    ).toEqual({ contractError: "MatchNotPassing", code: "release_blocked" });
  });

  it("blocks the release while a payment dispute is open, and only the opener closes it", async () => {
    const ledger = await ledgerWithReport("verified");
    await matched(ledger);
    await ledger.openPaymentDispute({ ...ref, commitment: fresh(), as: "buyer" });
    expect(await ledger.probeRelease(ref)).toEqual({
      allowed: false,
      revert: "DisputeOpen",
    });
    expect(
      await refusal(
        ledger.openPaymentDispute({ ...ref, commitment: fresh(), as: "receiver" }),
      ),
    ).toEqual({ contractError: "DisputeOpen", code: "release_blocked" });
    // The receiver recorded the goods receipt, so it cannot now act in the buyer's place.
    expect(
      await refusal(
        ledger.closePaymentDispute({ ...ref, commitment: fresh(), as: "receiver" }),
      ),
    ).toEqual({ contractError: "SeparationOfDuties", code: "separation_of_duties" });
    await ledger.closePaymentDispute({ ...ref, commitment: fresh(), as: "buyer" });
    expect(await ledger.probeRelease(ref)).toEqual({ allowed: true, revert: null });
  });

  it("authorises a release once and then closes the order", async () => {
    const ledger = await ledgerWithReport("verified");
    const invoice = await matched(ledger);
    await ledger.authoriseRelease({ ...ref, commitment: fresh() });

    const closed = { contractError: "InvalidOrderState", code: "invalid_state" };
    expect(
      await refusal(ledger.authoriseRelease({ ...ref, commitment: fresh() })),
    ).toEqual(closed);
    expect(await ledger.probeRelease(ref)).toEqual({
      allowed: false,
      revert: "InvalidOrderState",
    });
    expect(await refusal(ledger.submitInvoice({ ...ref, commitment: fresh() }))).toEqual(
      closed,
    );
    expect(
      await refusal(ledger.recordGoodsReceipt({ ...ref, commitment: fresh() })),
    ).toEqual(closed);
    expect(
      await refusal(
        ledger.recordMatchResult({
          ...ref,
          invoiceCommitment: invoice,
          passed: true,
          commitment: fresh(),
        }),
      ),
    ).toEqual(closed);
    expect(
      await refusal(
        ledger.openPaymentDispute({ ...ref, commitment: fresh(), as: "buyer" }),
      ),
    ).toEqual(closed);
  });

  it("keeps each institution's orders and reports apart", async () => {
    const ledger = await ledgerWithReport("verified");
    await ledger.registerReport({
      reportId: OTHER_REPORT,
      institutionId: OTHER_INSTITUTION,
      commitment: fresh(),
    });
    // The report belongs to another institution: this one's contract does not know it.
    expect(
      await refusal(
        ledger.approveWorkOrder({ ...ref, reportId: OTHER_REPORT, commitment: fresh() }),
      ),
    ).toEqual({ contractError: "ReportNotFound", code: "not_found" });

    await matched(ledger);
    const elsewhere = { institutionId: OTHER_INSTITUTION, workOrderId: ORDER };
    expect(await ledger.probeRelease(elsewhere)).toEqual({
      allowed: false,
      revert: "WorkOrderNotFound",
    });
    // The same order id is free on the other institution's contract.
    await ledger.approveWorkOrder({
      ...elsewhere,
      reportId: OTHER_REPORT,
      commitment: fresh(),
    });
    expect(await ledger.probeRelease(ref)).toEqual({ allowed: true, revert: null });
  });

  it("reports the release blockers in the contract's order", async () => {
    // WorkOrderNotFound -> (SeparationOfDuties -> Unauthorized: see the book tests)
    // -> InvalidOrderState -> NoInvoice -> NoGoodsReceipt -> MatchNotPassing
    // -> DisputeOpen -> RepairNotVerified.
    const ledger = await ledgerWithReport("repair_claimed");
    const blocker = async () => (await ledger.probeRelease(ref)).revert;
    const release = () =>
      refusal(ledger.authoriseRelease({ ...ref, commitment: fresh() }));

    expect(await blocker()).toBe("WorkOrderNotFound");
    expect(await release()).toEqual({
      contractError: "WorkOrderNotFound",
      code: "not_found",
    });

    await ledger.approveWorkOrder({ ...ref, reportId: REPORT, commitment: fresh() });
    // Nothing else is in place either, yet the order state is reported first.
    expect(await blocker()).toBe("InvalidOrderState");
    expect(await release()).toEqual({
      contractError: "InvalidOrderState",
      code: "invalid_state",
    });

    await ledger.acknowledgeWorkOrder(ref);
    expect(await blocker()).toBe("NoInvoice");
    expect(await release()).toEqual({
      contractError: "NoInvoice",
      code: "release_blocked",
    });

    const invoice = fresh();
    await ledger.submitInvoice({ ...ref, commitment: invoice });
    expect(await blocker()).toBe("NoGoodsReceipt");
    expect(await release()).toEqual({
      contractError: "NoGoodsReceipt",
      code: "release_blocked",
    });

    await ledger.recordGoodsReceipt({ ...ref, commitment: fresh() });
    expect(await blocker()).toBe("MatchNotPassing");
    expect(await release()).toEqual({
      contractError: "MatchNotPassing",
      code: "release_blocked",
    });

    await ledger.recordMatchResult({
      ...ref,
      invoiceCommitment: invoice,
      passed: true,
      commitment: fresh(),
    });
    await ledger.openPaymentDispute({ ...ref, commitment: fresh(), as: "receiver" });
    // A dispute is open AND the repair is unverified: the dispute is reported first.
    expect(await blocker()).toBe("DisputeOpen");
    expect(await release()).toEqual({
      contractError: "DisputeOpen",
      code: "release_blocked",
    });

    await ledger.closePaymentDispute({ ...ref, commitment: fresh(), as: "receiver" });
    expect(await blocker()).toBe("RepairNotVerified");
    expect(await release()).toEqual({
      contractError: "RepairNotVerified",
      code: "release_blocked",
    });

    // A probe never writes: the release still goes through once the repair is verified.
    await ledger.verifyRepair({ reportId: REPORT, reviewCommitment: fresh() });
    expect(await blocker()).toBeNull();
    expect(await release()).toBeNull();
  });
});

describe("memory ledger: parity with InstitutionFinance, one row per revert", () => {
  type Row = {
    revert: string;
    code: LedgerError["code"];
    /** The report status the case starts from. */
    report?: ChainStatus;
    /** Brings the ledger to the state just before the refused call. */
    given?: (ledger: LedgerPort) => Promise<unknown>;
    when: (ledger: LedgerPort) => Promise<unknown>;
  };

  const approve = (ledger: LedgerPort) =>
    ledger.approveWorkOrder({ ...ref, reportId: REPORT, commitment: fresh() });
  const acknowledged = async (ledger: LedgerPort) => {
    await approve(ledger);
    await ledger.acknowledgeWorkOrder(ref);
  };
  const used = fresh();

  const rows: Row[] = [
    {
      revert: "ZeroValue",
      code: "reverted",
      when: (l) => l.approveWorkOrder({ ...ref, reportId: REPORT, commitment: ZERO }),
    },
    {
      revert: "ZeroValue",
      code: "reverted",
      // The zero check comes before the order is even looked up.
      when: (l) => l.authoriseRelease({ ...ref, commitment: ZERO }),
    },
    {
      revert: "WorkOrderAlreadyExists",
      code: "duplicate",
      given: approve,
      when: approve,
    },
    {
      revert: "ReportNotFound",
      code: "not_found",
      when: (l) =>
        l.approveWorkOrder({ ...ref, reportId: OTHER_REPORT, commitment: fresh() }),
    },
    {
      revert: "DuplicateCommitment",
      code: "duplicate",
      given: async (l) => {
        await acknowledged(l);
        await l.submitInvoice({ ...ref, commitment: used });
      },
      // Contract-wide: an invoice fingerprint cannot come back as a goods receipt.
      when: (l) => l.recordGoodsReceipt({ ...ref, commitment: used }),
    },
    {
      revert: "WorkOrderNotFound",
      code: "not_found",
      when: (l) => l.acknowledgeWorkOrder(ref),
    },
    {
      revert: "WorkOrderNotFound",
      code: "not_found",
      when: (l) => l.submitInvoice({ ...ref, commitment: fresh() }),
    },
    {
      revert: "InvalidOrderState",
      code: "invalid_state",
      given: acknowledged,
      when: (l) => l.acknowledgeWorkOrder(ref),
    },
    {
      revert: "InvalidOrderState",
      code: "invalid_state",
      // An invoice needs an acknowledged order.
      given: approve,
      when: (l) => l.submitInvoice({ ...ref, commitment: fresh() }),
    },
    {
      revert: "NoInvoice",
      code: "release_blocked",
      given: acknowledged,
      when: (l) =>
        l.recordMatchResult({
          ...ref,
          invoiceCommitment: fresh(),
          passed: true,
          commitment: fresh(),
        }),
    },
    {
      revert: "StaleInvoice",
      code: "invalid_state",
      given: async (l) => {
        await acknowledged(l);
        await l.submitInvoice({ ...ref, commitment: fresh() });
      },
      when: (l) =>
        l.recordMatchResult({
          ...ref,
          invoiceCommitment: fresh(),
          passed: true,
          commitment: fresh(),
        }),
    },
    {
      revert: "NoGoodsReceipt",
      code: "release_blocked",
      report: "verified",
      given: async (l) => {
        await acknowledged(l);
        await l.submitInvoice({ ...ref, commitment: fresh() });
      },
      when: (l) => l.authoriseRelease({ ...ref, commitment: fresh() }),
    },
    {
      revert: "MatchNotPassing",
      code: "release_blocked",
      report: "verified",
      given: async (l) => {
        await acknowledged(l);
        await l.submitInvoice({ ...ref, commitment: fresh() });
        await l.recordGoodsReceipt({ ...ref, commitment: fresh() });
      },
      when: (l) => l.authoriseRelease({ ...ref, commitment: fresh() }),
    },
    {
      revert: "DisputeOpen",
      code: "release_blocked",
      report: "verified",
      given: async (l) => {
        await matched(l);
        await l.openPaymentDispute({ ...ref, commitment: fresh(), as: "buyer" });
      },
      when: (l) => l.authoriseRelease({ ...ref, commitment: fresh() }),
    },
    {
      revert: "NoOpenDispute",
      code: "invalid_state",
      given: approve,
      when: (l) => l.closePaymentDispute({ ...ref, commitment: fresh(), as: "buyer" }),
    },
    {
      revert: "RepairNotVerified",
      code: "release_blocked",
      report: "repair_claimed",
      given: matched,
      when: (l) => l.authoriseRelease({ ...ref, commitment: fresh() }),
    },
    {
      revert: "RepairNotVerified",
      code: "release_blocked",
      // A disputed repair is not a verified one.
      report: "disputed",
      given: matched,
      when: (l) => l.authoriseRelease({ ...ref, commitment: fresh() }),
    },
    {
      revert: "Unauthorized",
      code: "unauthorized",
      // The buyer opened it; a receiver who never touched the order cannot close it.
      given: async (l) => {
        await approve(l);
        await l.openPaymentDispute({ ...ref, commitment: fresh(), as: "buyer" });
      },
      when: (l) => l.closePaymentDispute({ ...ref, commitment: fresh(), as: "receiver" }),
    },
    {
      revert: "SeparationOfDuties",
      code: "separation_of_duties",
      // The receiver already acted on this order as receiver.
      given: async (l) => {
        await approve(l);
        await l.recordGoodsReceipt({ ...ref, commitment: fresh() });
        await l.openPaymentDispute({ ...ref, commitment: fresh(), as: "buyer" });
      },
      when: (l) => l.closePaymentDispute({ ...ref, commitment: fresh(), as: "receiver" }),
    },
  ];

  it.each(rows)("$revert -> $code", async ({ revert, code, report, given, when }) => {
    const ledger = await ledgerWithReport(report ?? "repair_claimed");
    await given?.(ledger);
    const error = await when(ledger).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LedgerError);
    expect(error).toMatchObject({ contractError: revert, code });
  });

  it("covers every custom error InstitutionFinance declares", () => {
    const declared = [
      "ZeroValue",
      "Unauthorized",
      "SeparationOfDuties",
      "WorkOrderAlreadyExists",
      "WorkOrderNotFound",
      "ReportNotFound",
      "InvalidOrderState",
      "DuplicateCommitment",
      "StaleInvoice",
      "NoInvoice",
      "NoGoodsReceipt",
      "MatchNotPassing",
      "DisputeOpen",
      "NoOpenDispute",
      "RepairNotVerified",
    ];
    expect(new Set(rows.map((row) => row.revert))).toEqual(new Set(declared));
  });

  it("leaves no trace of a refused write", async () => {
    const ledger = await ledgerWithReport("verified");
    await acknowledged(ledger);
    const invoice = fresh();
    await ledger.submitInvoice({ ...ref, commitment: invoice });
    await ledger.recordGoodsReceipt({ ...ref, commitment: fresh() });
    // Refused for a stale invoice: its fingerprint must stay usable, as after a revert.
    const match = fresh();
    await expect(
      ledger.recordMatchResult({
        ...ref,
        invoiceCommitment: fresh(),
        passed: true,
        commitment: match,
      }),
    ).rejects.toMatchObject({ contractError: "StaleInvoice" });
    await ledger.recordMatchResult({
      ...ref,
      invoiceCommitment: invoice,
      passed: true,
      commitment: match,
    });
    expect(await ledger.probeRelease(ref)).toEqual({ allowed: true, revert: null });
  });
});

describe("finance book: accounts and roles, as the contract sees them", () => {
  const order = idToBytes32(ORDER);
  const report = idToBytes32(REPORT);

  /** A book with assignable roles, standing in for the factory's `roleOf`. */
  function world(reportStatus: ChainStatus = "verified") {
    const roles = new Map<string, ChainRole>([
      ["0xbuyer", "buyer"],
      ["0xsupplier", "supplier"],
      ["0xsupplier2", "supplier"],
      ["0xreceiver", "receiver"],
      ["0xregistrar", "registrar"],
      ["0xapprover", "payment_approver"],
      ["0xschool", "school_admin"],
      ["0xreviewer", "reviewer"],
    ]);
    const actedForSchool = new Set<string>(["0xschool"]);
    const reviewed = new Set<string>(["0xreviewer"]);
    const book = createFinanceBook(
      { roleOf: (account) => roles.get(account) ?? null },
      {
        statusOf: (id) => (id === report ? reportStatus : "none"),
        hasActedForSchool: (_id, account) => actedForSchool.has(account),
        hasReviewed: (_id, account) => reviewed.has(account),
      },
    );
    return { book, roles };
  }

  function matchedOrder(reportStatus: ChainStatus = "verified") {
    const w = world(reportStatus);
    w.book.approveWorkOrder("0xbuyer", order, report, fresh());
    w.book.acknowledgeWorkOrder("0xsupplier", order);
    const invoice = fresh();
    w.book.submitInvoice("0xsupplier", order, invoice);
    w.book.recordGoodsReceipt("0xreceiver", order, fresh());
    w.book.recordMatchResult("0xregistrar", order, invoice, true, fresh());
    return w;
  }

  const thrown = (run: () => void) => {
    try {
      run();
    } catch (error) {
      if (error instanceof LedgerError) return error.contractError;
      throw error;
    }
    return null;
  };

  it("refuses each step to an account that does not hold its role", () => {
    const { book } = world();
    expect(
      thrown(() => book.approveWorkOrder("0xsupplier", order, report, fresh())),
    ).toBe("Unauthorized");
    expect(thrown(() => book.approveWorkOrder("0xnobody", order, report, fresh()))).toBe(
      "Unauthorized",
    );
    book.approveWorkOrder("0xbuyer", order, report, fresh());
    expect(thrown(() => book.acknowledgeWorkOrder("0xreceiver", order))).toBe(
      "Unauthorized",
    );
    // A supplier records a goods receipt: refused.
    expect(thrown(() => book.recordGoodsReceipt("0xsupplier", order, fresh()))).toBe(
      "Unauthorized",
    );
    book.acknowledgeWorkOrder("0xsupplier", order);
    expect(thrown(() => book.submitInvoice("0xreceiver", order, fresh()))).toBe(
      "Unauthorized",
    );
    const invoice = fresh();
    book.submitInvoice("0xsupplier", order, invoice);
    // Only the platform relayer records a match.
    expect(
      thrown(() => book.recordMatchResult("0xapprover", order, invoice, true, fresh())),
    ).toBe("Unauthorized");
    // A supplier cannot raise a payment dispute. It already acted as supplier.
    expect(thrown(() => book.openPaymentDispute("0xsupplier", order, fresh()))).toBe(
      "SeparationOfDuties",
    );
    expect(thrown(() => book.openPaymentDispute("0xapprover", order, fresh()))).toBe(
      "Unauthorized",
    );
  });

  it("binds the order to the supplier that acknowledged it", () => {
    const { book } = world();
    book.approveWorkOrder("0xbuyer", order, report, fresh());
    book.acknowledgeWorkOrder("0xsupplier", order);
    expect(book.getWorkOrder(order)).toMatchObject({ supplier: "0xsupplier" });
    // Another account with the supplier role is still not this order's supplier.
    expect(thrown(() => book.submitInvoice("0xsupplier2", order, fresh()))).toBe(
      "Unauthorized",
    );
    expect(thrown(() => book.submitInvoice("0xsupplier", order, fresh()))).toBeNull();
  });

  it("refuses the buyer, the supplier and the receiver as authoriser of their own order", () => {
    const { book } = matchedOrder();
    for (const account of ["0xbuyer", "0xsupplier", "0xreceiver", "0xregistrar"]) {
      expect(book.releaseBlocker(account, order)).toBe("SeparationOfDuties");
      expect(thrown(() => book.authoriseRelease(account, order, fresh()))).toBe(
        "SeparationOfDuties",
      );
    }
    // An account that never touched the order, without the role: Unauthorized.
    expect(book.releaseBlocker("0xsupplier2", order)).toBe("Unauthorized");
    expect(book.releaseBlocker("0xapprover", order)).toBeNull();
  });

  it("remembers the first role for ever, even after the factory role changed", () => {
    const { book, roles } = matchedOrder();
    // The buyer is re-assigned as payment approver: still refused on this order.
    roles.set("0xbuyer", "payment_approver");
    expect(book.actedAs(order, "0xbuyer")).toBe("buyer");
    expect(book.releaseBlocker("0xbuyer", order)).toBe("SeparationOfDuties");
    // On an order it never touched, the new role works.
    const second = idToBytes32("00000000-0000-4000-8000-0000000000a2");
    roles.set("0xbuyer2", "buyer");
    book.approveWorkOrder("0xbuyer2", second, report, fresh());
    expect(book.releaseBlocker("0xbuyer", second)).toBe("InvalidOrderState");
  });

  it("refuses an authoriser who acted for the institution on the report or reviewed it", () => {
    const { book, roles } = matchedOrder();
    // Both held another role when they acted on the report, and hold the approver role now.
    roles.set("0xschool", "payment_approver");
    roles.set("0xreviewer", "payment_approver");
    expect(book.releaseBlocker("0xschool", order)).toBe("SeparationOfDuties");
    expect(book.releaseBlocker("0xreviewer", order)).toBe("SeparationOfDuties");
  });

  it("checks separation of duties before the role, and the role before the order state", () => {
    const { book } = world("reported");
    book.approveWorkOrder("0xbuyer", order, report, fresh());
    // Order only approved, no invoice, no receipt, repair unverified: the buyer
    // is told about separation of duties, a stranger about the role, and only
    // the real approver reaches the order state.
    expect(book.releaseBlocker("0xbuyer", order)).toBe("SeparationOfDuties");
    expect(book.releaseBlocker("0xnobody", order)).toBe("Unauthorized");
    expect(book.releaseBlocker("0xapprover", order)).toBe("InvalidOrderState");
  });

  it("does not record a role for an account whose call was refused", () => {
    const { book } = world();
    book.approveWorkOrder("0xbuyer", order, report, fresh());
    // The approver tries too early. The revert undoes the note, as on chain.
    expect(thrown(() => book.authoriseRelease("0xapprover", order, fresh()))).toBe(
      "InvalidOrderState",
    );
    expect(book.actedAs(order, "0xapprover")).toBeNull();
    expect(book.actedAs(order, "0xbuyer")).toBe("buyer");
  });

  it("lets only the opener close a dispute, under the role it opened it with", () => {
    const { book, roles } = matchedOrder();
    book.openPaymentDispute("0xreceiver", order, fresh());
    expect(book.getWorkOrder(order)).toMatchObject({
      disputeOpen: true,
      disputeOpener: "0xreceiver",
    });
    // The buyer acted as buyer on this order, so it cannot act as receiver.
    expect(thrown(() => book.closePaymentDispute("0xbuyer", order, fresh()))).toBe(
      "SeparationOfDuties",
    );
    // Another receiver holds the right role but is not the opener.
    roles.set("0xreceiver2", "receiver");
    expect(thrown(() => book.closePaymentDispute("0xreceiver2", order, fresh()))).toBe(
      "Unauthorized",
    );
    expect(
      thrown(() => book.closePaymentDispute("0xreceiver", order, fresh())),
    ).toBeNull();
    expect(book.getWorkOrder(order)).toMatchObject({
      disputeOpen: false,
      disputeOpener: null,
    });
  });
});
