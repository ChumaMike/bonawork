import { encodeAbiParameters, encodeEventTopics, type AbiEvent } from "viem";
import { describe, expect, it, vi } from "vitest";
import { institutionFinanceEventsAbi } from "../abi/bona-chain";
import { bonaRegistryAbi } from "../abi/bona-registry";
import { computeCommitment, idToBytes32 } from "./canonical";
import {
  matchOutcomeWords,
  nounFor,
  OUTCOME_GUIDE,
  plainAnswer,
  stepName,
} from "./plain";
import {
  FINANCE_EVENTS,
  OPERATIONS_EVENTS,
  verify,
  type ChainReader,
  type RegistryEvent,
  type TxReceiptLike,
  type VerifyContext,
  type VerifyResult,
} from "./verify";

/*
 * "Recorded on Avalanche": what a signed-out visitor gets. A public link
 * carries the receipt and no document, because the details of a finance step
 * are private. The verifier then checks everything that can be checked without
 * them, and says exactly that. Every chain answer here is fabricated.
 */

const FACTORY = "0xfafafafafafafafafafafafafafafafafafafafa";
const OPERATIONS = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const FINANCE = "0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2";
/** Deployed by somebody else. Its events have exactly the right shape. */
const FAKE = "0xbadbadbadbadbadbadbadbadbadbadbadbadbadb";
const REGISTRY = "0x1111111111111111111111111111111111111111";
const ACTOR = "0x3333333333333333333333333333333333333333";
const TX = `0x${"ab".repeat(32)}` as const;
const REPORT_UUID = "123e4567-e89b-12d3-a456-426614174000";
const OTHER_UUID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ORDER_UUID = "0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3";
const REPORT_ID = idToBytes32(REPORT_UUID);
const ORDER_ID = idToBytes32(ORDER_UUID);
const TS = 1_763_000_000n;
const FINGERPRINT = `0x${"c7".repeat(32)}` as const;
const NETWORK = "Avalanche Fuji test network";

const ledgerAbi = [...bonaRegistryAbi, ...institutionFinanceEventsAbi] as const;

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

/** The log a finance contract emits for a step that holds `FINGERPRINT`. */
function financeLog(
  eventName: RegistryEvent,
  address = FINANCE,
  extra: Record<string, unknown> = {},
) {
  const args: Record<string, unknown> = {
    workOrderId: ORDER_ID,
    reportId: REPORT_ID,
    commitment: FINGERPRINT,
    actor: ACTOR,
    timestamp: TS,
    ...extra,
  };
  if (eventName === "InvoiceSubmitted") args.invoiceIndex = 0n;
  if (eventName === "GoodsReceiptRecorded") args.receiptIndex = 0n;
  if (eventName === "MatchRecorded") {
    args.invoiceCommitment = `0x${"a2".repeat(32)}`;
    args.passed ??= true;
  }
  return fakeLog(eventName, args, address);
}

const reportLog = (address: string, commitment: string = FINGERPRINT) =>
  fakeLog(
    "ReportRegistered",
    {
      reportId: REPORT_ID,
      schoolId: idToBytes32("7d1e2f3a-0000-4000-8000-000000000002"),
      commitment,
      registrar: ACTOR,
      timestamp: TS,
    },
    address,
  );

const txReceipt = (logs: TxReceiptLike["logs"], to: string): TxReceiptLike => ({
  status: "success",
  to,
  blockNumber: 61_400_123n,
  logs,
});

function reader(tx: TxReceiptLike | null) {
  return {
    getChainId: vi.fn(async () => 43113),
    getTransactionReceipt: vi.fn(async () => tx),
    getContractKind: vi.fn(async (_factory: string, address: string) =>
      address === OPERATIONS ? 1 : address === FINANCE ? 2 : 0,
    ),
  } satisfies ChainReader;
}

/** The receipt as a public link carries it: chain, event, contract, transaction. Nothing else. */
const linkReceipt = (event: RegistryEvent, contractAddress: string) => ({
  chainId: "eip155:43113",
  contractAddress,
  txId: TX,
  event,
});

