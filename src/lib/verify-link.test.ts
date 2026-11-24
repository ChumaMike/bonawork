import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommitmentDocumentSchema,
  FINANCE_DOCUMENT_TYPES,
  FINANCE_EVENTS,
  GoodsReceiptDocumentSchema,
  InterimProtectionDocumentSchema,
  LEDGER_EVENTS,
  MatchReasonSchema,
  MatchResultDocumentSchema,
  OrderLineSchema,
  ReceiptLineSchema,
  ReleaseDecisionDocumentSchema,
  RepairClaimDocumentSchema,
  ReportDocumentSchema,
  ReviewDocumentSchema,
  SupplierInvoiceDocumentSchema,
  WorkOrderDocumentSchema,
  canonicalJson,
  computeCommitment,
  type FinanceEvent,
} from "@/shared";
import { drawQr, VERIFY_QR_MAX_VERSION } from "@/components/verify-qr";
// The verifier is a separate package that shares no code with this app. Its
// parser is imported here, in a test only, to prove that the two sides agree
// on the link format.
import {
  DOCUMENT_FIELDS as VERIFIER_DOCUMENT_FIELDS,
  NESTED_FIELDS as VERIFIER_NESTED_FIELDS,
  canonicalJson as verifierCanonicalJson,
  computeCommitment as verifierCommitment,
  documentProblems as verifierDocumentProblems,
  pickDocumentFields as verifierPickFields,
} from "../../verifier/src/lib/canonical";
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
      // The in-memory development ledger is never presented as a Solana record.
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

/* ----------------------------- Procurement trail ---------------------------- */

const WORK_ORDER_ID = "0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3";
const SALT = `0x${"5a".repeat(32)}`;
const LINES = [
  { sku: "PIPE-20", description: "20 mm pipe, 6 m", quantity: 4, unitPriceCents: 18_500 },
  { sku: "TAP-01", description: "Brass tap", quantity: 6, unitPriceCents: 9_900 },
];

/** One sample of each finance commitment document (`src/shared/domain.ts`). */
const FINANCE_DOCUMENTS = {
  work_order: {
    type: "work_order",
    workOrderId: WORK_ORDER_ID,
    reportId: REPORT_ID,
    institutionId: "7d1e2f3a-0000-4000-8000-000000000002",
    version: 1,
    description: "Restore water to the toilets in block B",
    lines: LINES,
    totalCents: 133_400,
    currency: "ZAR",
    createdAt: "2026-11-19T07:00:00.000Z",
    salt: SALT,
  },
  supplier_invoice: {
    type: "supplier_invoice",
    invoiceId: "1c8d2e3f-4051-4b6c-9d7e-8f90a1b2c3d4",
    workOrderId: WORK_ORDER_ID,
    reportId: REPORT_ID,
    invoiceNumber: "INV-0042",
    orderVersion: 1,
    lines: LINES,
    totalCents: 133_400,
    currency: "ZAR",
    createdAt: "2026-11-19T09:00:00.000Z",
    salt: SALT,
  },
  goods_receipt: {
    type: "goods_receipt",
    receiptId: "2d9e3f40-5162-4c7d-8e8f-90a1b2c3d4e5",
    workOrderId: WORK_ORDER_ID,
    reportId: REPORT_ID,
    orderVersion: 1,
    lines: LINES.map(({ sku, description, quantity }) => ({
      sku,
      description,
      quantity,
    })),
    evidenceDigests: [`0x${"e1".repeat(32)}`],
    createdAt: "2026-11-19T10:00:00.000Z",
    salt: SALT,
  },
  match_result: {
    type: "match_result",
    matchId: "3eaf4051-6273-4d8e-9f90-a1b2c3d4e5f6",
    workOrderId: WORK_ORDER_ID,
    reportId: REPORT_ID,
    workOrderCommitment: `0x${"a1".repeat(32)}`,
    invoiceCommitment: `0x${"a2".repeat(32)}`,
    receiptCommitments: [`0x${"a3".repeat(32)}`],
    outcome: "fail",
    reasons: [
      { code: "quantity_mismatch", sku: "TAP-01", expected: 6, actual: 8 },
      { code: "total_mismatch", sku: null, expected: 133_400, actual: 153_200 },
    ],
    engineVersion: "1",
    createdAt: "2026-11-19T10:00:01.000Z",
    salt: SALT,
  },
  release_decision: {
    type: "release_decision",
    releaseId: "4fb05162-7384-4e9f-a0a1-b2c3d4e5f607",
    workOrderId: WORK_ORDER_ID,
    reportId: REPORT_ID,
    matchCommitment: `0x${"b1".repeat(32)}`,
    reviewCommitment: `0x${"b2".repeat(32)}`,
    decision: "authorised",
    createdAt: "2026-11-20T08:00:00.000Z",
    salt: SALT,
  },
} as const;

