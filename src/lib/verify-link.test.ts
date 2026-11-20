import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawQr, VERIFY_QR_MAX_VERSION } from "@/components/verify-qr";
// The verifier is a separate package that shares no code with this app. Its
// parser is imported here, in a test only, to prove that the two sides agree
// on the link format.
import { readVerifyFragment } from "../../verifier/src/lib/link";
import { VERIFY_LINK_MAX_LABEL, VERIFY_LINK_MAX_LENGTH, verifyLink } from "./verify-link";

const VERIFY_URL = "https://bona-verify.vercel.app";
const REPORT_ID = "123e4567-e89b-42d3-a456-426614174000";

const RECEIPT = {
  chainId: "eip155:43113",
  contractAddress: "0xa8BB5Dc1c031d850AB32768Ed020e9aA604e1aae",
  txId: `0x${"ab12".repeat(16)}`,
  status: "confirmed",
  blockNumber: 48_123_456,
  blockTimestamp: "2026-11-18T08:17:00.000Z",
  event: "EvidenceRegistered",
} as const;

/** What the verifier needs from a receipt. Block and time are read from the chain. */
const CARRIED = {
  chainId: "eip155:43113",
  contractAddress: RECEIPT.contractAddress.toLowerCase(),
  txId: RECEIPT.txId,
  event: "EvidenceRegistered",
};

const REPORT_DOCUMENT = {
  type: "report",
  reportId: REPORT_ID,
  institutionId: "7d1e2f3a-0000-4000-8000-000000000002",
  category: "sanitation",
  title: "Toilets in block B have no water",
  description:
    "Learners cannot wash their hands. It has been like this since Monday — “no water”.",
  createdAt: "2026-11-18T08:16:40.000Z",
  salt: `0x${"5a".repeat(32)}`,
};

