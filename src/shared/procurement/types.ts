import { z } from "zod";
import { BlockchainReceiptSchema, FinanceCaseEventTypeSchema } from "../domain";
import { Hex32Schema, IdSchema, IsoDateTimeSchema } from "../primitives";
import {
  CentsSchema,
  CurrencySchema,
  MatchReasonSchema,
  OrderLineSchema,
  ReceiptLineSchema,
} from "./base";

export * from "./base";

/**
 * The procurement trail on one report:
 *
 *   work order approved (buyer) -> acknowledged (supplier) -> invoice submitted
 *   (supplier) -> goods receipt recorded (receiving officer) -> three-way match
 *   (rule engine) -> independent verification (the existing flow) -> release
 *   authorised (payment approver)
 *
 * No real money moves: the last step is a release instruction. Finance steps
 * never change the report status.
 *
 * Three groups of shapes live here: the records the backend stores, the views
 * the screens render (`MoneyTrail` for signed-in staff, `PublicTrailStep` for
 * everyone), and the request bodies of the procurement routes.
 */

const version = z.number().int().positive();

/* ---------------------------------- Records --------------------------------- */

/**
 * A work order at its current version. An order is approved by a buyer for
 * one report; changing it creates a new version, which the supplier must
 * acknowledge again.
 */
