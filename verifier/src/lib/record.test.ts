import { describe, expect, it } from "vitest";
import { readVerifyFragment } from "./link";
import {
  checkDocument,
  documentWords,
  readDocument,
  readRecord,
  recordFromLink,
} from "./record";

const REPORT_ID = "123e4567-e89b-42d3-a456-426614174000";
const SALT = `0x${"5a".repeat(32)}`;

const receipt = (event: string) => ({
  chainId: "eip155:43113",
  contractAddress: "0xa8BB5Dc1c031d850AB32768Ed020e9aA604e1aae",
  txId: `0x${"ab12".repeat(16)}`,
  status: "confirmed",
  blockNumber: 48_123_456,
  blockTimestamp: "2026-11-18T08:17:00.000Z",
  event,
});

const REPORT_DOCUMENT = {
  type: "report",
  reportId: REPORT_ID,
  institutionId: "7d1e2f3a-0000-4000-8000-000000000002",
  category: "sanitation",
  title: "Toilets in block B have no water",
  description: "Learners cannot wash their hands.",
  createdAt: "2026-11-18T08:16:40.000Z",
  salt: SALT,
};

const REVIEW_DOCUMENT = {
  type: "review",
  reviewId: "7d1e2f3a-0000-4000-8000-000000000009",
  reportId: REPORT_ID,
  claimId: "7d1e2f3a-0000-4000-8000-000000000008",
  outcome: "verified",
  findings: "Water runs in all four taps.",
  evidenceDigests: [],
  createdAt: "2026-11-20T09:00:00.000Z",
  salt: SALT,
};

/** The sample receipt the BonaBlock preview hands out: no event, no transaction. */
const PREVIEW_SAMPLE = {
  sample: true,
  note: "Sample receipt from the BonaBlock preview. This is not an Avalanche transaction.",
  chainId: "bona:memory",
  contractAddress: null,
  txId: null,
  status: "simulated",
  blockNumber: null,
  blockTimestamp: null,
};

describe("readRecord", () => {
  it("works out what the person must supply from the receipt itself", () => {
    const cases: [string, string][] = [
      ["EvidenceRegistered", "evidence"],
      ["ReportRegistered", "document"],
      ["InterimProtectionRecorded", "document"],
      ["RepairClaimed", "document"],
      ["RepairVerified", "document"],
      ["RepairDisputed", "document"],
      ["ReportAcknowledged", "acknowledgement"],
    ];
    for (const [event, mode] of cases) {
      const read = readRecord(JSON.stringify(receipt(event), null, 2));
      expect(read, event).toEqual({
        kind: "record",
        record: { receipt: receipt(event), event, mode },
      });
    }
  });

  it("reads a receipt with anything around it", () => {
    const text = `Here is my receipt:\n${JSON.stringify(receipt("EvidenceRegistered"))}\nThanks`;
    expect(readRecord(text).kind).toBe("record");
  });

  it("recognises sample receipts and never treats them as records", () => {
    expect(readRecord(JSON.stringify(PREVIEW_SAMPLE))).toEqual({
      kind: "sample",
      receipt: PREVIEW_SAMPLE,
    });
    // The in-memory development ledger writes complete-looking receipts.
    const memory = { ...receipt("EvidenceRegistered"), chainId: "bona:memory" };
    expect(readRecord(JSON.stringify(memory))).toEqual({
      kind: "sample",
      receipt: memory,
    });
    expect(
      readRecord(JSON.stringify({ receipt: PREVIEW_SAMPLE, document: { sample: true } })),
    ).toEqual({ kind: "sample", receipt: PREVIEW_SAMPLE });
  });

  it("says when the record's details were pasted in place of the receipt", () => {
    expect(readRecord(JSON.stringify(REPORT_DOCUMENT))).toEqual({ kind: "document" });
  });

  it("refuses everything else without throwing", () => {
    expect(readRecord("")).toEqual({ kind: "empty" });
    expect(readRecord("   \n")).toEqual({ kind: "empty" });
    for (const text of [
      "hello",
      "{",
      "[1,2,3]",
      "42",
      "null",
      JSON.stringify({ event: "Transfer", txId: "0x1" }),
      JSON.stringify({ receipt: { event: "Transfer" } }),
      "https://example.org/#v1.nonsense",
      "v1.nonsense",
    ]) {
      expect(readRecord(text), text).toEqual({ kind: "unreadable" });
    }
  });

  it("takes a receipt and its document copied together", () => {
    const read = readRecord(
      JSON.stringify({ receipt: receipt("ReportRegistered"), document: REPORT_DOCUMENT }),
    );
    expect(read).toEqual({
      kind: "record",
      record: {
        receipt: receipt("ReportRegistered"),
        event: "ReportRegistered",
        mode: "document",
        document: REPORT_DOCUMENT,
      },
    });
  });

  it("reads a pasted BonaBlock Verify link", () => {
    const link =
      "Check this: https://bona-verify.vercel.app/#v1.43113.E.qLtdwcAx2FCrMnaO0CDpqmBOGq4.qxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxI.Ej5FZ-ibQtOkVkJmFBdAAA.UGhvdG8gMQ thanks";
    const read = readRecord(link);
    expect(read.kind).toBe("record");
    if (read.kind !== "record") return;
    expect(read.record).toMatchObject({
      event: "EvidenceRegistered",
      mode: "evidence",
      label: "Photo 1",
      reportId: REPORT_ID,
    });
  });
});

