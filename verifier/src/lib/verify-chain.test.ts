import { encodeAbiParameters, encodeEventTopics, type AbiEvent } from "viem";
import { describe, expect, it, vi } from "vitest";
import { institutionFinanceEventsAbi } from "../abi/bona-chain";
import { bonaRegistryAbi } from "../abi/bona-registry";
import {
  computeCommitment,
  documentProblems,
  DOCUMENT_FIELDS,
  idToBytes32,
} from "./canonical";
import { loadVerifierConfig, trustedContracts } from "./config";
import { EVENT_BY_CODE, readVerifyFragment } from "./link";
import { nothingToCompare, nounFor, plainAnswer, RECORD_NAME } from "./plain";
import { modeForEvent } from "./receipt-text";
import { checkDocument, documentWords, readRecord, recordFromLink } from "./record";
import {
  EVENT_RULE,
  FINANCE_EVENTS,
  OPERATIONS_EVENTS,
  REGISTRY_EVENTS,
  familyOf,
  verify,
  type ChainReader,
  type RegistryEvent,
  type TxReceiptLike,
  type VerifyContext,
  type VerifyResult,
} from "./verify";

/*
 * Bona Chain: receipts from the contracts a BonaChainFactory created, and the
 * procurement trail. Every chain answer here is fabricated in the test; no
 * network is touched.
 */

/* ------------------------------ Fabricated chain ----------------------------- */

const FACTORY = "0xfafafafafafafafafafafafafafafafafafafafa";
const OPERATIONS = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const FINANCE = "0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2";
/** A contract somebody else deployed. It emits events of exactly the right shape. */
const FAKE = "0xbadbadbadbadbadbadbadbadbadbadbadbadbadb";
/** The earlier single BonaRegistry. */
const REGISTRY = "0x1111111111111111111111111111111111111111";
const ACTOR = "0x3333333333333333333333333333333333333333";
const TX = `0x${"ab".repeat(32)}` as const;
const REPORT_UUID = "123e4567-e89b-12d3-a456-426614174000";
const OTHER_UUID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const INSTITUTION_UUID = "7d1e2f3a-0000-4000-8000-000000000002";
const ORDER_UUID = "0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3";
const REPORT_ID = idToBytes32(REPORT_UUID);
const ORDER_ID = idToBytes32(ORDER_UUID);
const TS = 1_763_000_000n;
const SALT = `0x${"5a".repeat(32)}`;

const ledgerAbi = [...bonaRegistryAbi, ...institutionFinanceEventsAbi] as const;

/** Build a structurally correct log exactly as the EVM would emit it. */
function fakeLog(
  eventName: RegistryEvent,
  args: Record<string, unknown>,
  address: string,
) {
  const event = ledgerAbi.find(
    (entry) => entry.type === "event" && entry.name === eventName,
  ) as AbiEvent;
  const topics = encodeEventTopics({
    abi: [event],
    args: args as never,
  }) as `0x${string}`[];
  const nonIndexed = event.inputs.filter((input) => !input.indexed);
  const data = encodeAbiParameters(
    nonIndexed,
    nonIndexed.map((input) => args[input.name!]),
  );
  return { address, data, topics };
}

/** A finance event log. `extra` holds the payload between the ids and the actor. */
const financeLog = (
  eventName: RegistryEvent,
  extra: Record<string, unknown> = {},
  address = FINANCE,
  ids: { workOrderId?: string; reportId?: string } = {},
) =>
  fakeLog(
    eventName,
    {
      workOrderId: ids.workOrderId ?? ORDER_ID,
      reportId: ids.reportId ?? REPORT_ID,
      actor: ACTOR,
      timestamp: TS,
      ...extra,
    },
    address,
  );

function txReceipt(logs: TxReceiptLike["logs"], to: string): TxReceiptLike {
  return { status: "success", to, blockNumber: 42n, logs };
}

/** What the factory answers for `kindOf`: 1 operations, 2 finance, 0 anything else. */
const KINDS: Record<string, number> = { [OPERATIONS]: 1, [FINANCE]: 2 };

function reader(tx: TxReceiptLike | null, kinds: Record<string, number> | Error = KINDS) {
  return {
    getChainId: vi.fn(async () => 43113),
    getTransactionReceipt: vi.fn(async () => tx),
    getContractKind: vi.fn(async (_factory: string, address: string) => {
      if (kinds instanceof Error) throw kinds;
      return kinds[address.toLowerCase()] ?? 0;
    }),
  } satisfies ChainReader;
}

function receiptFor(event: RegistryEvent, contractAddress: string) {
  return {
    chainId: "eip155:43113",
    contractAddress,
    txId: TX,
    status: "confirmed",
    blockNumber: 42,
    blockTimestamp: "2026-11-20T10:00:00.000Z",
    event,
  };
}

/** A verifier set up for Bona Chain: VERIFY_FACTORY_ADDRESS, and optionally the old registry. */
const withFactory = (chain: ChainReader, registry?: string): VerifyContext => ({
  chain,
  expectedChainId: 43113,
  expectedFactoryAddress: FACTORY,
  expectedContractAddress: registry,
});

