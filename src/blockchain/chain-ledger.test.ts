import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  BlockchainReceiptSchema,
  LedgerError,
  idToBytes32,
  type ChainRole,
  type Hex32,
  type LedgerPort,
} from "@/shared";
import { loadEnv } from "@/server/env";
import { createChainLedger, type ChainLedgerConfig } from "./chain-ledger";
import { createLedger, ledgerContracts, ledgerMode } from "./index";
import { createFakeChain } from "./test/fake-chain";

/* Throw-away test keys: a repeated byte each. They hold nothing anywhere. */
const KEYS: Record<ChainRole, Hex> = {
  registrar: `0x${"11".repeat(32)}`,
  school_admin: `0x${"22".repeat(32)}`,
  reviewer: `0x${"33".repeat(32)}`,
  buyer: `0x${"44".repeat(32)}`,
  supplier: `0x${"55".repeat(32)}`,
  receiver: `0x${"66".repeat(32)}`,
  payment_approver: `0x${"77".repeat(32)}`,
};
const ADDRESS = Object.fromEntries(
  Object.entries(KEYS).map(([role, key]) => [
    role,
    privateKeyToAccount(key).address.toLowerCase(),
  ]),
) as Record<ChainRole, string>;
const roleOfAddress = (address: string | null) =>
  Object.entries(ADDRESS).find(([, a]) => a === address)?.[0] ?? null;

const FACTORY: Hex = `0x${"fa".repeat(20)}`;
const LEGACY: Hex = `0x${"0d".repeat(20)}`;
const A = {
  id: "00000000-0000-4000-8000-000000000005",
  operations: `0x${"a1".repeat(20)}` as Hex,
  finance: `0x${"a2".repeat(20)}` as Hex,
};
const B = {
  id: "00000000-0000-4000-8000-000000000006",
  operations: `0x${"b1".repeat(20)}` as Hex,
  finance: `0x${"b2".repeat(20)}` as Hex,
};
const UNKNOWN = "00000000-0000-4000-8000-000000000099";
const REPORT = "3f2b8c1e-9a4d-4e7b-8c2a-5d6e7f8091a2";
const ORDER = "7a1c2d3e-4f50-4a6b-9c8d-0e1f2a3b4c5d";
const hash = (n: number): Hex32 => `0x${n.toString(16).padStart(64, "0")}`;

function world(overrides: Partial<ChainLedgerConfig> = {}) {
  const chain = createFakeChain(FACTORY);
  chain.addInstitution(idToBytes32(A.id) as Hex, A);
  chain.addInstitution(idToBytes32(B.id) as Hex, B);
  const ledger = createChainLedger({
    rpcUrl: "http://fuji.invalid",
    chainId: "eip155:43113",
    factoryAddress: FACTORY,
    signers: KEYS,
    // Look once instead of waiting: the fake chain mines at once or not at all.
    confirmTimeoutMs: 0,
    transport: chain.transport,
    ...overrides,
  });
  return { chain, ledger };
}

const refA = { institutionId: A.id, workOrderId: ORDER };

