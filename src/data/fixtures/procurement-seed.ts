/**
 * DEVELOPMENT FIXTURES — the procurement side of the two sample cases.
 *
 * Every supplier, person, price and invoice number below is invented. Nothing
 * here has been written to any blockchain, and no money moves anywhere: the
 * last step of the trail is a release instruction.
 *
 * - Case A (`issue-142`): order approved, acknowledged and delivered; the
 *   repair is claimed. It waits for the supplier's invoice, so the demo can
 *   show a wrong invoice blocked, the right one matched, the release gate
 *   locked until the reviewer verifies, and then the release instruction.
 * - Case B (`issue-143`): finished. Its first invoice was blocked on a price,
 *   the second matched, the repair was verified and the release authorised.
 *   It belongs to another supplier, so the sample supplier cannot see it.
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
import type { Issue, TimelineEventType } from "../types";
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
  /** The named person behind each procurement step, by timeline event id. Null for the rule engine. */
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
    ref: "SUP-0417",
    name: "Khumalo Building Supplies",
    userId: "user-supplier",
    contact: "Mr Sipho Khumalo",
  },
  {
    // No sign-in account: this supplier exists so that another supplier's order is in the data.
    ref: "SUP-0522",
    name: "Mahlangu Electrical",
    userId: "user-supplier-mahlangu",
    contact: "Ms Zodwa Mahlangu",
  },
];

const BUYER = { id: "user-buyer", name: "Ms Lerato Dube" };
const RECEIVER = { id: "user-receiver", name: "Ms Nomsa Radebe" };
const APPROVER = { id: "user-approver", name: "Mr Thabo Mokoena" };
const REVIEWER_ID = "user-reviewer";

export const CASE_A_LINES: OrderLine[] = [
  {
    sku: "LOCK-3L",
    description: "Three-lever mortice lockset",
    quantity: 3,
    unitPriceCents: 68_500,
  },
  {
    sku: "DOOR-CLS",
    description: "Hydraulic door closer",
    quantity: 2,
    unitPriceCents: 124_000,
  },
  {
    sku: "LAB-FIT",
    description: "Fitting and labour, per door",
    quantity: 3,
    unitPriceCents: 45_000,
  },
];

const CASE_B_LINES: OrderLine[] = [
  {
    sku: "LED-TUBE",
    description: "LED tube light fitting, 1.2 m",
    quantity: 12,
    unitPriceCents: 18_500,
  },
  {
    sku: "DB-BRK",
    description: "Circuit breaker, 20 A",
    quantity: 2,
    unitPriceCents: 32_000,
  },
  {
    sku: "LAB-ELEC",
    description: "Electrician labour, per hour",
    quantity: 6,
    unitPriceCents: 38_000,
  },
];

/** The moments of an issue's timeline events of one type, oldest first, with their ids. */
function eventsOf(issue: Issue, type: TimelineEventType) {
  return issue.timeline
    .filter((event) => event.type === type)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function orderFor(
  issue: Issue,
  supplier: FixtureSupplier,
  description: string,
  lines: OrderLine[],
): WorkOrder {
  const approved = eventsOf(issue, "work_order_approved")[0];
  const acknowledged = eventsOf(issue, "work_order_acknowledged")[0];
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

/** Names for every seeded procurement step of an issue, by who acted. */
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
    "Replace three classroom door locks and two door closers on the Grade 5 corridor, fitted and tested.",
    CASE_A_LINES,
  );
  return {
    issueId: issue.id,
    order,
    invoices: [],
    receipts: [
      receiptFor(issue, order, eventsOf(issue, "goods_receipt_recorded")[0].occurredAt),
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
    "Replace twelve ceiling light fittings and two circuit breakers in the school hall.",
    CASE_B_LINES,
  );
  const submitted = eventsOf(issue, "invoice_submitted");
  const matched = eventsOf(issue, "match_recorded");
  const receipt = receiptFor(
    issue,
    order,
    eventsOf(issue, "goods_receipt_recorded")[0].occurredAt,
  );

  // The first invoice charged more per light fitting than the order allows.
  const overpriced = order.lines.map((line) =>
    line.sku === "LED-TUBE" ? { ...line, unitPriceCents: 21_500 } : line,
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
      { code: "unit_price_mismatch", sku: "LED-TUBE", expected: 18_500, actual: 21_500 },
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
      createdAt: eventsOf(issue, "release_authorised")[0].occurredAt,
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
