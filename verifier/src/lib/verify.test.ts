import { encodeAbiParameters, encodeEventTopics, type AbiEvent } from "viem";
import { describe, expect, it, vi } from "vitest";
import { bonaRegistryAbi } from "../abi/bona-registry";
import { canonicalJson, computeCommitment, idToBytes32, sha256Hex } from "./canonical";
import {
  verify,
  type ChainReader,
  type OPERATIONS_EVENTS,
  type RegistryEvent,
  type TxReceiptLike,
  type VerifyResult,
} from "./verify";

/* ------------------------------ Fabricated chain ----------------------------- */

const CONTRACT = "0x1111111111111111111111111111111111111111";
const OTHER_CONTRACT = "0x2222222222222222222222222222222222222222";
const ACTOR = "0x3333333333333333333333333333333333333333";
const TX = `0x${"ab".repeat(32)}` as const;
const REPORT_UUID = "123e4567-e89b-12d3-a456-426614174000";
const OTHER_UUID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const INSTITUTION_UUID = "7d1e2f3a-0000-4000-8000-000000000002";
const REPORT_ID = idToBytes32(REPORT_UUID);
const TS = 1_763_000_000n;
const SALT = `0x${"5a".repeat(32)}`;

/** Build a structurally correct log exactly as the EVM would emit it. */
function fakeLog(
  eventName: (typeof OPERATIONS_EVENTS)[number],
  args: Record<string, unknown>,
  address = CONTRACT,
) {
  const event = bonaRegistryAbi.find(
    (e): e is Extract<typeof e, { type: "event" }> =>
      e.type === "event" && e.name === eventName,
  )!;
  const topics = encodeEventTopics({
    abi: bonaRegistryAbi,
    eventName,
    args: args as never,
  }) as `0x${string}`[];
  const nonIndexed = (event as AbiEvent).inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(
    nonIndexed,
    nonIndexed.map((i) => args[i.name!]),
  );
  return { address, data, topics };
}

const evidenceLog = (digest: `0x${string}`) =>
  fakeLog("EvidenceRegistered", {
    reportId: REPORT_ID,
    digest,
    kind: 0,
    evidenceIndex: 0n,
    submitter: ACTOR,
    timestamp: TS,
  });

const ackLog = (reportId = REPORT_ID) =>
  fakeLog("ReportAcknowledged", {
    reportId,
    schoolId: idToBytes32(INSTITUTION_UUID),
    schoolAdmin: ACTOR,
    timestamp: TS,
  });

function txReceipt(
  logs: TxReceiptLike["logs"],
  overrides: Partial<TxReceiptLike> = {},
): TxReceiptLike {
  return { status: "success", to: CONTRACT, blockNumber: 42n, logs, ...overrides };
}

function reader(tx: TxReceiptLike | null | Error, chainId: number | Error = 43113) {
  return {
    getChainId: vi.fn(async () => {
      if (chainId instanceof Error) throw chainId;
      return chainId;
    }),
    getTransactionReceipt: vi.fn(async () => {
      if (tx instanceof Error) throw tx;
      return tx;
    }),
  } satisfies ChainReader;
}

const FILE = new TextEncoder().encode("the original evidence bytes");

function receiptFor(event: RegistryEvent, extra: Record<string, unknown> = {}) {
  return {
    chainId: "eip155:43113",
    contractAddress: CONTRACT,
    txId: TX,
    status: "confirmed",
    blockNumber: 42,
    blockTimestamp: "2026-11-16T10:00:00.000Z",
    event,
    ...extra,
  };
}

const ctx = (chain: ChainReader, expectedContractAddress?: string) => ({
  chain,
  expectedChainId: 43113,
  expectedContractAddress,
});

const step = (r: VerifyResult, id: string) => r.steps.find((s) => s.id === id);

/* ---------------------------------- Tests ---------------------------------- */