/** Every write of the port, with the contract it must reach and the role that must sign. */
const WRITES: {
  name: string;
  run: (ledger: LedgerPort) => Promise<{ event: string; contractAddress: string }>;
  contract: "operations" | "finance";
  functionName: string;
  signer: ChainRole;
  event: string;
  args: readonly unknown[];
}[] = [
  {
    name: "registerReport",
    run: (l) =>
      l.registerReport({ reportId: REPORT, institutionId: A.id, commitment: hash(1) }),
    contract: "operations",
    functionName: "registerReport",
    signer: "registrar",
    event: "ReportRegistered",
    // No school id: the contract serves one institution.
    args: [idToBytes32(REPORT), hash(1)],
  },
  {
    name: "registerEvidence (report)",
    run: (l) =>
      l.registerEvidence({
        reportId: REPORT,
        institutionId: A.id,
        digest: hash(2),
        kind: "report",
      }),
    contract: "operations",
    functionName: "registerEvidence",
    signer: "registrar",
    event: "EvidenceRegistered",
    args: [idToBytes32(REPORT), hash(2), 0],
  },
  {
    name: "registerEvidence (repair)",
    run: (l) =>
      l.registerEvidence({
        reportId: REPORT,
        institutionId: A.id,
        digest: hash(3),
        kind: "repair",
      }),
    contract: "operations",
    functionName: "registerEvidence",
    signer: "school_admin",
    event: "EvidenceRegistered",
    args: [idToBytes32(REPORT), hash(3), 1],
  },
  {
    name: "registerEvidence (review)",
    run: (l) =>
      l.registerEvidence({
        reportId: REPORT,
        institutionId: A.id,
        digest: hash(4),
        kind: "review",
      }),
    contract: "operations",
    functionName: "registerEvidence",
    signer: "reviewer",
    event: "EvidenceRegistered",
    args: [idToBytes32(REPORT), hash(4), 2],
  },
  {
    name: "acknowledgeReport",
    run: (l) => l.acknowledgeReport({ reportId: REPORT, institutionId: A.id }),
    contract: "operations",
    functionName: "acknowledgeReport",
    signer: "school_admin",
    event: "ReportAcknowledged",
    args: [idToBytes32(REPORT)],
  },
  {
    name: "recordInterimProtection",
    run: (l) =>
      l.recordInterimProtection({
        reportId: REPORT,
        institutionId: A.id,
        commitment: hash(5),
      }),
    contract: "operations",
    functionName: "recordInterimProtection",
    signer: "school_admin",
    event: "InterimProtectionRecorded",
    args: [idToBytes32(REPORT), hash(5)],
  },
  {
    name: "claimRepair",
    run: (l) =>
      l.claimRepair({ reportId: REPORT, institutionId: A.id, commitment: hash(6) }),
    contract: "operations",
    functionName: "claimRepair",
    signer: "school_admin",
    event: "RepairClaimed",
    args: [idToBytes32(REPORT), hash(6)],
  },
  {
    name: "verifyRepair",
    run: (l) =>
      l.verifyRepair({
        reportId: REPORT,
        institutionId: A.id,
        reviewCommitment: hash(7),
      }),
    contract: "operations",
    functionName: "verifyRepair",
    signer: "reviewer",
    event: "RepairVerified",
    args: [idToBytes32(REPORT), hash(7)],
  },
  {
    name: "disputeRepair",
    run: (l) =>
      l.disputeRepair({
        reportId: REPORT,
        institutionId: A.id,
        reviewCommitment: hash(8),
      }),
    contract: "operations",
    functionName: "disputeRepair",
    signer: "reviewer",
    event: "RepairDisputed",
    args: [idToBytes32(REPORT), hash(8)],
  },
  {
    name: "approveWorkOrder",
    run: (l) => l.approveWorkOrder({ ...refA, reportId: REPORT, commitment: hash(9) }),
    contract: "finance",
    functionName: "approveWorkOrder",
    signer: "buyer",
    event: "WorkOrderApproved",
    args: [idToBytes32(ORDER), idToBytes32(REPORT), hash(9)],
  },
  {
    name: "acknowledgeWorkOrder",
    run: (l) => l.acknowledgeWorkOrder(refA),
    contract: "finance",
    functionName: "acknowledgeWorkOrder",
    signer: "supplier",
    event: "WorkOrderAcknowledged",
    args: [idToBytes32(ORDER)],
  },
  {
    name: "submitInvoice",
    run: (l) => l.submitInvoice({ ...refA, commitment: hash(10) }),
    contract: "finance",
    functionName: "submitInvoice",
    signer: "supplier",
    event: "InvoiceSubmitted",
    args: [idToBytes32(ORDER), hash(10)],
  },
  {
    name: "recordGoodsReceipt",
    run: (l) => l.recordGoodsReceipt({ ...refA, commitment: hash(11) }),
    contract: "finance",
    functionName: "recordGoodsReceipt",
    signer: "receiver",
    event: "GoodsReceiptRecorded",
    args: [idToBytes32(ORDER), hash(11)],
  },
  {
    name: "recordMatchResult",
    run: (l) =>
      l.recordMatchResult({
        ...refA,
        invoiceCommitment: hash(10),
        passed: true,
        commitment: hash(12),
      }),
    contract: "finance",
    functionName: "recordMatchResult",
    // The rule engine's result is recorded by the platform relayer.
    signer: "registrar",
    event: "MatchRecorded",
    args: [idToBytes32(ORDER), hash(10), true, hash(12)],
  },
  {
    name: "openPaymentDispute (buyer)",
    run: (l) => l.openPaymentDispute({ ...refA, commitment: hash(13), as: "buyer" }),
    contract: "finance",
    functionName: "openPaymentDispute",
    signer: "buyer",
    event: "PaymentDisputeOpened",
    args: [idToBytes32(ORDER), hash(13)],
  },
  {
    name: "openPaymentDispute (receiver)",
    run: (l) => l.openPaymentDispute({ ...refA, commitment: hash(14), as: "receiver" }),
    contract: "finance",
    functionName: "openPaymentDispute",
    signer: "receiver",
    event: "PaymentDisputeOpened",
    args: [idToBytes32(ORDER), hash(14)],
  },
  {
    name: "closePaymentDispute (buyer)",
    run: (l) => l.closePaymentDispute({ ...refA, commitment: hash(15), as: "buyer" }),
    contract: "finance",
    functionName: "closePaymentDispute",
    signer: "buyer",
    event: "PaymentDisputeClosed",
    args: [idToBytes32(ORDER), hash(15)],
  },
  {
    name: "closePaymentDispute (receiver)",
    run: (l) => l.closePaymentDispute({ ...refA, commitment: hash(16), as: "receiver" }),
    contract: "finance",
    functionName: "closePaymentDispute",
    signer: "receiver",
    event: "PaymentDisputeClosed",
    args: [idToBytes32(ORDER), hash(16)],
  },
  {
    name: "authoriseRelease",
    run: (l) => l.authoriseRelease({ ...refA, commitment: hash(17) }),
    contract: "finance",
    functionName: "authoriseRelease",
    signer: "payment_approver",
    event: "ReleaseAuthorised",
    args: [idToBytes32(ORDER), hash(17)],
  },
];