const withFactory = (chain: ChainReader, registry?: string): VerifyContext => ({
  chain,
  expectedChainId: 43113,
  expectedFactoryAddress: FACTORY,
  expectedContractAddress: registry,
});

/** What the page asks when the link brought no document: the receipt and the report id. */
const publicCheck = (event: RegistryEvent, contractAddress: string) => ({
  receipt: linkReceipt(event, contractAddress),
  source: { kind: "none" } as const,
  reportId: REPORT_UUID,
});

const step = (r: VerifyResult, id: string) => r.steps.find((s) => s.id === id);
const answerFor = (result: VerifyResult, event: RegistryEvent) =>
  plainAnswer(result, { event, noun: nounFor(event), network: NETWORK });
const wordsOf = (answer: { title: string; body: string; note?: string }) =>
  `${answer.title} ${answer.body} ${answer.note ?? ""}`;

/** The finance steps that hold a fingerprint (the supplier's acknowledgement holds none). */
const FINGERPRINTED = FINANCE_EVENTS.filter((event) => event !== "WorkOrderAcknowledged");

describe("a link without its document: recorded, not a dead end", () => {
  it("answers RECORDED for a release authorisation, with everything read from the ledger", async () => {
    const chain = reader(txReceipt([financeLog("ReleaseAuthorised")], FINANCE));
    const result = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(chain),
    );

    expect(result.overall).toBe("RECORDED");
    // Each thing the answer rests on was checked, in order.
    expect(step(result, "chain")).toMatchObject({ status: "pass" });
    expect(step(result, "network")).toMatchObject({ status: "pass" });
    expect(chain.getContractKind).toHaveBeenCalledWith(FACTORY, FINANCE);
    expect(step(result, "contract")!.detail).toContain("InstitutionFinance");
    expect(step(result, "transaction")).toMatchObject({ status: "pass" });
    expect(step(result, "event")).toMatchObject({ status: "pass" });
    expect(step(result, "event")!.detail).toContain(FINGERPRINT);
    expect(step(result, "event")!.detail).toContain("Nothing was supplied to compare");
    expect(step(result, "reportId")).toMatchObject({ status: "pass" });

    expect(result.facts).toMatchObject({
      eventName: "ReleaseAuthorised",
      contractAddress: FINANCE,
      contractKind: "finance",
      blockNumber: 61_400_123,
      eventTimestamp: new Date(Number(TS) * 1000).toISOString(),
      // The fingerprint comes from the event log itself.
      onChainValue: FINGERPRINT,
      reportIdOnChain: REPORT_ID,
      workOrderIdOnChain: ORDER_ID,
      explorerUrl: `https://testnet.snowtrace.io/tx/${TX}`,
    });
    // Nothing was recomputed: there was nothing to recompute from.
    expect(result.facts.recomputedDigest).toBeUndefined();
    expect(result.summary).toContain("its content was not checked");
  });

  it("says so in plain words, and says what it does not show", async () => {
    const result = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(reader(txReceipt([financeLog("ReleaseAuthorised")], FINANCE))),
    );
    const answer = answerFor(result, "ReleaseAuthorised");
    expect(answer).toEqual({
      tone: "good",
      title: "Recorded on Avalanche",
      body: "A release authorisation was recorded on the Avalanche Fuji test network, by a contract that the Bona Chain factory created.",
      note: "This shows the step was recorded and by which contract. The details (amounts, names, documents) are private. Someone who holds the record can paste it here to check that it matches this fingerprint.",
    });
    expect(stepName("ReleaseAuthorised")).toBe("Release authorisation");
  });

  it.each(FINGERPRINTED)("answers RECORDED for %s", async (event) => {
    const result = await verify(
      publicCheck(event, FINANCE),
      withFactory(reader(txReceipt([financeLog(event)], FINANCE))),
    );
    expect(result.overall).toBe("RECORDED");
    expect(result.facts.onChainValue).toBe(FINGERPRINT);
    expect(result.facts.contractKind).toBe("finance");

    const answer = answerFor(result, event);
    expect(answer.title).toBe("Recorded on Avalanche");
    expect(answer.tone).toBe("good");
    expect(answer.body).toContain("by a contract that the Bona Chain factory created");
    // Plain words: never "paid" or "resolved", no codes, no jargon, never mainnet.
    expect(wordsOf(answer)).not.toMatch(/\bpaid\b|payment was made|resolved/i);
    expect(wordsOf(answer)).not.toMatch(
      /VERIFIED|RECORDED|REJECTED|mainnet|hash|digest|commitment|RPC|0x/,
    );
    // It never claims the content was checked.
    expect(wordsOf(answer)).not.toMatch(/this exact|has not been changed|Verified/);
  });

  it("says in words whether the rules passed or blocked the invoice", async () => {
    const check = async (passed: boolean) => {
      const result = await verify(
        publicCheck("MatchRecorded", FINANCE),
        withFactory(
          reader(txReceipt([financeLog("MatchRecorded", FINANCE, { passed })], FINANCE)),
        ),
      );
      expect(result.overall).toBe("RECORDED");
      expect(result.facts.matchPassed).toBe(passed);
      return answerFor(result, "MatchRecorded");
    };
    expect((await check(true)).body).toBe(
      "A three-way match result was recorded on the Avalanche Fuji test network, by a contract that the Bona Chain factory created. The rules passed this invoice.",
    );
    expect((await check(false)).body).toBe(
      "A three-way match result was recorded on the Avalanche Fuji test network, by a contract that the Bona Chain factory created. The rules blocked this invoice.",
    );
    expect(matchOutcomeWords(true)).toBe("The rules passed this invoice");
    expect(matchOutcomeWords(false)).toBe("The rules blocked this invoice");
  });

  it("works the same for a report-flow record on an operations contract", async () => {
    const chain = reader(txReceipt([reportLog(OPERATIONS)], OPERATIONS));
    const result = await verify(
      publicCheck("ReportRegistered", OPERATIONS),
      withFactory(chain),
    );
    expect(result.overall).toBe("RECORDED");
    expect(result.facts).toMatchObject({
      contractKind: "operations",
      onChainValue: FINGERPRINT,
      reportIdOnChain: REPORT_ID,
    });
    const answer = answerFor(result, "ReportRegistered");
    expect(answer.title).toBe("Recorded on Avalanche");
    expect(answer.body).toBe(
      "A report was recorded on the Avalanche Fuji test network, by a contract that the Bona Chain factory created.",
    );
    expect(answer.note).toMatch(/Its details were not compared/);
  });

  it.each(
    OPERATIONS_EVENTS.filter(
      (event) => event !== "ReportAcknowledged" && event !== "ReportRegistered",
    ),
  )("answers RECORDED for %s without its content", async (event) => {
    const args: Record<string, unknown> = { reportId: REPORT_ID, timestamp: TS };
    if (event === "EvidenceRegistered") {
      Object.assign(args, {
        digest: FINGERPRINT,
        kind: 0,
        evidenceIndex: 0n,
        submitter: ACTOR,
      });
    } else if (event === "InterimProtectionRecorded") {
      Object.assign(args, {
        protectionIndex: 0n,
        commitment: FINGERPRINT,
        schoolAdmin: ACTOR,
      });
    } else if (event === "RepairClaimed") {
      Object.assign(args, {
        claimIndex: 0n,
        commitment: FINGERPRINT,
        schoolAdmin: ACTOR,
      });
    } else {
      Object.assign(args, {
        claimIndex: 0n,
        reviewCommitment: FINGERPRINT,
        reviewer: ACTOR,
      });
    }
    const result = await verify(
      publicCheck(event, OPERATIONS),
      withFactory(reader(txReceipt([fakeLog(event, args, OPERATIONS)], OPERATIONS))),
    );
    expect(result.overall).toBe("RECORDED");
    expect(result.facts.onChainValue).toBe(FINGERPRINT);
  });

  it("keeps a record that holds no fingerprint as Verified: there was nothing left to compare", async () => {
    const log = fakeLog(
      "WorkOrderAcknowledged",
      { workOrderId: ORDER_ID, reportId: REPORT_ID, actor: ACTOR, timestamp: TS },
      FINANCE,
    );
    const result = await verify(
      publicCheck("WorkOrderAcknowledged", FINANCE),
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(result.overall).toBe("VERIFIED");
    expect(result.facts.onChainValue).toBeUndefined();
  });
});

