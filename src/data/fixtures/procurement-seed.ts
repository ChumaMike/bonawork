/**
 * DEVELOPMENT FIXTURES — the procurement side of the two sample cases.
 *
 * Every supplier, person, price and invoice number below is invented. Nothing
 * here has been written to any blockchain, and no money moves anywhere: the
 * last step of the trail is a release instruction.
 *
 * - Case A (`issue-124`, the window panes): order approved, acknowledged and
 *   delivered; the repair is claimed. It waits for the supplier's invoice, so
 *   the demo can show a wrong invoice blocked, the right one matched, the
 *   release gate locked until the reviewer verifies, and then the release
 *   instruction.
 * - Case B (`issue-97`, the fence): finished. Its first invoice was blocked on
 *   a price, the second matched, the repair was verified and the release
 *   authorised. It belongs to another supplier, so the sample supplier cannot
 *   see it.
 *
 * The people and the supplier are the ones the backend demo seeds, so the
 * fixture preview and the live demo show the same cast.
 */
import {
  CURRENCY,
  MATCH_ENGINE_VERSION,
  type GoodsReceipt,
  type Invoice,
  type IsoDateTime,
  type MatchReason,
  type MatchResult,
  type OrderLine,
  type ReleaseInstruction,
  type WorkOrder,
} from "@/shared";
import { linesTotal } from "@/features/procurement/money";
import type { Issue, PublicTrailStep } from "../types";
import { CASE_A_ISSUE_ID, CASE_B_ISSUE_ID, sampleDigest } from "./seed";

/** Everything the fixture keeps about one case's procurement trail. */
export interface FixtureCase {
  issueId: string;
  order: WorkOrder;
  /** Oldest first. */
  invoices: Invoice[];
  /** Oldest first. */
  receipts: GoodsReceipt[];
  /** Every run of the rule engine, oldest first. */
  matches: MatchResult[];
  release: ReleaseInstruction | null;
  /** Who verified the repair. The same person may not authorise the release. */
  reviewerId: string | null;
  /** The named person behind each step of the trail, by step id. Null for the rule engine. */
  actorNames: Record<string, string | null>;
}

export interface FixtureSupplier {
  /** The registration reference a buyer puts on the order. */
  ref: string;
  name: string;
  /** The supplier's account. */
  userId: string;
  /** The person who acts for the supplier. */
  contact: string;
}

export const SAMPLE_SUPPLIERS: FixtureSupplier[] = [
  {
    ref: "SUP-2026-0417",
    name: "Emseni Building and Electrical Supplies",
    userId: "user-supplier",
    contact: "Mr Themba Zulu",
  },
  {
    // No sign-in account: this supplier exists so that another supplier's order is in the data.
    ref: "SUP-2026-0522",
    name: "Mahlangu Fencing",
    userId: "user-supplier-mahlangu",
    contact: "Ms Zodwa Mahlangu",
  },
];

const BUYER = { id: "user-buyer", name: "Ms Naledi Dlamini" };
const RECEIVER = { id: "user-receiver", name: "Mrs Ayanda Ngcobo" };
const APPROVER = { id: "user-approver", name: "Mr Pieter van Wyk" };
const REVIEWER_ID = "user-reviewer";

/** Case A: three window panes, fitted. R4 200,00 in all. */
export const CASE_A_LINES: OrderLine[] = [
  {
    sku: "GLASS-4MM",
    description: "Clear float glass pane, 4 mm",
    quantity: 3,
    unitPriceCents: 65_000,
  },
  {
    sku: "PUTTY-KIT",
    description: "Glazing putty and beading kit",
    quantity: 3,
    unitPriceCents: 15_000,
  },
  {
    sku: "LAB-GLAZE",
    description: "Glazier labour, per pane",
    quantity: 3,
    unitPriceCents: 60_000,
  },
];

/** Case B: about twenty metres of fence. R20 550,00 in all. */
const CASE_B_LINES: OrderLine[] = [
  {
    sku: "FENCE-MESH",
    description: "Welded mesh fence panel, 2.4 m",
    quantity: 9,
    unitPriceCents: 115_000,
  },
  {
    sku: "FENCE-POST",
    description: "Concrete fence post",
    quantity: 10,
    unitPriceCents: 48_000,
  },
  {
    sku: "LAB-FENCE",
    description: "Fencing labour, per day",
    quantity: 3,
    unitPriceCents: 180_000,
  },
];