describe("Bona Chain adapter: what it is", () => {
  it("describes itself as live Fuji with live finance, named by the factory", () => {
    const { ledger } = world();
    const info = ledger.info();
    expect(info).toMatchObject({
      chainId: "eip155:43113",
      contractAddress: FACTORY,
      networkName: "Avalanche Fuji C-Chain",
      live: true,
      finance: "live",
    });
    expect(info.explorerTxUrl(hash(1))).toBe(
      `https://testnet.snowtrace.io/tx/${hash(1)}`,
    );
  });

  it("accepts Fuji only", () => {
    expect(() => world({ chainId: "eip155:43114" })).toThrow(/only eip155:43113/);
    expect(() => world({ chainId: "eip155:1" })).toThrow(LedgerError);
  });

  it("refuses two roles on one key", () => {
    expect(() => world({ signers: { ...KEYS, payment_approver: KEYS.buyer } })).toThrow(
      /different key/,
    );
    expect(() => world({ signers: { ...KEYS, reviewer: KEYS.school_admin } })).toThrow(
      /different key/,
    );
  });

  it("refuses the earlier BonaRegistry as its factory", () => {
    expect(() => world({ legacyContractAddress: FACTORY })).toThrow(/BonaChainFactory/);
  });
});

describe("Bona Chain adapter: routing and signing", () => {
  it.each(WRITES)(
    "$name goes to the institution's $contract contract, signed by the $signer key",
    async ({ run, contract, functionName, signer, event, args }) => {
      const { chain, ledger } = world();
      const receipt = await run(ledger);

      const sent = chain.sent();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ contract, functionName, to: A[contract] });
      expect(sent[0]!.args).toEqual(args);
      // The key that signed, recovered from the signed transaction itself.
      expect(roleOfAddress(sent[0]!.from)).toBe(signer);

      // Simulated first, for the same account, on the same contract.
      const simulated = chain
        .simulated()
        .filter((call) => call.functionName === functionName);
      expect(simulated).toHaveLength(1);
      expect(simulated[0]).toMatchObject({ to: A[contract], from: ADDRESS[signer] });
      expect(chain.calls.indexOf(simulated[0]!)).toBeLessThan(
        chain.calls.indexOf(sent[0]!),
      );

      expect(BlockchainReceiptSchema.safeParse(receipt).success).toBe(true);
      expect(receipt).toMatchObject({
        chainId: "eip155:43113",
        status: "confirmed",
        event,
        txId: sent[0]!.hash,
      });
      // The receipt names the institution's contract, not the factory.
      expect(receipt.contractAddress.toLowerCase()).toBe(A[contract]);
    },
  );

  it("sends each institution's writes to that institution's own contracts", async () => {
    const { chain, ledger } = world();
    await ledger.registerReport({
      reportId: REPORT,
      institutionId: A.id,
      commitment: hash(1),
    });
    await ledger.acknowledgeReport({ reportId: REPORT, institutionId: B.id });
    await ledger.approveWorkOrder({ ...refA, reportId: REPORT, commitment: hash(2) });
    await ledger.submitInvoice({
      institutionId: B.id,
      workOrderId: ORDER,
      commitment: hash(3),
    });
    expect(chain.sent().map((call) => call.to)).toEqual([
      A.operations,
      B.operations,
      A.finance,
      B.finance,
    ]);
    // Nothing is ever sent to the factory itself.
    expect(chain.sent().some((call) => call.contract === "factory")).toBe(false);
  });

  it("asks the factory once per institution and remembers the answer", async () => {
    const { chain, ledger } = world();
    await ledger.registerReport({
      reportId: REPORT,
      institutionId: A.id,
      commitment: hash(1),
    });
    await ledger.acknowledgeReport({ reportId: REPORT, institutionId: A.id });
    await ledger.approveWorkOrder({ ...refA, reportId: REPORT, commitment: hash(2) });
    await ledger.acknowledgeWorkOrder(refA);
    await ledger.probeRelease(refA);
    expect(chain.count("institutionOf")).toBe(1);

    await ledger.statusOf(REPORT, B.id);
    await ledger.statusOf(REPORT, B.id);
    expect(chain.count("institutionOf")).toBe(2);
    const lookups = chain.calls.filter((call) => call.functionName === "institutionOf");
    expect(lookups.map((call) => call.args[0])).toEqual([
      idToBytes32(A.id),
      idToBytes32(B.id),
    ]);
  });

  it("asks the factory once when several calls arrive together", async () => {
    const { chain, ledger } = world();
    await Promise.all([
      ledger.statusOf(REPORT, A.id),
      ledger.statusOf(REPORT, A.id),
      ledger.probeRelease(refA),
    ]);
    expect(chain.count("institutionOf")).toBe(1);
  });

  it("refuses an institution the factory does not know, and sends nothing", async () => {
    const { chain, ledger } = world();
    const unknown = { code: "not_found", contractError: "InstitutionNotFound" };
    await expect(
      ledger.registerReport({
        reportId: REPORT,
        institutionId: UNKNOWN,
        commitment: hash(1),
      }),
    ).rejects.toMatchObject(unknown);
    await expect(
      ledger.acknowledgeReport({ reportId: REPORT, institutionId: UNKNOWN }),
    ).rejects.toMatchObject(unknown);
    await expect(
      ledger.approveWorkOrder({
        institutionId: UNKNOWN,
        workOrderId: ORDER,
        reportId: REPORT,
        commitment: hash(2),
      }),
    ).rejects.toMatchObject(unknown);
    expect(
      await ledger.probeRelease({ institutionId: UNKNOWN, workOrderId: ORDER }),
    ).toEqual({ allowed: false, revert: "InstitutionNotFound" });
    expect(
      await ledger.probeVerify({
        reportId: REPORT,
        institutionId: UNKNOWN,
        as: "reviewer",
      }),
    ).toEqual({ allowed: false, revert: "InstitutionNotFound" });
    expect(chain.sent()).toHaveLength(0);
    expect(chain.simulated()).toHaveLength(0);

    // "Unknown" is not remembered: once the factory creates it, it is found.
    const created = {
      operations: `0x${"c1".repeat(20)}` as Hex,
      finance: `0x${"c2".repeat(20)}` as Hex,
    };
    chain.addInstitution(idToBytes32(UNKNOWN) as Hex, created);
    await ledger.registerReport({
      reportId: REPORT,
      institutionId: UNKNOWN,
      commitment: hash(1),
    });
    expect(chain.sent().map((call) => call.to)).toEqual([created.operations]);
  });

  it("finds a report's institution through the factory when the caller does not name it", async () => {
    const { chain, ledger } = world();
    // The report lives on B's operations contract; this process has never seen it.
    chain.setReportStatus(B.operations, idToBytes32(REPORT) as Hex, 3);
    expect(await ledger.statusOf(REPORT)).toBe("repair_claimed");
    await ledger.verifyRepair({ reportId: REPORT, reviewCommitment: hash(1) });
    expect(chain.sent().map((call) => call.to)).toEqual([B.operations]);
    // Found once, then remembered.
    expect(chain.count("institutionCount")).toBe(1);

    // A report nobody holds: no status, and a write is refused before anything is sent.
    const nowhere = "00000000-0000-4000-8000-0000000000ff";
    expect(await ledger.statusOf(nowhere)).toBe("none");
    await expect(ledger.acknowledgeReport({ reportId: nowhere })).rejects.toMatchObject({
      code: "not_found",
      contractError: "ReportNotFound",
    });
    expect(chain.sent()).toHaveLength(1);
  });

  it("remembers where it registered a report", async () => {
    const { chain, ledger } = world();
    await ledger.registerReport({
      reportId: REPORT,
      institutionId: B.id,
      commitment: hash(1),
    });
    await ledger.acknowledgeReport({ reportId: REPORT });
    expect(chain.sent().map((call) => call.to)).toEqual([B.operations, B.operations]);
    expect(chain.count("institutionCount")).toBe(0);
  });

  it("reads the report status from the institution's operations contract", async () => {
    const { chain, ledger } = world();
    chain.setReportStatus(A.operations, idToBytes32(REPORT) as Hex, 4);
    expect(await ledger.statusOf(REPORT, A.id)).toBe("verified");
    expect(await ledger.statusOf(REPORT, B.id)).toBe("none");
  });

  it("never writes to the earlier BonaRegistry, even if the factory pointed at it", async () => {
    const { chain, ledger } = world({ legacyContractAddress: LEGACY });
    chain.addInstitution(idToBytes32(UNKNOWN) as Hex, {
      operations: LEGACY,
      finance: LEGACY,
    });
    const refused = { code: "not_configured" };
    await expect(
      ledger.registerReport({
        reportId: REPORT,
        institutionId: UNKNOWN,
        commitment: hash(1),
      }),
    ).rejects.toMatchObject(refused);
    await expect(
      ledger.authoriseRelease({
        institutionId: UNKNOWN,
        workOrderId: ORDER,
        commitment: hash(2),
      }),
    ).rejects.toMatchObject(refused);
    expect(chain.calls.filter((call) => call.to === LEGACY)).toHaveLength(0);

    // The real institutions still work.
    await ledger.registerReport({
      reportId: REPORT,
      institutionId: A.id,
      commitment: hash(1),
    });
    expect(chain.sent().map((call) => call.to)).toEqual([A.operations]);
  });
});