/** A link's record, as BonaBlock Verify reads it. */
function opened(link: string | null) {
  expect(link).not.toBeNull();
  const read = readVerifyFragment(new URL(link!).hash);
  if (read.kind !== "link") throw new Error(`The verifier could not read ${link}`);
  return read.link;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VERIFY_URL", VERIFY_URL);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyLink", () => {
  it("round-trips an evidence receipt, its report and its label through the verifier", () => {
    const link = verifyLink(RECEIPT, {
      label: "Photo 1 · report BB-2026-000042",
      reportId: REPORT_ID,
    });
    expect(opened(link)).toEqual({
      receipt: CARRIED,
      label: "Photo 1 · report BB-2026-000042",
      reportId: REPORT_ID,
    });
  });

  it("keeps the record in the fragment, so no server is sent it", () => {
    const url = new URL(verifyLink(RECEIPT, { label: "Photo 1", reportId: REPORT_ID })!);
    expect(url.origin).toBe(VERIFY_URL);
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("");
    expect(url.hash.startsWith("#v1.43113.E.")).toBe(true);
  });

  it("produces exactly the documented format", () => {
    // The same string is pinned in verifier/src/lib/link.test.ts.
    expect(verifyLink(RECEIPT, { label: "Photo 1", reportId: REPORT_ID })).toBe(
      "https://bona-verify.vercel.app/#v1.43113.E.qLtdwcAx2FCrMnaO0CDpqmBOGq4.qxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxI.Ej5FZ-ibQtOkVkJmFBdAAA.UGhvdG8gMQ",
    );
  });

  it("leaves off what it was not given", () => {
    const link = verifyLink(RECEIPT);
    expect(link).toMatch(/#v1\.43113\.E\.[\w-]{27}\.[\w-]{43}$/);
    expect(opened(link)).toEqual({ receipt: CARRIED });
    expect(opened(verifyLink(RECEIPT, { label: "Photo 1" }))).toEqual({
      receipt: CARRIED,
      label: "Photo 1",
    });
  });

  it("keeps a verifier address that has a path, and drops a stale fragment", () => {
    vi.stubEnv("NEXT_PUBLIC_VERIFY_URL", "https://example.org/verify/#old");
    const link = verifyLink(RECEIPT)!;
    expect(link.startsWith("https://example.org/verify/#v1.")).toBe(true);
    expect(opened(link).receipt).toEqual(CARRIED);
  });

  it("returns null when the verifier address is missing or not a web address", () => {
    for (const value of [
      "",
      "/verify",
      "javascript:alert(1)",
      "bona-verify.vercel.app",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_VERIFY_URL", value);
      expect(verifyLink(RECEIPT), value).toBeNull();
    }
  });

  it("returns null for anything that is not a confirmed on-chain receipt", () => {
    for (const receipt of [
      null,
      "receipt",
      {},
      { ...RECEIPT, status: "pending", blockNumber: null, blockTimestamp: null },
      { ...RECEIPT, status: "failed" },
      // The in-memory development ledger is never presented as an Avalanche record.
      { ...RECEIPT, chainId: "bona:memory" },
      { ...RECEIPT, chainId: "eip155:1" },
      { ...RECEIPT, txId: "0x1234" },
      { sample: true, chainId: "bona:memory", txId: null, contractAddress: null },
    ]) {
      expect(verifyLink(receipt), JSON.stringify(receipt)).toBeNull();
    }
  });

  it("leaves out a report id that is not a UUID", () => {
    expect(opened(verifyLink(RECEIPT, { reportId: "BB-2026-000042" }))).toEqual({
      receipt: CARRIED,
    });
  });

  it("makes the label one short line", () => {
    const link = opened(
      verifyLink(RECEIPT, { label: `  Photo\n1\t\u0007 ${"x".repeat(200)}` }),
    );
    expect(link.label?.startsWith("Photo 1 x")).toBe(true);
    expect(Array.from(link.label!).length).toBeLessThanOrEqual(VERIFY_LINK_MAX_LABEL);
  });

  describe("records anchored as a commitment document", () => {
    const receipt = { ...RECEIPT, event: "ReportRegistered" } as const;

    it("carries the document when the link stays short enough", () => {
      const link = verifyLink(receipt, {
        label: "Report BB-2026-000042",
        reportId: REPORT_ID,
        document: REPORT_DOCUMENT,
      });
      const read = opened(link);
      expect(read.receipt).toEqual({ ...CARRIED, event: "ReportRegistered" });
      expect(read.document).toEqual(REPORT_DOCUMENT);
      // The document names its report, so the id is not sent a second time.
      expect(read.reportId).toBeUndefined();
      expect(link!.length).toBeLessThanOrEqual(VERIFY_LINK_MAX_LENGTH);
    });

    it("leaves the document out when it would make the link too long", () => {
      const long = { ...REPORT_DOCUMENT, description: "water ".repeat(1500) };
      const link = verifyLink(receipt, { reportId: REPORT_ID, document: long });
      expect(link!.length).toBeLessThan(300);
      expect(opened(link)).toEqual({
        receipt: { ...CARRIED, event: "ReportRegistered" },
        reportId: REPORT_ID,
      });
    });

    it("never carries a sample document, or a document for a file or an acknowledgement", () => {
      const sample = { sample: true, type: "report", reportId: REPORT_ID, salt: null };
      expect(opened(verifyLink(receipt, { document: sample })).document).toBeUndefined();
      expect(
        opened(verifyLink(RECEIPT, { document: REPORT_DOCUMENT })).document,
      ).toBeUndefined();
      expect(
        opened(
          verifyLink(
            { ...RECEIPT, event: "ReportAcknowledged" },
            { document: REPORT_DOCUMENT },
          ),
        ).document,
      ).toBeUndefined();
    });
  });

  it("gives every registry event its own letter", () => {
    for (const event of [
      "ReportRegistered",
      "EvidenceRegistered",
      "ReportAcknowledged",
      "InterimProtectionRecorded",
      "RepairClaimed",
      "RepairVerified",
      "RepairDisputed",
    ] as const) {
      expect(opened(verifyLink({ ...RECEIPT, event })).receipt.event).toBe(event);
    }
  });
});

describe("the square code for a verify link", () => {
  it("fits an ordinary record in a small symbol", () => {
    const link = verifyLink(RECEIPT, { label: "Evidence 2", reportId: REPORT_ID })!;
    const drawing = drawQr(link);
    expect(drawing).not.toBeNull();
    // Version 8 is 49 modules a side: easy to scan from another phone.
    expect(drawing!.version).toBeLessThanOrEqual(8);
    expect(drawing!.side).toBe(17 + 4 * drawing!.version + 8);
    expect(drawing!.path.startsWith("M")).toBe(true);
  });

  it("uses the strongest error correction that does not make the symbol larger", () => {
    // 21 characters need version 2. Version 2 holds 32 at level L, 26 at M and 20 at Q.
    expect(drawQr("https://bona.example/")).toMatchObject({ version: 2, level: "M" });
    // 31 characters fill version 2 at level L, so there is nothing to spare.
    expect(drawQr("https://bona-verify.vercel.app/")).toMatchObject({
      version: 2,
      level: "L",
    });
  });

  it("returns null, not an error, for a link too long to scan", () => {
    const long = { ...REPORT_DOCUMENT, description: "water ".repeat(400) };
    const link = verifyLink(
      { ...RECEIPT, event: "ReportRegistered" },
      { document: long },
    )!;
    expect(opened(link).document).toEqual(long);
    expect(drawQr(link)).toBeNull();
    expect(drawQr("x".repeat(20_000))).toBeNull();
    expect(VERIFY_QR_MAX_VERSION).toBeLessThanOrEqual(25);
  });
});