describe("recordFromLink", () => {
  const linkFor = (event: string, extra = "") => {
    const read = readVerifyFragment(
      `#v1.43113.${event}.qLtdwcAx2FCrMnaO0CDpqmBOGq4.qxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxI${extra}`,
    );
    if (read.kind !== "link") throw new Error("not a link");
    return read.link;
  };

  it("carries the report id for an acknowledgement, so nobody types it", () => {
    const read = recordFromLink(linkFor("A", ".Ej5FZ-ibQtOkVkJmFBdAAA"));
    expect(read).toMatchObject({
      kind: "record",
      record: {
        event: "ReportAcknowledged",
        mode: "acknowledgement",
        reportId: REPORT_ID,
      },
    });
  });

  it("keeps a document only for a record that is anchored as one", () => {
    const document = Buffer.from(JSON.stringify(REPORT_DOCUMENT)).toString("base64url");
    const report = recordFromLink(linkFor("R", `...${document}`));
    expect(report).toMatchObject({
      kind: "record",
      record: { document: REPORT_DOCUMENT },
    });
    const evidence = recordFromLink(linkFor("E", `...${document}`));
    expect(evidence.kind === "record" && evidence.record.document).toBeUndefined();
  });

  it("notes a document that was cut short", () => {
    const read = recordFromLink(linkFor("R", "...eyJ0eXBlIjoicmVwb3J0Iiwic"));
    expect(read).toMatchObject({ kind: "record", record: { documentDamaged: true } });
  });

  it("refuses an event it does not know", () => {
    expect(
      recordFromLink({ receipt: { ...linkFor("E").receipt, event: "Transfer" } }),
    ).toEqual({ kind: "unreadable" });
  });
});

describe("checkDocument", () => {
  it("accepts the document the receipt needs", () => {
    expect(checkDocument(REPORT_DOCUMENT, "ReportRegistered")).toEqual({
      ok: true,
      document: REPORT_DOCUMENT,
    });
    expect(checkDocument(REVIEW_DOCUMENT, "RepairVerified").ok).toBe(true);
    // Copied together with its receipt.
    expect(
      checkDocument({ receipt: {}, document: REPORT_DOCUMENT }, "ReportRegistered"),
    ).toEqual({ ok: true, document: REPORT_DOCUMENT });
  });

  it("explains an incomplete document in plain words and keeps the exact reason", () => {
    const unsalted: Record<string, unknown> = { ...REPORT_DOCUMENT };
    delete unsalted.salt;
    const read = checkDocument(unsalted, "ReportRegistered");
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problem).toMatch(/Copy document/);
    expect(read.problem).not.toMatch(/salt|JSON|commitment/i);
    expect(read.detail).toMatch(/salt/);
  });

  it("refuses a document for a different kind of record", () => {
    const read = checkDocument(REVIEW_DOCUMENT, "ReportRegistered");
    expect(read).toMatchObject({ ok: false });
    if (read.ok) return;
    expect(read.problem).toMatch(/a review, but the receipt is for a report/);
  });

  it("refuses a review whose outcome is not the receipt's", () => {
    expect(checkDocument(REVIEW_DOCUMENT, "RepairDisputed").ok).toBe(false);
    expect(
      checkDocument({ ...REVIEW_DOCUMENT, outcome: "disputed" }, "RepairDisputed").ok,
    ).toBe(true);
  });

  it("refuses a sample document and a receipt pasted twice", () => {
    const sample = checkDocument(
      { sample: true, type: "report", reportId: REPORT_ID, salt: null },
      "ReportRegistered",
    );
    expect(sample).toMatchObject({ ok: false });
    if (!sample.ok) expect(sample.problem).toMatch(/sample/);

    const again = checkDocument(receipt("ReportRegistered"), "ReportRegistered");
    if (!again.ok) expect(again.problem).toMatch(/receipt again/);
    expect(again.ok).toBe(false);
  });

  it("reads pasted text", () => {
    expect(
      readDocument(`  ${JSON.stringify(REPORT_DOCUMENT)}\n`, "ReportRegistered").ok,
    ).toBe(true);
    expect(readDocument("not the details", "ReportRegistered").ok).toBe(false);
  });
});

describe("documentWords", () => {
  it("lists the words a person can read back, and nothing technical", () => {
    expect(documentWords(REPORT_DOCUMENT).map((word) => word.name)).toEqual([
      "Title",
      "Description",
      "Category",
      "Written",
    ]);
    const review = documentWords(REVIEW_DOCUMENT);
    expect(review.map((word) => word.name)).toEqual(["Outcome", "Findings", "Written"]);
    expect(JSON.stringify(review)).not.toContain(SALT);
  });
});