describe("Bona Chain adapter: refusals and probes", () => {
  it("turns a simulated revert into the contract's error name and sends nothing", async () => {
    const { chain, ledger } = world();
    const order = idToBytes32(ORDER);
    const cases = [
      {
        revert: { errorName: "RepairNotVerified", args: [idToBytes32(REPORT), 3] },
        expected: { contractError: "RepairNotVerified", code: "release_blocked" },
      },
      {
        revert: {
          errorName: "SeparationOfDuties",
          args: [ADDRESS.payment_approver, order],
        },
        expected: {
          contractError: "SeparationOfDuties",
          code: "separation_of_duties",
        },
      },
      {
        revert: { errorName: "Unauthorized", args: [ADDRESS.payment_approver, 7] },
        expected: { contractError: "Unauthorized", code: "unauthorized" },
      },
      {
        revert: { errorName: "InvalidOrderState", args: [order, 3] },
        expected: { contractError: "InvalidOrderState", code: "invalid_state" },
      },
      {
        revert: { errorName: "MatchNotPassing", args: [order] },
        expected: { contractError: "MatchNotPassing", code: "release_blocked" },
      },
      {
        revert: { errorName: "WorkOrderNotFound", args: [order] },
        expected: { contractError: "WorkOrderNotFound", code: "not_found" },
      },
    ];
    for (const { revert, expected } of cases) {
      chain.revertWith = (call) =>
        call.functionName === "authoriseRelease" ? revert : undefined;
      const error = await ledger
        .authoriseRelease({ ...refA, commitment: hash(1) })
        .catch((e) => e);
      expect(error).toBeInstanceOf(LedgerError);
      expect(error).toMatchObject(expected);
      expect(error.message).toContain("InstitutionFinance");
    }
    expect(chain.sent()).toHaveLength(0);
  });

  it("names InstitutionOperations for a refused report write", async () => {
    const { chain, ledger } = world();
    chain.revertWith = () => ({
      errorName: "SchoolAdminCannotVerify",
      args: [ADDRESS.reviewer, idToBytes32(REPORT)],
    });
    const error = await ledger
      .verifyRepair({ reportId: REPORT, institutionId: A.id, reviewCommitment: hash(1) })
      .catch((e) => e);
    expect(error).toMatchObject({
      code: "self_verification",
      contractError: "SchoolAdminCannotVerify",
    });
    expect(error.message).toContain("InstitutionOperations");
    expect(chain.sent()).toHaveLength(0);
  });

  it("probes the release by simulation only, as the payment approver", async () => {
    const { chain, ledger } = world();
    expect(await ledger.probeRelease(refA)).toEqual({ allowed: true, revert: null });

    chain.revertWith = () => ({
      errorName: "RepairNotVerified",
      args: [idToBytes32(REPORT), 3],
    });
    expect(await ledger.probeRelease(refA)).toEqual({
      allowed: false,
      revert: "RepairNotVerified",
    });

    const probes = chain.calls.filter((call) => call.functionName === "authoriseRelease");
    expect(probes).toHaveLength(2);
    for (const probe of probes) {
      expect(probe).toMatchObject({
        via: "call",
        to: A.finance,
        from: ADDRESS.payment_approver,
      });
      expect(probe.args[0]).toBe(idToBytes32(ORDER));
      // An unused, non-zero fingerprint, so neither ZeroValue nor DuplicateCommitment answers.
      expect(probe.args[1]).not.toBe(hash(0));
    }
    expect(probes[0]!.args[1]).not.toBe(probes[1]!.args[1]);
    expect(chain.sent()).toHaveLength(0);
  });

  it("probes verification as the asked role, and shows the contract's own refusal", async () => {
    const { chain, ledger } = world();
    chain.revertWith = (call) =>
      call.from === ADDRESS.school_admin
        ? {
            errorName: "SchoolAdminCannotVerify",
            args: [ADDRESS.school_admin, idToBytes32(REPORT)],
          }
        : call.from === ADDRESS.reviewer
          ? undefined
          : { errorName: "Unauthorized", args: [call.from, 3] };
    const probe = (as: ChainRole) =>
      ledger.probeVerify({ reportId: REPORT, institutionId: A.id, as });

    expect(await probe("school_admin")).toEqual({
      allowed: false,
      revert: "SchoolAdminCannotVerify",
    });
    expect(await probe("reviewer")).toEqual({ allowed: true, revert: null });
    expect(await probe("payment_approver")).toEqual({
      allowed: false,
      revert: "Unauthorized",
    });
    const probes = chain.calls.filter((call) => call.functionName === "verifyRepair");
    expect(probes.map((call) => roleOfAddress(call.from))).toEqual([
      "school_admin",
      "reviewer",
      "payment_approver",
    ]);
    expect(probes.every((call) => call.via === "call" && call.to === A.operations)).toBe(
      true,
    );
    expect(chain.sent()).toHaveLength(0);
  });

  it("reports an unreachable RPC as such, never as a refusal", async () => {
    const { chain, ledger } = world();
    chain.outage = "connection refused";
    await expect(
      ledger.authoriseRelease({ ...refA, commitment: hash(1) }),
    ).rejects.toMatchObject({ code: "rpc_unavailable", contractError: null });
    await expect(ledger.probeRelease(refA)).rejects.toMatchObject({
      code: "rpc_unavailable",
    });
    await expect(ledger.statusOf(REPORT, A.id)).rejects.toMatchObject({
      code: "rpc_unavailable",
    });
  });
});