const step = (r: VerifyResult, id: string) => r.steps.find((s) => s.id === id);

/* --------------------------------- Documents -------------------------------- */

const LINES = [
  { sku: "PIPE-20", description: "20 mm pipe, 6 m", quantity: 4, unitPriceCents: 18_500 },
  { sku: "TAP-01", description: "Brass tap", quantity: 6, unitPriceCents: 9_900 },
];

const reportDoc = {
  type: "report",
  reportId: REPORT_UUID,
  institutionId: INSTITUTION_UUID,
  category: "water",
  title: "No water in the junior block",
  description: "Taps have been dry for a week.",
  createdAt: "2026-11-16T09:30:00.000Z",
  salt: SALT,
};

const workOrderDoc = {
  type: "work_order",
  workOrderId: ORDER_UUID,
  reportId: REPORT_UUID,
  institutionId: INSTITUTION_UUID,
  version: 1,
  description: "Restore water to the junior block",
  lines: LINES,
  totalCents: 133_400,
  currency: "ZAR",
  createdAt: "2026-11-19T07:00:00.000Z",
  salt: SALT,
};

const invoiceDoc = {
  type: "supplier_invoice",
  invoiceId: "1c8d2e3f-4051-4b6c-9d7e-8f90a1b2c3d4",
  workOrderId: ORDER_UUID,
  reportId: REPORT_UUID,
  invoiceNumber: "INV-0042",
  orderVersion: 1,
  lines: LINES,
  totalCents: 133_400,
  currency: "ZAR",
  createdAt: "2026-11-19T09:00:00.000Z",
  salt: SALT,
};

const goodsReceiptDoc = {
  type: "goods_receipt",
  receiptId: "2d9e3f40-5162-4c7d-8e8f-90a1b2c3d4e5",
  workOrderId: ORDER_UUID,
  reportId: REPORT_UUID,
  orderVersion: 1,
  lines: LINES.map(({ sku, description, quantity }) => ({ sku, description, quantity })),
  evidenceDigests: [`0x${"e1".repeat(32)}`],
  createdAt: "2026-11-19T10:00:00.000Z",
  salt: SALT,
};

const matchDoc = (outcome: "pass" | "fail") => ({
  type: "match_result",
  matchId: "3eaf4051-6273-4d8e-9f90-a1b2c3d4e5f6",
  workOrderId: ORDER_UUID,
  reportId: REPORT_UUID,
  workOrderCommitment: `0x${"a1".repeat(32)}`,
  invoiceCommitment: `0x${"a2".repeat(32)}`,
  receiptCommitments: [`0x${"a3".repeat(32)}`],
  outcome,
  reasons:
    outcome === "pass"
      ? []
      : [{ code: "quantity_mismatch", sku: "TAP-01", expected: 6, actual: 8 }],
  engineVersion: "1",
  createdAt: "2026-11-19T10:00:01.000Z",
  salt: SALT,
});

const releaseDoc = {
  type: "release_decision",
  releaseId: "4fb05162-7384-4e9f-a0a1-b2c3d4e5f607",
  workOrderId: ORDER_UUID,
  reportId: REPORT_UUID,
  matchCommitment: `0x${"b1".repeat(32)}`,
  reviewCommitment: `0x${"b2".repeat(32)}`,
  decision: "authorised",
  createdAt: "2026-11-20T08:00:00.000Z",
  salt: SALT,
};

/** A finance event that anchors a document: the log the contract emits for it. */
async function anchored(
  event: RegistryEvent,
  document: Record<string, unknown>,
  address = FINANCE,
) {
  const commitment = await computeCommitment(document);
  const extra: Record<string, unknown> = { commitment };
  if (event === "InvoiceSubmitted") extra.invoiceIndex = 0n;
  if (event === "GoodsReceiptRecorded") extra.receiptIndex = 0n;
  if (event === "MatchRecorded") {
    extra.invoiceCommitment = document.invoiceCommitment;
    extra.passed = document.outcome === "pass";
  }
  return { commitment, log: financeLog(event, extra, address) };
}

/* ---------------------------------- Tests ---------------------------------- */