describe("recorded is never given to a record that is not there, or not Bona Chain's", () => {
  it("rejects a contract the factory did not create, however good its event looks", async () => {
    const chain = reader(txReceipt([financeLog("ReleaseAuthorised", FAKE)], FAKE));
    const result = await verify(
      publicCheck("ReleaseAuthorised", FAKE),
      withFactory(chain),
    );
    expect(result.overall).toBe("REJECTED");
    expect(result.summary).toBe(
      "This contract was not created by the Bona Chain factory.",
    );
    // The look-alike transaction is never read.
    expect(chain.getTransactionReceipt).not.toHaveBeenCalled();
    const answer = answerFor(result, "ReleaseAuthorised");
    expect(answer.title).toBe("Not a Bona Chain record");
    expect(answer.tone).toBe("warn");
    expect(wordsOf(answer)).not.toContain("Recorded on Avalanche");
  });

  it("rejects a finance step that names an operations contract", async () => {
    const result = await verify(
      publicCheck("ReleaseAuthorised", OPERATIONS),
      withFactory(
        reader(txReceipt([financeLog("ReleaseAuthorised", OPERATIONS)], OPERATIONS)),
      ),
    );
    expect(result.overall).toBe("REJECTED");
    expect(answerFor(result, "ReleaseAuthorised").title).toBe(
      "Not a record of this kind",
    );
  });

  it("rejects a transaction that was sent to another contract", async () => {
    // A genuine contract is named, but the transaction went to the fake one.
    const result = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(reader(txReceipt([financeLog("ReleaseAuthorised", FAKE)], FAKE))),
    );
    expect(result.overall).toBe("REJECTED");
    expect(step(result, "transaction")).toMatchObject({ status: "fail" });
  });

  it("finds no record when the event is not in the transaction", async () => {
    // The transaction is real and went to the right contract, but it holds another step.
    const other = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(reader(txReceipt([financeLog("InvoiceSubmitted")], FINANCE))),
    );
    expect(other.overall).toBe("NOT_FOUND");
    expect(step(other, "event")).toMatchObject({ status: "fail" });
    expect(answerFor(other, "ReleaseAuthorised")).toMatchObject({
      tone: "warn",
      title: "No record found",
    });

    // The right event, but emitted by a different contract inside the same transaction.
    const elsewhere = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(reader(txReceipt([financeLog("ReleaseAuthorised", FAKE)], FINANCE))),
    );
    expect(elsewhere.overall).toBe("NOT_FOUND");

    const none = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(reader(txReceipt([], FINANCE))),
    );
    expect(none.overall).toBe("NOT_FOUND");
  });

  it("finds no record when the transaction does not exist or failed", async () => {
    const missing = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(reader(null)),
    );
    expect(missing.overall).toBe("NOT_FOUND");
    const reverted = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(
        reader({
          ...txReceipt([financeLog("ReleaseAuthorised")], FINANCE),
          status: "reverted",
        }),
      ),
    );
    expect(reverted.overall).toBe("NOT_FOUND");
  });

  it("is a mismatch when the record is for a different report from the one in the link", async () => {
    const log = financeLog("ReleaseAuthorised", FINANCE, {
      reportId: idToBytes32(OTHER_UUID),
    });
    const result = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(result.overall).toBe("MISMATCH");
    expect(result.summary).toBe(
      "The ReleaseAuthorised record in this transaction is for a different report.",
    );
  });

  it("makes no claim about the contract when this site pins none", async () => {
    const result = await verify(publicCheck("ReleaseAuthorised", FINANCE), {
      chain: reader(txReceipt([financeLog("ReleaseAuthorised")], FINANCE)),
      expectedChainId: 43113,
    });
    expect(result.overall).toBe("RECORDED");
    const answer = answerFor(result, "ReleaseAuthorised");
    expect(answer.tone).toBe("neutral");
    expect(answer.body).not.toContain("Bona Chain");
    expect(answer.note).toMatch(/does not show that it is a Bona Chain record/);
  });

  it("names the pinned registry for an earlier BonaRegistry record", async () => {
    const chain = reader(txReceipt([reportLog(REGISTRY)], REGISTRY));
    const result = await verify(
      publicCheck("ReportRegistered", REGISTRY),
      withFactory(chain, REGISTRY),
    );
    expect(result.overall).toBe("RECORDED");
    expect(result.facts.contractKind).toBe("registry");
    expect(chain.getContractKind).not.toHaveBeenCalled();
    expect(answerFor(result, "ReportRegistered").body).toBe(
      "A report was recorded on the Avalanche Fuji test network, by the Bona Chain contract this site trusts.",
    );
  });
});