describe("Bona Chain adapter: receipts", () => {
  it("stays pending until the transaction is mined, then confirms on refresh", async () => {
    const { chain, ledger } = world();
    chain.autoMine = false;
    const pending = await ledger.submitInvoice({ ...refA, commitment: hash(1) });
    expect(pending).toMatchObject({
      status: "pending",
      blockNumber: null,
      blockTimestamp: null,
      event: "InvoiceSubmitted",
    });
    expect(pending.contractAddress.toLowerCase()).toBe(A.finance);
    expect(await ledger.getReceipt(pending.txId, pending.event)).toEqual(pending);

    chain.mineAll();
    const confirmed = await ledger.getReceipt(pending.txId, pending.event);
    expect(confirmed).toMatchObject({
      status: "confirmed",
      blockNumber: 100,
      blockTimestamp: "2026-11-20T10:00:00.000Z",
      txId: pending.txId,
    });
    expect(confirmed.contractAddress).toBe(pending.contractAddress);
  });

  it("learns the contract of a transaction another process sent", async () => {
    const first = world();
    first.chain.autoMine = false;
    const sent = await first.ledger.recordGoodsReceipt({ ...refA, commitment: hash(1) });

    // A second adapter on the same chain: it never sent this transaction.
    const other = createChainLedger({
      rpcUrl: "http://fuji.invalid",
      chainId: "eip155:43113",
      factoryAddress: FACTORY,
      signers: KEYS,
      confirmTimeoutMs: 0,
      transport: first.chain.transport,
    });
    const waiting = await other.getReceipt(sent.txId, sent.event);
    expect(waiting.status).toBe("pending");
    expect(waiting.contractAddress.toLowerCase()).toBe(A.finance);

    first.chain.mineAll();
    const mined = await other.getReceipt(sent.txId, sent.event);
    expect(mined.status).toBe("confirmed");
    expect(mined.contractAddress.toLowerCase()).toBe(A.finance);
    expect(BlockchainReceiptSchema.safeParse(mined).success).toBe(true);
  });
});