describe("local hashing rules", () => {
  it("sha256Hex matches the published SHA-256 vector for 'abc'", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("canonicalJson sorts keys recursively, drops undefined and has no whitespace", () => {
    expect(canonicalJson({ b: 1, a: [true, null, { z: "x", y: undefined }] })).toBe(
      '{"a":[true,null,{"z":"x"}],"b":1}',
    );
  });

  it("idToBytes32 puts the 16 UUID bytes in the low half of the bytes32", () => {
    expect(REPORT_ID).toBe(`0x${"0".repeat(32)}123e4567e89b12d3a456426614174000`);
  });

  it("computeCommitment ignores keys outside the document schema", async () => {
    const doc = {
      type: "report",
      reportId: REPORT_UUID,
      institutionId: INSTITUTION_UUID,
      category: "water",
      title: "t",
      description: "d",
      createdAt: "2026-11-16T09:30:00.000Z",
      salt: SALT,
    };
    const withExtra = { ...doc, commitment: "0x00", receipt: null };
    expect(await computeCommitment(withExtra)).toBe(await computeCommitment(doc));
    expect(await computeCommitment(doc)).toBe(
      await sha256Hex(new TextEncoder().encode(canonicalJson(doc))),
    );
  });
});

describe("verify (evidence file)", () => {
  it("is VERIFIED when the tx carries an EvidenceRegistered log with the file's digest", async () => {
    const digest = await sha256Hex(FILE);
    const chain = reader(txReceipt([evidenceLog(digest)]));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
        reportId: REPORT_UUID,
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("VERIFIED");
    expect(result.steps.every((s) => s.status === "pass")).toBe(true);
    expect(result.facts).toMatchObject({
      recomputedDigest: digest,
      txHash: TX,
      blockNumber: 42,
      eventName: "EvidenceRegistered",
      reportIdOnChain: REPORT_ID,
      reportIdExpected: REPORT_ID,
      eventTimestamp: new Date(Number(TS) * 1000).toISOString(),
      explorerUrl: `https://testnet.snowtrace.io/tx/${TX}`,
    });
  });

  it("is MISMATCH when the file differs by a single byte", async () => {
    const digest = await sha256Hex(FILE);
    const tampered = new Uint8Array(FILE);
    tampered[0] = tampered[0]! ^ 1;
    const chain = reader(txReceipt([evidenceLog(digest)]));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: tampered },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("MISMATCH");
    expect(step(result, "event")).toMatchObject({ status: "fail" });
    expect(result.facts.onChainValue).toBe(digest);
    expect(result.facts.recomputedDigest).not.toBe(digest);
  });

  it("is NOT_FOUND when the tx has no matching event", async () => {
    const chain = reader(txReceipt([ackLog()]));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("NOT_FOUND");
    expect(step(result, "event")).toMatchObject({ status: "fail" });
    expect(step(result, "event")?.detail).toContain("ReportAcknowledged");
  });

  it("is NOT_FOUND when the transaction does not exist", async () => {
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(reader(null), CONTRACT),
    );
    expect(result.overall).toBe("NOT_FOUND");
    expect(step(result, "transaction")).toMatchObject({ status: "fail" });
    expect(step(result, "event")).toMatchObject({ status: "skip" });
  });

  it("is NOT_FOUND when the transaction reverted", async () => {
    const digest = await sha256Hex(FILE);
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(reader(txReceipt([evidenceLog(digest)], { status: "reverted" })), CONTRACT),
    );
    expect(result.overall).toBe("NOT_FOUND");
  });

  it("ignores look-alike events emitted by a different contract in the same tx", async () => {
    const digest = await sha256Hex(FILE);
    const chain = reader(
      txReceipt([{ ...evidenceLog(digest), address: OTHER_CONTRACT }]),
    );
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("NOT_FOUND");
  });

  it("rejects a receipt naming a different contract without touching the RPC", async () => {
    const digest = await sha256Hex(FILE);
    const chain = reader(txReceipt([evidenceLog(digest)]));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered", { contractAddress: OTHER_CONTRACT }),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
    expect(step(result, "contract")).toMatchObject({ status: "fail" });
    expect(chain.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("rejects a receipt for a different chain without touching the RPC", async () => {
    const digest = await sha256Hex(FILE);
    const chain = reader(txReceipt([evidenceLog(digest)]));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered", { chainId: "eip155:1" }),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
    expect(step(result, "chain")).toMatchObject({ status: "fail" });
    expect(chain.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("rejects a tx that was sent to a different contract than the receipt names", async () => {
    const digest = await sha256Hex(FILE);
    const chain = reader(txReceipt([evidenceLog(digest)], { to: OTHER_CONTRACT }));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
    expect(step(result, "transaction")).toMatchObject({ status: "fail" });
  });

  it("is CANNOT_VERIFY when the RPC throws, and never claims success", async () => {
    const chain = reader(new Error("fetch failed: ECONNREFUSED"));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("CANNOT_VERIFY");
    expect(step(result, "transaction")).toMatchObject({ status: "fail" });
    expect(step(result, "transaction")?.detail).toContain("ECONNREFUSED");
    expect(result.steps.some((s) => s.id === "event" && s.status === "pass")).toBe(false);
  });

  it("is CANNOT_VERIFY when the RPC is on the wrong network", async () => {
    const digest = await sha256Hex(FILE);
    const chain = reader(txReceipt([evidenceLog(digest)]), 43114);
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("CANNOT_VERIFY");
    expect(step(result, "network")).toMatchObject({ status: "fail" });
  });

  it("is MISMATCH when the supplied report id does not match the event's reportId", async () => {
    const digest = await sha256Hex(FILE);
    const chain = reader(txReceipt([evidenceLog(digest)]));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "bytes", bytes: FILE },
        reportId: OTHER_UUID,
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("MISMATCH");
    expect(step(result, "reportId")).toMatchObject({ status: "fail" });
  });

  it("accepts a pre-computed digest in place of the bytes", async () => {
    const digest = await sha256Hex(FILE);
    const chain = reader(txReceipt([evidenceLog(digest)]));
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "digest", digest: digest.toUpperCase() },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("VERIFIED");
  });

  it("rejects an unreadable receipt without touching the RPC", async () => {
    const chain = reader(txReceipt([]));
    const result = await verify(
      {
        receipt: { digest: "0x00", subject: { kind: "evidence" } },
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
    expect(step(result, "receipt")).toMatchObject({ status: "fail" });
    expect(chain.getChainId).not.toHaveBeenCalled();
  });

  it("rejects a document supplied for an evidence receipt", async () => {
    const result = await verify(
      {
        receipt: receiptFor("EvidenceRegistered"),
        source: { kind: "document", document: {} },
      },
      ctx(reader(txReceipt([])), CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
    expect(step(result, "receipt")?.detail).toContain("Supply the file");
  });
});

describe("verify (commitment documents)", () => {
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

  it("is VERIFIED when ReportRegistered carries the recomputed commitment and reportId", async () => {
    const commitment = await computeCommitment(reportDoc);
    const log = fakeLog("ReportRegistered", {
      reportId: REPORT_ID,
      schoolId: idToBytes32(INSTITUTION_UUID),
      commitment,
      registrar: ACTOR,
      timestamp: TS,
    });
    const result = await verify(
      {
        receipt: receiptFor("ReportRegistered"),
        source: { kind: "document", document: reportDoc },
      },
      ctx(reader(txReceipt([log])), CONTRACT),
    );
    expect(result.overall).toBe("VERIFIED");
    expect(result.facts.recomputedDigest).toBe(commitment);
    expect(step(result, "reportId")).toMatchObject({ status: "pass" });
  });

  it("is MISMATCH when one field of the document was altered", async () => {
    const commitment = await computeCommitment(reportDoc);
    const log = fakeLog("ReportRegistered", {
      reportId: REPORT_ID,
      schoolId: idToBytes32(INSTITUTION_UUID),
      commitment,
      registrar: ACTOR,
      timestamp: TS,
    });
    const altered = { ...reportDoc, description: "Taps have been dry for a day." };
    const result = await verify(
      {
        receipt: receiptFor("ReportRegistered"),
        source: { kind: "document", document: altered },
      },
      ctx(reader(txReceipt([log])), CONTRACT),
    );
    expect(result.overall).toBe("MISMATCH");
    expect(result.facts.onChainValue).toBe(commitment);
  });

  it("is MISMATCH when the document's reportId is not the event's", async () => {
    const doc = { ...reportDoc, reportId: OTHER_UUID };
    const commitment = await computeCommitment(doc);
    const log = fakeLog("ReportRegistered", {
      reportId: REPORT_ID,
      schoolId: idToBytes32(INSTITUTION_UUID),
      commitment,
      registrar: ACTOR,
      timestamp: TS,
    });
    const result = await verify(
      {
        receipt: receiptFor("ReportRegistered"),
        source: { kind: "document", document: doc },
      },
      ctx(reader(txReceipt([log])), CONTRACT),
    );
    expect(result.overall).toBe("MISMATCH");
    expect(step(result, "event")).toMatchObject({ status: "pass" });
    expect(step(result, "reportId")).toMatchObject({ status: "fail" });
  });

  it("matches InterimProtectionRecorded.commitment for an interim_protection document", async () => {
    const doc = {
      type: "interim_protection",
      protectionId: "0b6f1c2e-5d1a-4c2b-9e3f-1a2b3c4d5e6f",
      reportId: REPORT_UUID,
      measure: "Toilet block closed off with tape.",
      createdAt: "2026-11-17T08:00:00.000Z",
      salt: SALT,
    };
    const commitment = await computeCommitment(doc);
    const log = fakeLog("InterimProtectionRecorded", {
      reportId: REPORT_ID,
      protectionIndex: 0n,
      commitment,
      schoolAdmin: ACTOR,
      timestamp: TS,
    });
    const result = await verify(
      {
        receipt: receiptFor("InterimProtectionRecorded"),
        source: { kind: "document", document: doc },
      },
      ctx(reader(txReceipt([log])), CONTRACT),
    );
    expect(result.overall).toBe("VERIFIED");
  });

  it("matches RepairClaimed.commitment for a repair_claim document", async () => {
    const doc = {
      type: "repair_claim",
      claimId: "0b6f1c2e-5d1a-4c2b-9e3f-1a2b3c4d5e6f",
      reportId: REPORT_UUID,
      summary: "New taps fitted.",
      evidenceDigests: [await sha256Hex(FILE)],
      createdAt: "2026-11-20T08:00:00.000Z",
      salt: SALT,
    };
    const commitment = await computeCommitment(doc);
    const log = fakeLog("RepairClaimed", {
      reportId: REPORT_ID,
      claimIndex: 0n,
      commitment,
      schoolAdmin: ACTOR,
      timestamp: TS,
    });
    const result = await verify(
      {
        receipt: receiptFor("RepairClaimed"),
        source: { kind: "document", document: doc },
      },
      ctx(reader(txReceipt([log])), CONTRACT),
    );
    expect(result.overall).toBe("VERIFIED");
  });

  const reviewDoc = (outcome: "verified" | "disputed") => ({
    type: "review",
    reviewId: "9c1c4b2a-0000-4000-8000-000000000001",
    reportId: REPORT_UUID,
    claimId: "0b6f1c2e-5d1a-4c2b-9e3f-1a2b3c4d5e6f",
    outcome,
    findings: "Inspected on site.",
    evidenceDigests: [],
    createdAt: "2026-11-21T08:00:00.000Z",
    salt: SALT,
  });

  it("matches RepairVerified.reviewCommitment / RepairDisputed.reviewCommitment for review documents", async () => {
    for (const [event, outcome] of [
      ["RepairVerified", "verified"],
      ["RepairDisputed", "disputed"],
    ] as const) {
      const doc = reviewDoc(outcome);
      const reviewCommitment = await computeCommitment(doc);
      const log = fakeLog(event, {
        reportId: REPORT_ID,
        claimIndex: 0n,
        reviewCommitment,
        reviewer: ACTOR,
        timestamp: TS,
      });
      const result = await verify(
        { receipt: receiptFor(event), source: { kind: "document", document: doc } },
        ctx(reader(txReceipt([log])), CONTRACT),
      );
      expect(result.overall).toBe("VERIFIED");
      expect(result.facts.eventName).toBe(event);
    }
  });

  it("rejects a review whose outcome contradicts the receipt's event", async () => {
    const result = await verify(
      {
        receipt: receiptFor("RepairVerified"),
        source: { kind: "document", document: reviewDoc("disputed") },
      },
      ctx(reader(txReceipt([])), CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
  });

  it("rejects a document of the wrong type for the receipt's event", async () => {
    const result = await verify(
      {
        receipt: receiptFor("RepairClaimed"),
        source: { kind: "document", document: reportDoc },
      },
      ctx(reader(txReceipt([])), CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
    expect(step(result, "receipt")?.detail).toContain('"repair_claim" document');
  });

  it("rejects a document without its salt, without touching the RPC", async () => {
    const chain = reader(txReceipt([]));
    const { salt: _dropped, ...unsalted } = reportDoc;
    const result = await verify(
      {
        receipt: receiptFor("ReportRegistered"),
        source: { kind: "document", document: unsalted },
      },
      ctx(chain, CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
    expect(step(result, "receipt")?.detail).toContain("salt");
    expect(chain.getChainId).not.toHaveBeenCalled();
  });
});

describe("verify (ReportAcknowledged)", () => {
  it("is VERIFIED when the tx emitted ReportAcknowledged for the given report", async () => {
    const result = await verify(
      {
        receipt: receiptFor("ReportAcknowledged"),
        source: { kind: "none" },
        reportId: REPORT_UUID,
      },
      ctx(reader(txReceipt([ackLog()])), CONTRACT),
    );
    expect(result.overall).toBe("VERIFIED");
    expect(result.facts.recomputedDigest).toBeUndefined();
    expect(result.facts.reportIdOnChain).toBe(REPORT_ID);
    expect(step(result, "reportId")).toMatchObject({ status: "pass" });
  });

  it("is MISMATCH when the acknowledgement is for another report", async () => {
    const result = await verify(
      {
        receipt: receiptFor("ReportAcknowledged"),
        source: { kind: "none" },
        reportId: OTHER_UUID,
      },
      ctx(reader(txReceipt([ackLog()])), CONTRACT),
    );
    expect(result.overall).toBe("MISMATCH");
  });

  it("is NOT_FOUND when the tx did not emit ReportAcknowledged", async () => {
    const digest = await sha256Hex(FILE);
    const result = await verify(
      {
        receipt: receiptFor("ReportAcknowledged"),
        source: { kind: "none" },
        reportId: REPORT_UUID,
      },
      ctx(reader(txReceipt([evidenceLog(digest)])), CONTRACT),
    );
    expect(result.overall).toBe("NOT_FOUND");
  });

  it("rejects a file supplied for an acknowledgement receipt", async () => {
    const result = await verify(
      {
        receipt: receiptFor("ReportAcknowledged"),
        source: { kind: "bytes", bytes: FILE },
      },
      ctx(reader(txReceipt([ackLog()])), CONTRACT),
    );
    expect(result.overall).toBe("REJECTED");
  });
});