describe("with the document, the full check is unchanged", () => {
  const releaseDoc = {
    type: "release_decision",
    releaseId: "4fb05162-7384-4e9f-a0a1-b2c3d4e5f607",
    workOrderId: ORDER_UUID,
    reportId: REPORT_UUID,
    matchCommitment: `0x${"b1".repeat(32)}`,
    reviewCommitment: `0x${"b2".repeat(32)}`,
    decision: "authorised",
    createdAt: "2026-11-20T08:00:00.000Z",
    salt: `0x${"5a".repeat(32)}`,
  };

  it("is VERIFIED when the document matches the fingerprint the ledger holds", async () => {
    const commitment = await computeCommitment(releaseDoc);
    const log = financeLog("ReleaseAuthorised", FINANCE, { commitment });
    const receipt = linkReceipt("ReleaseAuthorised", FINANCE);

    // Staff link: the document travels with it.
    const carried = await verify(
      { receipt, source: { kind: "document", document: releaseDoc } },
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(carried.overall).toBe("VERIFIED");
    expect(carried.facts.recomputedDigest).toBe(commitment);
    expect(answerFor(carried, "ReleaseAuthorised")).toMatchObject({
      tone: "good",
      title: "Verified",
      body: "Avalanche has this exact release authorisation on record. It has not been changed.",
    });

    // Pasted on the page: the fingerprint is worked out on the device and sent alone.
    const pasted = await verify(
      {
        receipt,
        source: { kind: "digest", digest: commitment },
        reportId: REPORT_UUID,
        workOrderId: ORDER_UUID,
      },
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(pasted.overall).toBe("VERIFIED");

    // The same receipt with nothing: recorded, and it reports that same fingerprint.
    const bare = await verify(
      publicCheck("ReleaseAuthorised", FINANCE),
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(bare.overall).toBe("RECORDED");
    expect(bare.facts.onChainValue).toBe(commitment);
  });

  it("is a mismatch when a pasted document is not the one that was recorded", async () => {
    const log = financeLog("ReleaseAuthorised");
    const result = await verify(
      {
        receipt: linkReceipt("ReleaseAuthorised", FINANCE),
        source: { kind: "document", document: releaseDoc },
      },
      withFactory(reader(txReceipt([log], FINANCE))),
    );
    expect(result.overall).toBe("MISMATCH");
    expect(result.facts.onChainValue).toBe(FINGERPRINT);
  });

  it("still rejects a fake contract when a document is supplied", async () => {
    const commitment = await computeCommitment(releaseDoc);
    const result = await verify(
      {
        receipt: linkReceipt("ReleaseAuthorised", FAKE),
        source: { kind: "document", document: releaseDoc },
      },
      withFactory(
        reader(txReceipt([financeLog("ReleaseAuthorised", FAKE, { commitment })], FAKE)),
      ),
    );
    expect(result.overall).toBe("REJECTED");
  });
});

describe("the guide", () => {
  it("explains Recorded next to Verified, and keeps them apart", () => {
    const recorded = OUTCOME_GUIDE.find((row) => row.outcome === "RECORDED")!;
    expect(recorded.plain).toBe("Recorded on Avalanche");
    expect(recorded.means).toMatch(/Its details were not compared/);
    expect(OUTCOME_GUIDE.find((row) => row.outcome === "VERIFIED")!.means).toMatch(
      /exactly what the blockchain has on record/,
    );
  });
});