describe("Bona Chain adapter: finance switched off", () => {
  const financeCalls = (ledger: LedgerPort) => [
    ledger.approveWorkOrder({ ...refA, reportId: REPORT, commitment: hash(1) }),
    ledger.acknowledgeWorkOrder(refA),
    ledger.submitInvoice({ ...refA, commitment: hash(2) }),
    ledger.recordGoodsReceipt({ ...refA, commitment: hash(3) }),
    ledger.recordMatchResult({
      ...refA,
      invoiceCommitment: hash(2),
      passed: true,
      commitment: hash(4),
    }),
    ledger.openPaymentDispute({ ...refA, commitment: hash(5), as: "buyer" }),
    ledger.closePaymentDispute({ ...refA, commitment: hash(6), as: "buyer" }),
    ledger.authoriseRelease({ ...refA, commitment: hash(7) }),
    ledger.probeRelease(refA),
  ];

  it("reports not_configured for every finance call and touches nothing", async () => {
    const { chain, ledger } = world({ financeMode: "off" });
    expect(ledger.info()).toMatchObject({ live: true, finance: "off" });
    for (const call of financeCalls(ledger)) {
      await expect(call).rejects.toMatchObject({
        code: "not_configured",
        contractError: null,
      });
    }
    expect(chain.methods).toHaveLength(0);

    // The report flow is untouched.
    const receipt = await ledger.registerReport({
      reportId: REPORT,
      institutionId: A.id,
      commitment: hash(1),
    });
    expect(receipt.status).toBe("confirmed");
  });

  it("is off when a finance key is missing, and the report flow still works", async () => {
    const { chain, ledger } = world({
      signers: {
        registrar: KEYS.registrar,
        school_admin: KEYS.school_admin,
        reviewer: KEYS.reviewer,
        buyer: KEYS.buyer,
      },
    });
    expect(ledger.info().finance).toBe("off");
    for (const call of financeCalls(ledger)) {
      await expect(call).rejects.toMatchObject({ code: "not_configured" });
    }
    expect(
      await ledger.probeVerify({
        reportId: REPORT,
        institutionId: A.id,
        as: "payment_approver",
      }),
    ).toEqual({ allowed: false, revert: "Unauthorized" });
    await ledger.acknowledgeReport({ reportId: REPORT, institutionId: A.id });
    expect(chain.sent()).toHaveLength(1);
  });
});