export const WorkOrderSchema = z.object({
  id: IdSchema,
  reportId: IdSchema,
  institutionId: IdSchema,
  /** The supplier account the order is bound to. */
  supplierId: IdSchema,
  supplierName: z.string().min(1).max(200),
  /** The supplier registration reference. Invoices must carry the same one. */
  supplierRef: z.string().min(1).max(64),
  /** Current version, 1-based. */
  version,
  /** Scope of work, in words. */
  description: z.string().min(1).max(2000),
  lines: z.array(OrderLineSchema).min(1),
  /** Sum of `quantity * unitPriceCents` over the lines. */
  totalCents: CentsSchema,
  currency: CurrencySchema,
  /** The buyer who approved the current version. */
  approvedBy: IdSchema,
  approvedAt: IsoDateTimeSchema,
  /** The version the supplier acknowledged; null until the first acknowledgement. */
  acknowledgedVersion: version.nullable(),
  acknowledgedBy: IdSchema.nullable(),
  acknowledgedAt: IsoDateTimeSchema.nullable(),
  /** `computeCommitment` of the current version's `WorkOrderDocument`. */
  commitment: Hex32Schema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const InvoiceSchema = z.object({
  id: IdSchema,
  workOrderId: IdSchema,
  reportId: IdSchema,
  /** The order version the supplier invoiced against. */
  orderVersion: version,
  invoiceNumber: z.string().min(1).max(64),
  supplierRef: z.string().min(1).max(64),
  lines: z.array(OrderLineSchema).min(1),
  /** The total stated on the invoice. The match engine checks it against the lines. */
  totalCents: CentsSchema,
  currency: CurrencySchema,
  submittedBy: IdSchema,
  /** True when the fields came from an AI draft the supplier then confirmed. */
  aiDrafted: z.boolean(),
  createdAt: IsoDateTimeSchema,
  /** `computeCommitment` of the `SupplierInvoiceDocument`. */
  commitment: Hex32Schema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const GoodsReceiptSchema = z.object({
  id: IdSchema,
  workOrderId: IdSchema,
  reportId: IdSchema,
  orderVersion: version,
  lines: z.array(ReceiptLineSchema).min(1),
  /** Fingerprints of the photos or delivery notes backing the receipt. */
  evidenceDigests: z.array(Hex32Schema),
  receivedBy: IdSchema,
  createdAt: IsoDateTimeSchema,
  /** `computeCommitment` of the `GoodsReceiptDocument`. */
  commitment: Hex32Schema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type GoodsReceipt = z.infer<typeof GoodsReceiptSchema>;

export const MATCH_OUTCOMES = ["matched", "blocked"] as const;
export const MatchOutcomeSchema = z.enum(MATCH_OUTCOMES);
export type MatchOutcome = z.infer<typeof MatchOutcomeSchema>;

/** One run of the rule engine over an invoice. Written by code, never by a person or by AI. */
export const MatchResultSchema = z.object({
  id: IdSchema,
  workOrderId: IdSchema,
  reportId: IdSchema,
  invoiceId: IdSchema,
  /** The latest goods receipt the run saw; null when there was none. */
  receiptId: IdSchema.nullable(),
  /** The order version that was current when the engine ran. */
  orderVersion: version,
  outcome: MatchOutcomeSchema,
  /** Empty when `matched`. In the stable order of `MATCH_REASON_CODES`. */
  reasons: z.array(MatchReasonSchema),
  engineVersion: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  /** `computeCommitment` of the `MatchResultDocument`. */
  commitment: Hex32Schema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

/** The release instruction for an order. At most one per order. It moves no money. */
export const ReleaseInstructionSchema = z.object({
  id: IdSchema,
  workOrderId: IdSchema,
  reportId: IdSchema,
  matchId: IdSchema,
  reviewId: IdSchema,
  authorisedBy: IdSchema,
  createdAt: IsoDateTimeSchema,
  /** `computeCommitment` of the `ReleaseDecisionDocument`. */
  commitment: Hex32Schema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type ReleaseInstruction = z.infer<typeof ReleaseInstructionSchema>;

/* -------------------------------- Release gate ------------------------------- */

export const RELEASE_BLOCKER_CODES = [
  /** The report is not `verified` by an independent reviewer. */
  "repair_not_verified",
  /** The latest match is not `matched` on the current order version. */
  "no_matching_invoice",
  /** The supplier has not acknowledged the current order version. */
  "order_not_acknowledged",
  /** A release instruction already exists for this order. */
  "already_released",
  /** The authoriser also approved, invoiced, received or reviewed on this case. */
  "same_person",
] as const;
export const ReleaseBlockerCodeSchema = z.enum(RELEASE_BLOCKER_CODES);
export type ReleaseBlockerCode = z.infer<typeof ReleaseBlockerCodeSchema>;

export const ReleaseBlockerSchema = z.object({ code: ReleaseBlockerCodeSchema });
export type ReleaseBlocker = z.infer<typeof ReleaseBlockerSchema>;

/** Whether a release may be authorised now, and if not, every reason why. */
export const ReleaseGateSchema = z.object({
  open: z.boolean(),
  /** Empty when `open`. In the stable order of `RELEASE_BLOCKER_CODES`. */
  blockers: z.array(ReleaseBlockerSchema),
});
export type ReleaseGate = z.infer<typeof ReleaseGateSchema>;

/* ----------------------------------- Stage ---------------------------------- */

/** Where an order stands, derived for display. Never stored, never a report status. */
export const PROCUREMENT_STAGES = [
  "order_approved",
  "order_acknowledged",
  "invoice_blocked",
  "invoice_matched",
  "awaiting_verification",
  "ready_for_release",
  "release_authorised",
] as const;
export const ProcurementStageSchema = z.enum(PROCUREMENT_STAGES);
export type ProcurementStage = z.infer<typeof ProcurementStageSchema>;

/* ------------------------------- Trail: shared ------------------------------- */

/** Who a finance step is attributed to. `system` is the rule engine. */
export const TRAIL_ACTORS = [
  "buyer",
  "supplier",
  "receiving_officer",
  "payment_approver",
  "system",
] as const;
export const TrailActorSchema = z.enum(TRAIL_ACTORS);
export type TrailActor = z.infer<typeof TrailActorSchema>;

/**
 * Where a step stands on the ledger. The same shape as `LedgerRecord` in
 * `src/data/types.ts`: a simulated (memory-ledger) result carries no
 * transaction data, so it can never be shown as an Avalanche transaction.
 */
export const TrailProofSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("none") }),
  z.object({ source: z.literal("simulated"), status: z.enum(["pending", "confirmed"]) }),
  z.object({ source: z.literal("ledger"), receipt: BlockchainReceiptSchema }),
]);
export type TrailProof = z.infer<typeof TrailProofSchema>;

/**
 * One finance step as anyone may see it: who (a role, never a name), when,
 * and the proof. Built from case events only. It carries no amount, supplier
 * name, document or person's name.
 */
export const PublicTrailStepSchema = z.object({
  /** The case event. Use it as the `recordId` of the proof route. */
  eventId: IdSchema,
  type: FinanceCaseEventTypeSchema,
  actor: TrailActorSchema,
  occurredAt: IsoDateTimeSchema,
  /** A code-written constant sentence. Never free text, never an amount. */
  note: z.string(),
  ledger: TrailProofSchema,
});
export type PublicTrailStep = z.infer<typeof PublicTrailStepSchema>;

/* ------------------------------ Trail: staff view ---------------------------- */

/** The staff view of a step adds the named person where the viewer may see names. */
export const MoneyTrailStepSchema = PublicTrailStepSchema.extend({
  /** Display name of the person who acted. Null for the rule engine. */
  actorName: z.string().nullable(),
});
export type MoneyTrailStep = z.infer<typeof MoneyTrailStepSchema>;

/** A line as a viewer sees it. The price is absent for viewers who may not see prices. */
export const TrailLineSchema = z.object({
  sku: z.string(),
  description: z.string(),
  quantity: z.number().int().nonnegative(),
  unitPriceCents: CentsSchema.optional(),
});
export type TrailLine = z.infer<typeof TrailLineSchema>;

export const TrailOrderSchema = z.object({
  id: IdSchema,
  version,
  description: z.string(),
  supplierName: z.string(),
  supplierRef: z.string(),
  lines: z.array(TrailLineSchema),
  /** Absent for viewers who may not see prices. */
  totalCents: CentsSchema.optional(),
  currency: CurrencySchema,
  approvedAt: IsoDateTimeSchema,
  /** True when the supplier has acknowledged the current version. */
  acknowledged: z.boolean(),
  acknowledgedAt: IsoDateTimeSchema.nullable(),
});
export type TrailOrder = z.infer<typeof TrailOrderSchema>;

export const TrailMatchSchema = z.object({
  id: IdSchema,
  outcome: MatchOutcomeSchema,
  /** Price reasons keep their code but lose their numbers for viewers who may not see prices. */
  reasons: z.array(MatchReasonSchema),
  recordedAt: IsoDateTimeSchema,
});
export type TrailMatch = z.infer<typeof TrailMatchSchema>;

export const TrailInvoiceSchema = z.object({
  id: IdSchema,
  invoiceNumber: z.string(),
  orderVersion: version,
  lines: z.array(TrailLineSchema),
  /** Absent for viewers who may not see prices. */
  totalCents: CentsSchema.optional(),
  aiDrafted: z.boolean(),
  submittedAt: IsoDateTimeSchema,
  /** The latest rule-engine result for this invoice; null until the engine has run. */
  match: TrailMatchSchema.nullable(),
});
export type TrailInvoice = z.infer<typeof TrailInvoiceSchema>;

export const TrailReceiptSchema = z.object({
  id: IdSchema,
  orderVersion: version,
  lines: z.array(ReceiptLineSchema),
  evidenceCount: z.number().int().nonnegative(),
  recordedAt: IsoDateTimeSchema,
});
export type TrailReceipt = z.infer<typeof TrailReceiptSchema>;

/**
 * Everything a signed-in procurement reader sees about one case, already
 * filtered for that reader by `visibility.ts`. Served by
 * `GET /api/issues/[id]/procurement` and returned by every procurement write.
 */
export const MoneyTrailSchema = z.object({
  issueId: IdSchema,
  /** The report tracking reference, e.g. `BB-2026-000123`. */
  reference: z.string(),
  workOrderId: IdSchema,
  stage: ProcurementStageSchema,
  /** False when the money fields have been left out for this viewer. */
  pricesVisible: z.boolean(),
  order: TrailOrderSchema,
  /** Oldest first. The last one is the invoice the gate looks at. */
  invoices: z.array(TrailInvoiceSchema),
  /** Oldest first. */
  receipts: z.array(TrailReceiptSchema),
  gate: ReleaseGateSchema,
  /** When the release instruction was authorised; null until then. */
  releaseAuthorisedAt: IsoDateTimeSchema.nullable(),
  /** Oldest first. */
  steps: z.array(MoneyTrailStepSchema),
});
export type MoneyTrail = z.infer<typeof MoneyTrailSchema>;

/* --------------------------------- Work queue -------------------------------- */

/** What the signed-in person is being asked to do. One action per procurement role. */
export const WORK_QUEUE_ACTIONS = [
  "approve_order",
  "acknowledge_order",
  "submit_invoice",
  "record_receipt",
  "authorise_release",
] as const;
export const WorkQueueActionSchema = z.enum(WORK_QUEUE_ACTIONS);
export type WorkQueueAction = z.infer<typeof WorkQueueActionSchema>;

/** One row of `GET /api/work/queue`: a case that needs this person. No amounts. */
export const WorkQueueItemSchema = z.object({
  issueId: IdSchema,
  reference: z.string(),
  title: z.string(),
  schoolName: z.string(),
  /** Null while the case has no work order (`approve_order`). */
  workOrderId: IdSchema.nullable(),
  /** Null while the case has no work order. */
  stage: ProcurementStageSchema.nullable(),
  action: WorkQueueActionSchema,
  /** For `authorise_release`: why the gate is still shut. Empty otherwise. */
  blockers: z.array(ReleaseBlockerSchema),
  /** When the case started waiting for this action. */
  since: IsoDateTimeSchema,
});
export type WorkQueueItem = z.infer<typeof WorkQueueItemSchema>;

/* ------------------------------------ AI ------------------------------------- */

export const InvoiceDraftLineSchema = z.object({
  sku: z.string().nullable(),
  description: z.string().nullable(),
  quantity: z.number().int().nullable(),
  unitPriceCents: z.number().int().nullable(),
});
export type InvoiceDraftLine = z.infer<typeof InvoiceDraftLineSchema>;

/**
 * Fields read out of pasted invoice text. A draft is a suggestion: nothing is
 * stored, and the supplier must check and submit it. A field the text does
 * not state is null and named in `missing`; it is never guessed.
 */
export const InvoiceDraftSchema = z.object({
  invoiceNumber: z.string().nullable(),
  orderVersion: z.number().int().nullable(),
  lines: z.array(InvoiceDraftLineSchema),
  totalCents: z.number().int().nullable(),
  /** Names of the fields that could not be read, e.g. `invoiceNumber`, `lines[0].sku`. */
  missing: z.array(z.string()),
});
export type InvoiceDraft = z.infer<typeof InvoiceDraftSchema>;

/**
 * Plain-language explanation of a blocked match. `rules` is the code-written
 * text from `ruleExplanation`; `ai` is a rewording of the same reasons. Either
 * way it explains the rule engine and decides nothing.
 */
export const MismatchExplanationSchema = z.object({
  text: z.string(),
  source: z.enum(["ai", "rules"]),
});
export type MismatchExplanation = z.infer<typeof MismatchExplanationSchema>;

/* ------------------------------- Request bodies ------------------------------ */

/** `POST /api/issues/[id]/work-order`. Creates version 1, or the next version. */
export const ApproveWorkOrderInputSchema = z.object({
  /** The supplier registration reference. The server resolves the supplier account and name. */
  supplierRef: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(2000),
  lines: z.array(OrderLineSchema).min(1).max(50),
});
export type ApproveWorkOrderInput = z.infer<typeof ApproveWorkOrderInputSchema>;

/** `POST /api/issues/[id]/invoices`. */
export const SubmitInvoiceInputSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(64),
  orderVersion: version,
  lines: z.array(OrderLineSchema).min(1).max(50),
  /** The total as stated on the invoice. */
  totalCents: CentsSchema,
  /** True when the fields started as an AI draft. */
  aiDrafted: z.boolean(),
  /** The pasted text the draft was read from. Only its fingerprint is kept. */
  sourceText: z.string().max(20000).optional(),
});
export type SubmitInvoiceInput = z.infer<typeof SubmitInvoiceInputSchema>;

/** `POST /api/issues/[id]/invoices/draft`. */
export const DraftInvoiceInputSchema = z.object({
  text: z.string().trim().min(1).max(20000),
});
export type DraftInvoiceInput = z.infer<typeof DraftInvoiceInputSchema>;

/** `POST /api/issues/[id]/goods-receipt`. */
export const RecordGoodsReceiptInputSchema = z.object({
  lines: z.array(ReceiptLineSchema).min(1).max(50),
  /** SHA-256 fingerprints of delivery photos or notes, computed on the device. */
  evidenceDigests: z.array(Hex32Schema).max(20).optional(),
});
export type RecordGoodsReceiptInput = z.infer<typeof RecordGoodsReceiptInputSchema>;