/** A dispute has no document schema yet: any salted document travels as it is. */
const DISPUTE_DOCUMENT = {
  type: "payment_dispute",
  workOrderId: WORK_ORDER_ID,
  reportId: REPORT_ID,
  createdAt: "2026-11-19T11:00:00.000Z",
  salt: SALT,
};

/** The eight finance events in trail order: their letter and the document they anchor. */
const FINANCE_LINKS: [FinanceEvent, string, Record<string, unknown> | null][] = [
  ["WorkOrderApproved", "W", FINANCE_DOCUMENTS.work_order],
  ["WorkOrderAcknowledged", "K", null],
  ["InvoiceSubmitted", "I", FINANCE_DOCUMENTS.supplier_invoice],
  ["GoodsReceiptRecorded", "G", FINANCE_DOCUMENTS.goods_receipt],
  ["MatchRecorded", "M", FINANCE_DOCUMENTS.match_result],
  ["PaymentDisputeOpened", "O", DISPUTE_DOCUMENT],
  ["PaymentDisputeClosed", "L", DISPUTE_DOCUMENT],
  ["ReleaseAuthorised", "Z", FINANCE_DOCUMENTS.release_decision],
];

describe("verify links for the procurement trail", () => {
  /** The institution's InstitutionFinance contract, not the factory. */
  const FINANCE_CONTRACT = "0x5fC8d32690cc91D4c39d9d3abcBD16989F875707";
  const receiptFor = (event: FinanceEvent) =>
    ({ ...RECEIPT, contractAddress: FINANCE_CONTRACT, event }) as const;
  const carried = (event: FinanceEvent) => ({
    ...CARRIED,
    contractAddress: FINANCE_CONTRACT.toLowerCase(),
    event,
  });

  it("covers the eight finance events, in trail order", () => {
    expect(FINANCE_LINKS.map(([event]) => event)).toEqual([...FINANCE_EVENTS]);
    expect(FINANCE_LINKS.map(([, letter]) => letter).join(" ")).toBe("W K I G M O L Z");
  });

  it.each(FINANCE_LINKS)("%s travels as the letter %s", (event, letter) => {
    const link = verifyLink(receiptFor(event), {
      label: "Step of BB-2026-000042",
      reportId: REPORT_ID,
    });
    expect(new URL(link!).hash.startsWith(`#v1.43113.${letter}.`)).toBe(true);
    expect(opened(link)).toEqual({
      receipt: carried(event),
      label: "Step of BB-2026-000042",
      reportId: REPORT_ID,
    });
  });

  it.each(FINANCE_LINKS.filter(([, , document]) => document !== null))(
    "%s carries its commitment document",
    (event, _letter, document) => {
      const link = verifyLink(receiptFor(event), { reportId: REPORT_ID, document });
      const read = opened(link);
      expect(read.receipt).toEqual(carried(event));
      // Byte for byte what was given: the verifier hashes exactly this.
      expect(read.document).toEqual(document);
      expect(JSON.stringify(read.document)).toBe(JSON.stringify(document));
      expect(read.documentDamaged).toBeUndefined();
      // The document names its report, so the id is not sent a second time.
      expect(read.reportId).toBeUndefined();
      expect(link!.length).toBeLessThanOrEqual(VERIFY_LINK_MAX_LENGTH);
    },
  );

  it("carries no document for the supplier's acknowledgement: it anchors none", () => {
    const read = opened(
      verifyLink(receiptFor("WorkOrderAcknowledged"), {
        reportId: REPORT_ID,
        document: FINANCE_DOCUMENTS.work_order,
      }),
    );
    expect(read.document).toBeUndefined();
    expect(read.reportId).toBe(REPORT_ID);
  });

  it("still links the receipt when the finance document is held back or is a sample", () => {
    const event = "InvoiceSubmitted";
    expect(opened(verifyLink(receiptFor(event), { reportId: REPORT_ID }))).toEqual({
      receipt: carried(event),
      reportId: REPORT_ID,
    });
    const sample = { sample: true, type: "supplier_invoice", salt: null };
    expect(
      opened(verifyLink(receiptFor(event), { document: sample })).document,
    ).toBeUndefined();
  });

  it("builds no link for a simulated or unconfirmed finance step", () => {
    for (const [event] of FINANCE_LINKS) {
      // The memory ledger's receipt: never presented as a Solana record.
      expect(
        verifyLink({ ...receiptFor(event), chainId: "bona:memory" }),
        event,
      ).toBeNull();
      expect(
        verifyLink({
          ...receiptFor(event),
          status: "pending",
          blockNumber: null,
          blockTimestamp: null,
        }),
        event,
      ).toBeNull();
    }
  });

  it("gives all fifteen ledger events a letter of their own", () => {
    const letters = LEDGER_EVENTS.map(
      (event) => new URL(verifyLink({ ...RECEIPT, event })!).hash.split(".")[2],
    );
    expect(new Set(letters).size).toBe(LEDGER_EVENTS.length);
    expect(letters.join("")).toBe("REAPCVDWKIGMOLZ");
    for (const event of LEDGER_EVENTS) {
      expect(opened(verifyLink({ ...RECEIPT, event })).receipt.event).toBe(event);
    }
  });
});