describe("genuine and fake contracts (VERIFY_FACTORY_ADDRESS)", () => {
  it("accepts an operations contract the factory created, for a report-flow record", async () => {
    const commitment = await computeCommitment(reportDoc);
    const log = fakeLog(
      "ReportRegistered",
      {
        reportId: REPORT_ID,
        // The schoolId slot carries the institution id.
        schoolId: idToBytes32(INSTITUTION_UUID),
        commitment,
        registrar: ACTOR,
        timestamp: TS,
      },
      OPERATIONS,
    );
    const chain = reader(txReceipt([log], OPERATIONS));
    const result = await verify(
      {
        receipt: receiptFor("ReportRegistered", OPERATIONS),
        source: { kind: "document", document: reportDoc },
      },
      withFactory(chain),
    );
    expect(result.overall).toBe("VERIFIED");
    expect(chain.getContractKind).toHaveBeenCalledWith(FACTORY, OPERATIONS);
    expect(step(result, "contract")).toMatchObject({ status: "pass" });
    expect(step(result, "contract")!.detail).toContain("InstitutionOperations");
    expect(result.facts).toMatchObject({
      contractKind: "operations",
      recomputedDigest: commitment,
      reportIdOnChain: REPORT_ID,
    });
    expect(result.verifier).toEqual({
      chainId: 43113,
      expectedContractAddress: null,
      expectedFactoryAddress: FACTORY,
    });
  });

  it("accepts a finance contract the factory created, for a work order approval", async () => {
    const { commitment, log } = await anchored("WorkOrderApproved", workOrderDoc);
    const chain = reader(txReceipt([log], FINANCE));
    const result = await verify(
      {
        receipt: receiptFor("WorkOrderApproved", FINANCE),
        source: { kind: "document", document: workOrderDoc },
      },
      withFactory(chain),
    );
    expect(result.overall).toBe("VERIFIED");
    expect(chain.getContractKind).toHaveBeenCalledWith(FACTORY, FINANCE);
    expect(step(result, "contract")!.detail).toContain("InstitutionFinance");
    expect(step(result, "reportId")).toMatchObject({ status: "pass" });
    expect(result.facts).toMatchObject({
      contractKind: "finance",
      recomputedDigest: commitment,
      reportIdOnChain: REPORT_ID,
      workOrderIdOnChain: ORDER_ID,
      eventTimestamp: new Date(Number(TS) * 1000).toISOString(),
    });
  });

  it("rejects a contract the factory did not create, however good its events look", async () => {
    // A perfect look-alike: right event, right fingerprint, right report, right order.
    const { log } = await anchored("WorkOrderApproved", workOrderDoc, FAKE);
    const chain = reader(txReceipt([log], FAKE));
    const result = await verify(
      {
        receipt: receiptFor("WorkOrderApproved", FAKE),
        source: { kind: "document", document: workOrderDoc },
      },
      withFactory(chain),
    );
    expect(result.overall).toBe("REJECTED");
    expect(result.summary).toBe(
      "This contract was not created by the Bona Chain factory.",
    );
    expect(step(result, "contract")).toMatchObject({ status: "fail" });
    expect(chain.getContractKind).toHaveBeenCalledWith(FACTORY, FAKE);
    // The look-alike transaction is never even read.
    expect(chain.getTransactionReceipt).not.toHaveBeenCalled();

    const answer = plainAnswer(result, {
      event: "WorkOrderApproved",
      noun: nounFor("WorkOrderApproved"),
      network: "Avalanche Fuji test network",
    });
    expect(answer.title).toBe("Not a Bona Chain record");
    expect(answer.body).toContain(
      "This contract was not created by the Bona Chain factory",
    );
    expect(answer.tone).toBe("warn");
  });

  it("rejects a fake contract for a report-flow record too", async () => {
    const commitment = await computeCommitment(reportDoc);
    const log = fakeLog(
      "ReportRegistered",
      {
        reportId: REPORT_ID,
        schoolId: idToBytes32(INSTITUTION_UUID),
        commitment,
        registrar: ACTOR,
        timestamp: TS,
      },
      FAKE,
    );
    const result = await verify(
      {
        receipt: receiptFor("ReportRegistered", FAKE),
        source: { kind: "document", document: reportDoc },
      },
      withFactory(reader(txReceipt([log], FAKE))),
    );
    expect(result.overall).toBe("REJECTED");
    expect(result.summary).toBe(
      "This contract was not created by the Bona Chain factory.",
    );
  });

  it("rejects a finance record that names an operations contract, and the reverse", async () => {
    const { log } = await anchored("InvoiceSubmitted", invoiceDoc, OPERATIONS);
    const finance = await verify(
      {
        receipt: receiptFor("InvoiceSubmitted", OPERATIONS),
        source: { kind: "document", document: invoiceDoc },
      },
      withFactory(reader(txReceipt([log], OPERATIONS))),
    );
    expect(finance.overall).toBe("REJECTED");
    expect(step(finance, "contract")!.detail).toMatch(
      /InstitutionOperations contract, but a InvoiceSubmitted record can only come from an InstitutionFinance/,
    );
    expect(finance.facts.contractKind).toBe("operations");
    const answer = plainAnswer(finance, {
      event: "InvoiceSubmitted",
      noun: nounFor("InvoiceSubmitted"),
      network: "Avalanche Fuji test network",
    });
    expect(answer.title).toBe("Not a record of this kind");

    const reverse = await verify(
      {
        receipt: receiptFor("ReportAcknowledged", FINANCE),
        source: { kind: "none" },
        reportId: REPORT_UUID,
      },
      withFactory(reader(txReceipt([], FINANCE))),
    );
    expect(reverse.overall).toBe("REJECTED");
    expect(step(reverse, "contract")).toMatchObject({ status: "fail" });
  });

  it("never says Verified when the factory cannot be read", async () => {
    const { log } = await anchored("WorkOrderApproved", workOrderDoc);
    const request = {
      receipt: receiptFor("WorkOrderApproved", FINANCE),
      source: { kind: "document", document: workOrderDoc } as const,
    };
    const down = await verify(
      request,
      withFactory(reader(txReceipt([log], FINANCE), new Error("returned no data"))),
    );
    expect(down.overall).toBe("CANNOT_VERIFY");
    expect(step(down, "contract")).toMatchObject({ status: "fail" });
    expect(step(down, "contract")!.detail).toContain("returned no data");

    // A chain reader that cannot ask the factory at all is not a reason to trust the receipt.
    const { getChainId, getTransactionReceipt } = reader(txReceipt([log], FINANCE));
    const blind = await verify(
      request,
      withFactory({ getChainId, getTransactionReceipt }),
    );
    expect(blind.overall).toBe("CANNOT_VERIFY");
    expect(getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("rejects a receipt for another network before asking the factory anything", async () => {
    const chain = reader(null);
    const result = await verify(
      {
        receipt: { ...receiptFor("WorkOrderApproved", FINANCE), chainId: "eip155:43114" },
        source: { kind: "document", document: workOrderDoc },
      },
      withFactory(chain),
    );
    expect(result.overall).toBe("REJECTED");
    expect(chain.getContractKind).not.toHaveBeenCalled();
    expect(chain.getChainId).not.toHaveBeenCalled();
  });
});

describe("earlier BonaRegistry receipts keep verifying", () => {
  const ackLog = (address: string) =>
    fakeLog(
      "ReportAcknowledged",
      {
        reportId: REPORT_ID,
        schoolId: idToBytes32(INSTITUTION_UUID),
        schoolAdmin: ACTOR,
        timestamp: TS,
      },
      address,
    );
  const request = {
    receipt: receiptFor("ReportAcknowledged", REGISTRY),
    source: { kind: "none" } as const,
    reportId: REPORT_UUID,
  };

  it("with VERIFY_CONTRACT_ADDRESS alone, exactly as before", async () => {
    const chain = reader(txReceipt([ackLog(REGISTRY)], REGISTRY));
    const result = await verify(request, {
      chain,
      expectedChainId: 43113,
      expectedContractAddress: REGISTRY,
    });
    expect(result.overall).toBe("VERIFIED");
    expect(chain.getContractKind).not.toHaveBeenCalled();
    expect(result.verifier).toEqual({
      chainId: 43113,
      expectedContractAddress: REGISTRY,
    });
    // And a different contract is still rejected without touching the network.
    const other = await verify(
      { ...request, receipt: receiptFor("ReportAcknowledged", OPERATIONS) },
      { chain, expectedChainId: 43113, expectedContractAddress: REGISTRY },
    );
    expect(other.overall).toBe("REJECTED");
  });

  it("next to a factory: the registry by its address, factory contracts by the factory", async () => {
    const old = reader(txReceipt([ackLog(REGISTRY)], REGISTRY));
    const viaRegistry = await verify(request, withFactory(old, REGISTRY));
    expect(viaRegistry.overall).toBe("VERIFIED");
    expect(viaRegistry.facts.contractKind).toBe("registry");
    // The registry is pinned by address: the factory is not asked about it.
    expect(old.getContractKind).not.toHaveBeenCalled();

    const fresh = reader(txReceipt([ackLog(OPERATIONS)], OPERATIONS));
    const viaFactory = await verify(
      { ...request, receipt: receiptFor("ReportAcknowledged", OPERATIONS) },
      withFactory(fresh, REGISTRY),
    );
    expect(viaFactory.overall).toBe("VERIFIED");
    expect(fresh.getContractKind).toHaveBeenCalledWith(FACTORY, OPERATIONS);

    const fake = await verify(
      { ...request, receipt: receiptFor("ReportAcknowledged", FAKE) },
      withFactory(reader(txReceipt([ackLog(FAKE)], FAKE)), REGISTRY),
    );
    expect(fake.overall).toBe("REJECTED");
  });

  it("rejects a finance record that names the registry: it records none", async () => {
    const { log } = await anchored("ReleaseAuthorised", releaseDoc, REGISTRY);
    const chain = reader(txReceipt([log], REGISTRY));
    const result = await verify(
      {
        receipt: receiptFor("ReleaseAuthorised", REGISTRY),
        source: { kind: "document", document: releaseDoc },
      },
      withFactory(chain, REGISTRY),
    );
    expect(result.overall).toBe("REJECTED");
    expect(chain.getChainId).not.toHaveBeenCalled();
  });
});

describe("the procurement trail", () => {
  const documentBacked: [RegistryEvent, Record<string, unknown>][] = [
    ["WorkOrderApproved", workOrderDoc],
    ["InvoiceSubmitted", invoiceDoc],
    ["GoodsReceiptRecorded", goodsReceiptDoc],
    ["MatchRecorded", matchDoc("pass")],
    ["MatchRecorded", matchDoc("fail")],
    ["ReleaseAuthorised", releaseDoc],
  ];

  it.each(documentBacked)(
    "%s is VERIFIED when the event holds the document's commitment",
    async (event, document) => {
      const { commitment, log } = await anchored(event, document);
      const result = await verify(
        { receipt: receiptFor(event, FINANCE), source: { kind: "document", document } },
        withFactory(reader(txReceipt([log], FINANCE))),
      );
      expect(result.overall).toBe("VERIFIED");
      expect(result.facts.recomputedDigest).toBe(commitment);
      expect(result.facts.workOrderIdOnChain).toBe(ORDER_ID);
      expect(step(result, "reportId")).toMatchObject({ status: "pass" });
      if (event === "MatchRecorded") {
        expect(result.facts.matchPassed).toBe(document.outcome === "pass");
      }
    },
  );

  it.each(documentBacked)(
    "%s is MISMATCH when one field of the document was altered",
    async (event, document) => {
      const { log } = await anchored(event, document);
      const altered = { ...document, createdAt: "2026-11-19T07:00:00.001Z" };
      const result = await verify(
        {
          receipt: receiptFor(event, FINANCE),
          source: { kind: "document", document: altered },
        },
        withFactory(reader(txReceipt([log], FINANCE))),
      );
      expect(result.overall).toBe("MISMATCH");
    },
  );

  it("notices a single changed price inside a line", async () => {
    const { log } = await anchored("InvoiceSubmitted", invoiceDoc);
    const padded = {
      ...invoiceDoc,
      lines: [{ ...LINES[0], unitPriceCents: 18_501 }, LINES[1]],
    };
    const result = await verify(
      {
        receipt: receiptFor("InvoiceSubmitted", FINANCE),
        source: { kind: "document", document: padded },
      },
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(result.overall).toBe("MISMATCH");
    expect(result.facts.onChainValue).toBe(await computeCommitment(invoiceDoc));
  });

  it("requires MatchRecorded's passed flag to equal the document's outcome", async () => {
    // The fingerprint of a FAILED match, recorded on the ledger as passed.
    const failed = matchDoc("fail");
    const commitment = await computeCommitment(failed);
    const lying = financeLog("MatchRecorded", {
      invoiceCommitment: failed.invoiceCommitment,
      passed: true,
      commitment,
    });
    const result = await verify(
      {
        receipt: receiptFor("MatchRecorded", FINANCE),
        source: { kind: "document", document: failed },
      },
      withFactory(reader(txReceipt([lying], FINANCE))),
    );
    expect(result.overall).toBe("MISMATCH");
    expect(result.summary).toBe(
      "The ledger records a different match outcome from the one in this document.",
    );
    expect(step(result, "event")).toMatchObject({ status: "fail" });
    expect(result.facts.matchPassed).toBe(true);
    const answer = plainAnswer(result, {
      event: "MatchRecorded",
      noun: nounFor("MatchRecorded"),
      network: "Avalanche Fuji test network",
    });
    expect(answer.title).toBe("The outcome does not agree");
    expect(answer.tone).toBe("bad");
  });

  it("checks the passed flag for a fingerprint computed in the browser too", async () => {
    const passed = matchDoc("pass");
    const { commitment, log } = await anchored("MatchRecorded", passed);
    const chain = () => withFactory(reader(txReceipt([log], FINANCE)));
    const request = {
      receipt: receiptFor("MatchRecorded", FINANCE),
      source: { kind: "digest", digest: commitment } as const,
      reportId: REPORT_UUID,
      workOrderId: ORDER_UUID,
    };
    expect((await verify({ ...request, matchPassed: true }, chain())).overall).toBe(
      "VERIFIED",
    );
    expect((await verify({ ...request, matchPassed: false }, chain())).overall).toBe(
      "MISMATCH",
    );
    // Without a stated outcome the fingerprint alone is compared, and the flag is reported.
    const bare = await verify(request, chain());
    expect(bare.overall).toBe("VERIFIED");
    expect(bare.facts.matchPassed).toBe(true);
  });

  it("is MISMATCH when the document belongs to a different work order or report", async () => {
    const commitment = await computeCommitment(workOrderDoc);
    const elsewhere = financeLog("WorkOrderApproved", { commitment }, FINANCE, {
      workOrderId: idToBytes32(OTHER_UUID),
    });
    const order = await verify(
      {
        receipt: receiptFor("WorkOrderApproved", FINANCE),
        source: { kind: "document", document: workOrderDoc },
      },
      withFactory(reader(txReceipt([elsewhere], FINANCE))),
    );
    expect(order.overall).toBe("MISMATCH");
    expect(order.summary).toBe("The anchored content belongs to a different work order.");

    const otherReport = financeLog("WorkOrderApproved", { commitment }, FINANCE, {
      reportId: idToBytes32(OTHER_UUID),
    });
    const report = await verify(
      {
        receipt: receiptFor("WorkOrderApproved", FINANCE),
        source: { kind: "document", document: workOrderDoc },
      },
      withFactory(reader(txReceipt([otherReport], FINANCE))),
    );
    expect(report.overall).toBe("MISMATCH");
    expect(report.summary).toBe("The anchored content belongs to a different report.");
  });

  it("rejects the wrong kind of document for a finance receipt, without touching the network", async () => {
    const cases: [RegistryEvent, Record<string, unknown>][] = [
      ["WorkOrderApproved", invoiceDoc],
      ["InvoiceSubmitted", workOrderDoc],
      ["GoodsReceiptRecorded", invoiceDoc],
      ["ReleaseAuthorised", matchDoc("pass")],
      ["MatchRecorded", { ...matchDoc("pass"), outcome: "matched" }],
      ["ReleaseAuthorised", { ...releaseDoc, decision: "paid" }],
      ["WorkOrderApproved", { ...workOrderDoc, salt: undefined }],
    ];
    for (const [event, document] of cases) {
      const chain = reader(null);
      const result = await verify(
        { receipt: receiptFor(event, FINANCE), source: { kind: "document", document } },
        withFactory(chain),
      );
      expect(result.overall, `${event} with ${String(document.type)}`).toBe("REJECTED");
      expect(chain.getChainId).not.toHaveBeenCalled();
    }
  });

  it("checks a supplier's acknowledgement by its presence, for the right report", async () => {
    const log = financeLog("WorkOrderAcknowledged");
    const request = {
      receipt: receiptFor("WorkOrderAcknowledged", FINANCE),
      source: { kind: "none" } as const,
    };
    const ok = await verify(
      { ...request, reportId: REPORT_UUID },
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(ok.overall).toBe("VERIFIED");
    expect(ok.facts.recomputedDigest).toBeUndefined();
    expect(ok.facts.workOrderIdOnChain).toBe(ORDER_ID);

    const other = await verify(
      { ...request, reportId: OTHER_UUID },
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(other.overall).toBe("MISMATCH");

    const withDocument = await verify(
      { ...request, source: { kind: "document", document: workOrderDoc } },
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(withDocument.overall).toBe("REJECTED");
  });

  it.each(["PaymentDisputeOpened", "PaymentDisputeClosed"] as const)(
    "checks %s by its presence, or against a fingerprint the caller supplies",
    async (event) => {
      const commitment = `0x${"d1".repeat(32)}`;
      const log = financeLog(event, { commitment });
      const chain = () => withFactory(reader(txReceipt([log], FINANCE)));
      const receipt = receiptFor(event, FINANCE);

      // It holds a fingerprint that nothing was compared with: recorded, not verified.
      const present = await verify(
        { receipt, source: { kind: "none" }, reportId: REPORT_UUID },
        chain(),
      );
      expect(present.overall).toBe("RECORDED");
      expect(present.facts.onChainValue).toBe(commitment);

      const same = await verify(
        { receipt, source: { kind: "digest", digest: commitment } },
        chain(),
      );
      expect(same.overall).toBe("VERIFIED");
      const different = await verify(
        { receipt, source: { kind: "digest", digest: `0x${"d2".repeat(32)}` } },
        chain(),
      );
      expect(different.overall).toBe("MISMATCH");

      // No document format is published for a dispute: one cannot be hashed here.
      const withDocument = await verify(
        { receipt, source: { kind: "document", document: releaseDoc } },
        chain(),
      );
      expect(withDocument.overall).toBe("REJECTED");
    },
  );

  it("is NOT_FOUND when the transaction holds a different finance event", async () => {
    const { log } = await anchored("InvoiceSubmitted", invoiceDoc);
    const result = await verify(
      {
        receipt: receiptFor("WorkOrderApproved", FINANCE),
        source: { kind: "document", document: workOrderDoc },
      },
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(result.overall).toBe("NOT_FOUND");
    expect(step(result, "event")!.detail).toContain("InvoiceSubmitted");
  });

  it("still checks a finance receipt when nothing is pinned, by the receipt's own address", async () => {
    const { log } = await anchored("GoodsReceiptRecorded", goodsReceiptDoc);
    const chain = reader(txReceipt([log], FINANCE));
    const result = await verify(
      {
        receipt: receiptFor("GoodsReceiptRecorded", FINANCE),
        source: { kind: "document", document: goodsReceiptDoc },
      },
      { chain, expectedChainId: 43113 },
    );
    expect(result.overall).toBe("VERIFIED");
    expect(chain.getContractKind).not.toHaveBeenCalled();
    expect(result.facts.contractKind).toBeUndefined();
  });
});

describe("hashing the finance documents", () => {
  const samples: Record<string, unknown>[] = [
    workOrderDoc,
    invoiceDoc,
    goodsReceiptDoc,
    matchDoc("pass"),
    matchDoc("fail"),
    releaseDoc,
  ];

  it("knows the five finance document types", () => {
    expect(Object.keys(DOCUMENT_FIELDS)).toEqual([
      "report",
      "interim_protection",
      "repair_claim",
      "review",
      "work_order",
      "supplier_invoice",
      "goods_receipt",
      "match_result",
      "release_decision",
    ]);
    for (const sample of samples) expect(documentProblems(sample)).toBeNull();
  });

  it("ignores keys outside the schema, at the top and inside lines and reasons", async () => {
    for (const sample of samples) {
      const noisy: Record<string, unknown> = {
        ...sample,
        receipt: { txId: "0x" },
        id: 7,
      };
      for (const key of ["lines", "reasons"]) {
        if (Array.isArray(sample[key])) {
          noisy[key] = (sample[key] as Record<string, unknown>[]).map((item) => ({
            ...item,
            note: "not part of the schema",
          }));
        }
      }
      expect(await computeCommitment(noisy)).toBe(await computeCommitment(sample));
    }
  });

  it("changes with every committed field", async () => {
    for (const sample of samples) {
      const original = await computeCommitment(sample);
      for (const key of DOCUMENT_FIELDS[sample.type as keyof typeof DOCUMENT_FIELDS]) {
        if (key === "type") continue;
        const changed = { ...sample, [key]: "changed" };
        expect(
          await computeCommitment(changed),
          `${String(sample.type)}.${key}`,
        ).not.toBe(original);
      }
    }
  });

  it("names a missing field, and never accepts a document without its salt", () => {
    const { totalCents: _total, ...noTotal } = workOrderDoc;
    expect(documentProblems(noTotal)).toMatch(/missing field\(s\): totalCents/);
    const { salt: _salt, ...unsalted } = releaseDoc;
    expect(documentProblems(unsalted)).toMatch(/salt/);
  });
});

describe("names, links and records for the procurement trail", () => {
  it("lists fifteen events: the report flow, then the trail in order", () => {
    expect(REGISTRY_EVENTS).toEqual([...OPERATIONS_EVENTS, ...FINANCE_EVENTS]);
    expect(FINANCE_EVENTS).toEqual([
      "WorkOrderApproved",
      "WorkOrderAcknowledged",
      "InvoiceSubmitted",
      "GoodsReceiptRecorded",
      "MatchRecorded",
      "PaymentDisputeOpened",
      "PaymentDisputeClosed",
      "ReleaseAuthorised",
    ]);
    for (const event of OPERATIONS_EVENTS) expect(familyOf(event)).toBe("operations");
    for (const event of FINANCE_EVENTS) expect(familyOf(event)).toBe("finance");
    expect(Object.keys(EVENT_RULE).sort()).toEqual([...REGISTRY_EVENTS].sort());
  });

  it("names each step in plain words", () => {
    expect(RECORD_NAME.WorkOrderApproved).toBe("A work order approval");
    expect(RECORD_NAME.InvoiceSubmitted).toBe("A supplier invoice");
    expect(RECORD_NAME.GoodsReceiptRecorded).toBe("A goods receipt");
    expect(RECORD_NAME.MatchRecorded).toBe("A three-way match result");
    expect(RECORD_NAME.ReleaseAuthorised).toBe("A release authorisation");
    expect(RECORD_NAME.WorkOrderAcknowledged).toMatch(/acknowledgement of a work order/);
    expect(nounFor("InvoiceSubmitted")).toBe("invoice");
    expect(nounFor("ReleaseAuthorised")).toBe("release authorisation");
  });

  it("says what a Verified finance record does and does not show, and never says paid", () => {
    const verified = (event: RegistryEvent, facts: VerifyResult["facts"] = {}) =>
      plainAnswer(
        {
          overall: "VERIFIED",
          summary: "",
          steps: [],
          facts: { recomputedDigest: `0x${"11".repeat(32)}`, ...facts },
          verifier: { chainId: 43113, expectedContractAddress: null },
        },
        { event, noun: nounFor(event), network: "Avalanche Fuji test network" },
      );
    const release = verified("ReleaseAuthorised");
    expect(release.body).toBe(
      "Avalanche has this exact release authorisation on record. It has not been changed.",
    );
    expect(release.note).toMatch(/release instruction\. No money moves/);
    expect(verified("WorkOrderApproved").note).toMatch(
      /does not show that the work was done/,
    );
    expect(verified("MatchRecorded", { matchPassed: true }).note).toMatch(/agreed/);
    expect(verified("MatchRecorded", { matchPassed: false }).note).toMatch(
      /did not agree, so no release can be authorised/,
    );
    for (const event of FINANCE_EVENTS) {
      const answer = verified(event);
      expect(`${answer.title} ${answer.body} ${answer.note ?? ""}`).not.toMatch(
        /\bpaid\b|payment was made|resolved/i,
      );
      expect(answer.tone).toBe("good");
    }
  });

  it("speaks of the right thing when there is nothing to compare", () => {
    const present = (event: RegistryEvent, reportIdExpected?: `0x${string}`) =>
      plainAnswer(
        {
          overall: "VERIFIED",
          summary: "",
          steps: [],
          facts: { reportIdExpected },
          verifier: { chainId: 43113, expectedContractAddress: null },
        },
        { event, noun: nounFor(event), network: "Avalanche Fuji test network" },
      );
    expect(present("WorkOrderAcknowledged", REPORT_ID).body).toBe(
      "Avalanche has a record that the supplier acknowledged the work order for this report.",
    );
    // The school's acknowledgement keeps its own words.
    expect(present("ReportAcknowledged", REPORT_ID).body).toBe(
      "Avalanche has a record that the school acknowledged this report.",
    );
    expect(nothingToCompare("ReportAcknowledged")).toMatch(
      /^This receipt is for a school.s acknowledgement of a report\./,
    );
    expect(nothingToCompare("WorkOrderAcknowledged")).toMatch(
      /^This receipt is for a supplier's acknowledgement of a work order\./,
    );
    expect(nothingToCompare("PaymentDisputeOpened")).toMatch(
      /^This receipt is for a payment dispute being opened\./,
    );
  });

  it("asks for a document, or for nothing, by the event", () => {
    for (const event of [
      "WorkOrderApproved",
      "InvoiceSubmitted",
      "GoodsReceiptRecorded",
      "MatchRecorded",
      "ReleaseAuthorised",
    ] as const) {
      expect(modeForEvent(event)).toBe("document");
    }
    for (const event of [
      "WorkOrderAcknowledged",
      "PaymentDisputeOpened",
      "PaymentDisputeClosed",
    ] as const) {
      expect(modeForEvent(event)).toBe("acknowledgement");
    }
  });

  it("reads the link letters W K I G M O L Z", () => {
    expect("WKIGMOLZ".split("").map((letter) => EVENT_BY_CODE[letter])).toEqual([
      ...FINANCE_EVENTS,
    ]);
    expect(Object.keys(EVENT_BY_CODE)).toHaveLength(REGISTRY_EVENTS.length);
    expect(Object.values(EVENT_BY_CODE).sort()).toEqual([...REGISTRY_EVENTS].sort());
  });

  it("reads a finance record from a link, with its document", () => {
    const base64Url = (hex: string) =>
      Buffer.from(hex.slice(2), "hex").toString("base64url");
    const contract = base64Url(FINANCE);
    const tx = base64Url(TX);
    const encoded = Buffer.from(JSON.stringify(invoiceDoc), "utf8").toString("base64url");
    const read = readVerifyFragment(`#v1.43113.I.${contract}.${tx}...${encoded}`);
    if (read.kind !== "link") throw new Error(read.kind);
    expect(read.link.receipt).toEqual({
      chainId: "eip155:43113",
      contractAddress: FINANCE,
      txId: TX,
      event: "InvoiceSubmitted",
    });
    const record = recordFromLink(read.link);
    if (record.kind !== "record") throw new Error(record.kind);
    expect(record.record).toMatchObject({
      event: "InvoiceSubmitted",
      mode: "document",
      document: invoiceDoc,
    });

    // The supplier's acknowledgement needs nothing more, and keeps no document.
    const ack = readRecord(`#v1.43113.K.${contract}.${tx}...${encoded}`);
    if (ack.kind !== "record") throw new Error(ack.kind);
    expect(ack.record.mode).toBe("acknowledgement");
    expect(ack.record.document).toBeUndefined();
  });

  it("matches a pasted document to its receipt in plain words", () => {
    expect(checkDocument(invoiceDoc, "InvoiceSubmitted")).toEqual({
      ok: true,
      document: invoiceDoc,
    });
    const wrong = checkDocument(invoiceDoc, "WorkOrderApproved");
    expect(wrong).toMatchObject({ ok: false });
    if (!wrong.ok) {
      expect(wrong.problem).toContain(
        "These details are for a supplier invoice, but the receipt is for a work order.",
      );
    }
    expect(
      checkDocument({ ...matchDoc("pass"), outcome: "matched" }, "MatchRecorded"),
    ).toMatchObject({ ok: false });
    expect(checkDocument(matchDoc("fail"), "MatchRecorded")).toMatchObject({ ok: true });
  });

  it("reads back the words and the total of a finance document", () => {
    expect(documentWords(invoiceDoc)).toEqual([
      { name: "Invoice number", text: "INV-0042" },
      { name: "Lines", text: "2 lines" },
      { name: "Total", text: "ZAR 1334.00" },
      { name: "Written", text: "2026-11-19T09:00:00.000Z" },
    ]);
    expect(documentWords(releaseDoc)).toEqual([
      { name: "Decision", text: "authorised" },
      { name: "Written", text: "2026-11-20T08:00:00.000Z" },
    ]);
    // A report document reads back as it always did.
    expect(documentWords(reportDoc).map((word) => word.name)).toEqual([
      "Title",
      "Description",
      "Category",
      "Written",
    ]);
  });
});

describe("verifier configuration", () => {
  it("reads VERIFY_FACTORY_ADDRESS next to VERIFY_CONTRACT_ADDRESS", () => {
    const config = loadVerifierConfig({
      VERIFY_FACTORY_ADDRESS: FACTORY.toUpperCase().replace("0X", "0x"),
      VERIFY_CONTRACT_ADDRESS: REGISTRY,
    });
    expect(config.expectedFactoryAddress).toBe(FACTORY);
    expect(config.expectedContractAddress).toBe(REGISTRY);
    expect(loadVerifierConfig({}).expectedFactoryAddress).toBeUndefined();
    expect(() => loadVerifierConfig({ VERIFY_FACTORY_ADDRESS: "0x1234" })).toThrow(
      /VERIFY_FACTORY_ADDRESS is not an EVM address/,
    );
  });

  it("says in words whose receipts are accepted", () => {
    expect(trustedContracts({})).toBeNull();
    expect(trustedContracts({ expectedContractAddress: REGISTRY })).toBe(REGISTRY);
    expect(trustedContracts({ expectedFactoryAddress: FACTORY })).toBe(
      `contracts created by the Bona Chain factory ${FACTORY}`,
    );
    expect(
      trustedContracts({
        expectedFactoryAddress: FACTORY,
        expectedContractAddress: REGISTRY,
      }),
    ).toBe(
      `contracts created by the Bona Chain factory ${FACTORY}, and the earlier registry ${REGISTRY}`,
    );
  });
});