describe("ledger selection: Bona Chain or the earlier BonaRegistry", () => {
  const base = {
    NODE_ENV: "test",
    LEDGER_RPC_URL: "https://api.avax-test.network/ext/bc/C/rpc",
    LEDGER_CHAIN_ID: "eip155:43113",
    LEDGER_REGISTRAR_PRIVATE_KEY: KEYS.registrar,
    LEDGER_SCHOOL_ADMIN_PRIVATE_KEY: KEYS.school_admin,
    LEDGER_REVIEWER_PRIVATE_KEY: KEYS.reviewer,
  };
  const financeKeys = {
    LEDGER_BUYER_PRIVATE_KEY: KEYS.buyer,
    LEDGER_SUPPLIER_PRIVATE_KEY: KEYS.supplier,
    LEDGER_RECEIVER_PRIVATE_KEY: KEYS.receiver,
    LEDGER_PAYMENT_APPROVER_PRIVATE_KEY: KEYS.payment_approver,
  };

  it("uses the Bona Chain adapter with a factory and all seven keys", () => {
    const env = loadEnv({ ...base, ...financeKeys, LEDGER_FACTORY_ADDRESS: FACTORY });
    expect(ledgerMode(env)).toBe("avalanche");
    expect(ledgerContracts(env)).toBe("bona_chain");
    expect(createLedger(env).info()).toMatchObject({
      contractAddress: FACTORY,
      live: true,
      finance: "live",
    });
  });

  it("ignores LEDGER_CONTRACT_ADDRESS once a factory is set", () => {
    const env = loadEnv({
      ...base,
      ...financeKeys,
      LEDGER_FACTORY_ADDRESS: FACTORY,
      LEDGER_CONTRACT_ADDRESS: LEGACY,
    });
    expect(ledgerContracts(env)).toBe("bona_chain");
    expect(createLedger(env).info().contractAddress).toBe(FACTORY);
  });

  it("keeps the earlier BonaRegistry path when only its address is set", async () => {
    const env = loadEnv({ ...base, ...financeKeys, LEDGER_CONTRACT_ADDRESS: LEGACY });
    expect(ledgerMode(env)).toBe("avalanche");
    expect(ledgerContracts(env)).toBe("bona_registry");
    const ledger = createLedger(env);
    expect(ledger.info()).toMatchObject({
      contractAddress: LEGACY,
      live: true,
      finance: "off",
    });
    await expect(ledger.acknowledgeWorkOrder(refA)).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  it("switches finance off with LEDGER_FINANCE_MODE=off or a missing finance key", () => {
    const off = loadEnv({
      ...base,
      ...financeKeys,
      LEDGER_FACTORY_ADDRESS: FACTORY,
      LEDGER_FINANCE_MODE: "off",
    });
    expect(createLedger(off).info()).toMatchObject({ live: true, finance: "off" });
    const partial = loadEnv({
      ...base,
      LEDGER_FACTORY_ADDRESS: FACTORY,
      LEDGER_BUYER_PRIVATE_KEY: KEYS.buyer,
    });
    expect(ledgerContracts(partial)).toBe("bona_chain");
    expect(createLedger(partial).info()).toMatchObject({ live: true, finance: "off" });
  });

  it("falls back to the memory ledger without the report-flow keys", () => {
    const env = loadEnv({ NODE_ENV: "test", LEDGER_FACTORY_ADDRESS: FACTORY });
    expect(ledgerContracts(env)).toBeNull();
    expect(ledgerMode(env)).toBe("memory");
    expect(createLedger(env).info()).toMatchObject({ live: false, finance: "simulated" });
  });

  it("refuses an environment where any two of the seven keys are the same", () => {
    const full = { ...base, ...financeKeys, LEDGER_FACTORY_ADDRESS: FACTORY };
    expect(() =>
      loadEnv({ ...full, LEDGER_PAYMENT_APPROVER_PRIVATE_KEY: KEYS.buyer }),
    ).toThrow(/must all differ/);
    expect(() =>
      loadEnv({ ...full, LEDGER_SUPPLIER_PRIVATE_KEY: KEYS.reviewer }),
    ).toThrow(/must all differ/);
    // The same key written in another case is still the same key.
    expect(() =>
      loadEnv({
        ...full,
        LEDGER_RECEIVER_PRIVATE_KEY: `0x${"AA".repeat(32)}`,
        LEDGER_SUPPLIER_PRIVATE_KEY: `0x${"aa".repeat(32)}`,
      }),
    ).toThrow(/must all differ/);
    expect(() => loadEnv(full)).not.toThrow();
  });

  it("refuses the same address as factory and as BonaRegistry", () => {
    expect(() =>
      loadEnv({
        ...base,
        LEDGER_FACTORY_ADDRESS: FACTORY,
        LEDGER_CONTRACT_ADDRESS: FACTORY.toUpperCase().replace("0X", "0x"),
      }),
    ).toThrow(/BonaChainFactory/);
  });
});