/* ------------------- The app and the verifier hash alike -------------------- */

/*
 * The verifier re-implements the hashing rules and shares no code with the
 * app. These tests hold the two side by side: the same document must give the
 * same canonical JSON, byte for byte, and so the same commitment.
 */
describe("a finance document hashes to the same commitment in the app and in the verifier", () => {
  const SCHEMAS = {
    report: ReportDocumentSchema,
    interim_protection: InterimProtectionDocumentSchema,
    repair_claim: RepairClaimDocumentSchema,
    review: ReviewDocumentSchema,
    work_order: WorkOrderDocumentSchema,
    supplier_invoice: SupplierInvoiceDocumentSchema,
    goods_receipt: GoodsReceiptDocumentSchema,
    match_result: MatchResultDocumentSchema,
    release_decision: ReleaseDecisionDocumentSchema,
  };
  /** One sample of each new type, and a passing match next to the failing one. */
  const SAMPLES: [string, Record<string, unknown>][] = [
    ...Object.entries(FINANCE_DOCUMENTS),
    [
      "match_result (pass)",
      { ...FINANCE_DOCUMENTS.match_result, outcome: "pass", reasons: [] },
    ],
  ];

  it("covers the five finance document types", () => {
    expect(Object.keys(FINANCE_DOCUMENTS)).toEqual([...FINANCE_DOCUMENT_TYPES]);
  });

  it.each(SAMPLES)("%s", async (_name, sample) => {
    // The app hashes the document its schema accepts.
    const document = CommitmentDocumentSchema.parse(sample);
    expect(verifierDocumentProblems(sample)).toBeNull();
    expect(verifierCanonicalJson(verifierPickFields(sample))).toBe(
      canonicalJson(document),
    );
    const commitment = await computeCommitment(document);
    expect(await verifierCommitment(sample)).toBe(commitment);
    expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it.each(SAMPLES)("%s, with keys the schema does not know", async (_name, sample) => {
    // The schema strips unknown keys before the app hashes; the verifier ignores them.
    const noisy: Record<string, unknown> = {
      ...sample,
      receipt: { txId: "0x00" },
      id: 7,
    };
    for (const key of ["lines", "reasons"]) {
      const list = sample[key];
      if (Array.isArray(list)) {
        noisy[key] = list.map((item: Record<string, unknown>) => ({
          ...item,
          note: "x",
        }));
      }
    }
    const commitment = await computeCommitment(CommitmentDocumentSchema.parse(noisy));
    expect(commitment).toBe(
      await computeCommitment(CommitmentDocumentSchema.parse(sample)),
    );
    expect(await verifierCommitment(noisy)).toBe(commitment);
  });

  it("changes in both when one price changes by a cent", async () => {
    const sample = FINANCE_DOCUMENTS.supplier_invoice;
    const changed = {
      ...sample,
      lines: [{ ...sample.lines[0], unitPriceCents: 18_501 }, sample.lines[1]],
    };
    const before = await computeCommitment(CommitmentDocumentSchema.parse(sample));
    const after = await computeCommitment(CommitmentDocumentSchema.parse(changed));
    expect(after).not.toBe(before);
    expect(await verifierCommitment(changed)).toBe(after);
  });

  it("lists exactly the fields of every document schema, old and new", () => {
    expect(Object.keys(VERIFIER_DOCUMENT_FIELDS).sort()).toEqual(
      Object.keys(SCHEMAS).sort(),
    );
    for (const [type, schema] of Object.entries(SCHEMAS)) {
      expect(
        [...VERIFIER_DOCUMENT_FIELDS[type as keyof typeof SCHEMAS]].sort(),
        type,
      ).toEqual(Object.keys(schema.shape).sort());
    }
  });

  it("lists exactly the fields of a line and of a match reason", () => {
    const sorted = (keys: readonly string[]) => [...keys].sort();
    const order = sorted(Object.keys(OrderLineSchema.shape));
    expect(sorted(VERIFIER_NESTED_FIELDS.work_order!.lines!)).toEqual(order);
    expect(sorted(VERIFIER_NESTED_FIELDS.supplier_invoice!.lines!)).toEqual(order);
    expect(sorted(VERIFIER_NESTED_FIELDS.goods_receipt!.lines!)).toEqual(
      sorted(Object.keys(ReceiptLineSchema.shape)),
    );
    expect(sorted(VERIFIER_NESTED_FIELDS.match_result!.reasons!)).toEqual(
      sorted(Object.keys(MatchReasonSchema.shape)),
    );
  });
});