/** The steps of one type on an issue's trail, oldest first. */
function stepsOf(issue: Issue, type: PublicTrailStep["type"]): PublicTrailStep[] {
  return (issue.publicTrail ?? [])
    .filter((step) => step.type === type)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function orderFor(
  issue: Issue,
  supplier: FixtureSupplier,
  description: string,
  lines: OrderLine[],
): WorkOrder {
  const approved = stepsOf(issue, "work_order_approved")[0];
  const acknowledged = stepsOf(issue, "work_order_acknowledged").at(0);
  const id = `${issue.id}-order`;
  return {
    id,
    reportId: issue.id,
    institutionId: issue.schoolId,
    supplierId: supplier.userId,
    supplierName: supplier.name,
    supplierRef: supplier.ref,
    version: 1,
    description,
    lines,
    totalCents: linesTotal(lines),
    currency: CURRENCY,
    approvedBy: BUYER.id,
    approvedAt: approved.occurredAt,
    acknowledgedVersion: acknowledged ? 1 : null,
    acknowledgedBy: acknowledged ? supplier.userId : null,
    acknowledgedAt: acknowledged?.occurredAt ?? null,
    commitment: sampleDigest(`${id}-v1`),
    receipt: null,
  };
}

function receiptFor(issue: Issue, order: WorkOrder, at: IsoDateTime): GoodsReceipt {
  const id = `${issue.id}-receipt-1`;
  return {
    id,
    workOrderId: order.id,
    reportId: issue.id,
    orderVersion: order.version,
    lines: order.lines.map(({ sku, description, quantity }) => ({
      sku,
      description,
      quantity,
    })),
    evidenceDigests: [sampleDigest(`${id}-delivery-note`)],
    receivedBy: RECEIVER.id,
    createdAt: at,
    commitment: sampleDigest(id),
    receipt: null,
  };
}

/** Names for every seeded step of an issue's trail, by who acted. */
function namesFor(issue: Issue, supplier: FixtureSupplier): FixtureCase["actorNames"] {
  const byActor: Record<string, string | null> = {
    buyer: BUYER.name,
    supplier: supplier.contact,
    receiving_officer: RECEIVER.name,
    payment_approver: APPROVER.name,
    system: null,
  };
  return Object.fromEntries(
    (issue.publicTrail ?? []).map((step) => [step.eventId, byActor[step.actor] ?? null]),
  );
}

function caseA(issue: Issue): FixtureCase {
  const supplier = SAMPLE_SUPPLIERS[0];
  const order = orderFor(
    issue,
    supplier,
    "Replace three broken window panes in the Grade 3A classroom, fitted and sealed.",
    CASE_A_LINES,
  );
  return {
    issueId: issue.id,
    order,
    invoices: [],
    receipts: [
      receiptFor(issue, order, stepsOf(issue, "goods_receipt_recorded")[0].occurredAt),
    ],
    matches: [],
    release: null,
    reviewerId: null,
    actorNames: namesFor(issue, supplier),
  };
}

function caseB(issue: Issue): FixtureCase {
  const supplier = SAMPLE_SUPPLIERS[1];
  const order = orderFor(
    issue,
    supplier,
    "Rebuild about 20 metres of perimeter fence on the east side, on concrete posts.",
    CASE_B_LINES,
  );
  const submitted = stepsOf(issue, "invoice_submitted");
  const matched = stepsOf(issue, "match_recorded");
  const receipt = receiptFor(
    issue,
    order,
    stepsOf(issue, "goods_receipt_recorded")[0].occurredAt,
  );

  // The first invoice charged more per post than the order allows.
  const overpriced = order.lines.map((line) =>
    line.sku === "FENCE-POST" ? { ...line, unitPriceCents: 52_000 } : line,
  );
  const invoice = (
    number: number,
    invoiceNumber: string,
    lines: OrderLine[],
  ): Invoice => {
    const id = `${issue.id}-invoice-${number}`;
    return {
      id,
      workOrderId: order.id,
      reportId: issue.id,
      orderVersion: 1,
      invoiceNumber,
      supplierRef: supplier.ref,
      lines,
      totalCents: linesTotal(lines),
      currency: CURRENCY,
      submittedBy: supplier.userId,
      aiDrafted: number === 2,
      createdAt: submitted[number - 1].occurredAt,
      commitment: sampleDigest(id),
      receipt: null,
    };
  };
  const invoices = [
    invoice(1, "INV-1987", overpriced),
    invoice(2, "INV-1991", order.lines),
  ];
  const match = (number: number, reasons: MatchReason[]): MatchResult => {
    const id = `${issue.id}-match-${number}`;
    return {
      id,
      workOrderId: order.id,
      reportId: issue.id,
      invoiceId: invoices[number - 1].id,
      receiptId: receipt.id,
      orderVersion: 1,
      outcome: reasons.length === 0 ? "matched" : "blocked",
      reasons,
      engineVersion: MATCH_ENGINE_VERSION,
      createdAt: matched[number - 1].occurredAt,
      commitment: sampleDigest(id),
      receipt: null,
    };
  };
  const matches = [
    match(1, [
      {
        code: "unit_price_mismatch",
        sku: "FENCE-POST",
        expected: 48_000,
        actual: 52_000,
      },
      {
        code: "total_mismatch",
        sku: null,
        expected: order.totalCents,
        actual: invoices[0].totalCents,
      },
    ]),
    match(2, []),
  ];
  const releaseId = `${issue.id}-release`;
  return {
    issueId: issue.id,
    order,
    invoices,
    receipts: [receipt],
    matches,
    release: {
      id: releaseId,
      workOrderId: order.id,
      reportId: issue.id,
      matchId: matches[1].id,
      reviewId: `${issue.id}-review`,
      authorisedBy: APPROVER.id,
      createdAt: stepsOf(issue, "release_authorised")[0].occurredAt,
      commitment: sampleDigest(releaseId),
      receipt: null,
    },
    reviewerId: REVIEWER_ID,
    actorNames: namesFor(issue, supplier),
  };
}

/** The sample procurement cases, built on the sample issues they belong to. */
export function buildSampleProcurement(issues: Issue[]): Record<string, FixtureCase> {
  const cases: Record<string, FixtureCase> = {};
  const a = issues.find((issue) => issue.id === CASE_A_ISSUE_ID);
  const b = issues.find((issue) => issue.id === CASE_B_ISSUE_ID);
  if (a) cases[a.id] = caseA(a);
  if (b) cases[b.id] = caseB(b);
  return cases;
}
