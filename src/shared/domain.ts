import { z } from "zod";
import { Hex32Schema, IdSchema, IsoDateTimeSchema } from "./primitives";
import {
  CentsSchema,
  CurrencySchema,
  MatchReasonSchema,
  OrderLineSchema,
  ReceiptLineSchema,
} from "./procurement/base";
import { UserRoleSchema, type Permission, type UserRole } from "./roles";

/* --------------------------- Institutions and schools ------------------------ */

export const PROVINCES = [
  "eastern_cape",
  "free_state",
  "gauteng",
  "kwazulu_natal",
  "limpopo",
  "mpumalanga",
  "northern_cape",
  "north_west",
  "western_cape",
] as const;
export const ProvinceSchema = z.enum(PROVINCES);
export type Province = z.infer<typeof ProvinceSchema>;

/** Sectors BonaBlock serves. Add a value here to open a new use case. */
export const INSTITUTION_KINDS = ["school"] as const;
export const InstitutionKindSchema = z.enum(INSTITUTION_KINDS);
export type InstitutionKind = z.infer<typeof InstitutionKindSchema>;

/**
 * Any body a report can be about. Reports point at an institution, never
 * directly at a "school", so the platform is not tied to one sector.
 */
export const InstitutionSchema = z.object({
  id: IdSchema,
  kind: InstitutionKindSchema,
  name: z.string().min(1).max(200),
  province: ProvinceSchema,
  district: z.string().min(1).max(120),
  /** Official registry number. For schools: the national EMIS number. */
  externalRef: z.string().min(1).nullable(),
});
export type Institution = z.infer<typeof InstitutionSchema>;

/** BonaBlock for Schools: an institution of kind `school`. */
export const SchoolSchema = InstitutionSchema.extend({
  kind: z.literal("school"),
  phase: z.enum(["primary", "secondary", "combined", "special"]),
  learnerCount: z.number().int().nonnegative().nullable(),
});
export type School = z.infer<typeof SchoolSchema>;

/* ----------------------------------- Users ----------------------------------- */

/** Public profile. Contact details and credentials never leave the backend. */
export const UserSchema = z.object({
  id: IdSchema,
  displayName: z.string().min(1).max(80),
  role: UserRoleSchema,
  /** The institution a `school_admin` acts for; null for every other role. */
  institutionId: IdSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

/* ----------------------------- Blockchain receipt ---------------------------- */

/** Events emitted by BonaRegistry, exactly as named in the ABI. */
export const REGISTRY_EVENTS = [
  "ReportRegistered",
  "EvidenceRegistered",
  "ReportAcknowledged",
  "InterimProtectionRecorded",
  "RepairClaimed",
  "RepairVerified",
  "RepairDisputed",
] as const;
export const RegistryEventSchema = z.enum(REGISTRY_EVENTS);
export type RegistryEvent = z.infer<typeof RegistryEventSchema>;

/** Events emitted by InstitutionFinance, exactly as named in the ABI, in trail order. */
export const FINANCE_EVENTS = [
  "WorkOrderApproved",
  "WorkOrderAcknowledged",
  "InvoiceSubmitted",
  "GoodsReceiptRecorded",
  "MatchRecorded",
  "PaymentDisputeOpened",
  "PaymentDisputeClosed",
  "ReleaseAuthorised",
] as const;
export const FinanceEventSchema = z.enum(FINANCE_EVENTS);
export type FinanceEvent = z.infer<typeof FinanceEventSchema>;

/** Every event a ledger receipt can be about: the registry events, then the finance events. */
export const LEDGER_EVENTS = [...REGISTRY_EVENTS, ...FINANCE_EVENTS] as const;
export const LedgerEventSchema = z.enum(LEDGER_EVENTS);
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

/** CAIP-2 ids of the Avalanche C-Chain networks. */
export const AVALANCHE_CHAINS = {
  fuji: "eip155:43113",
  mainnet: "eip155:43114",
} as const;

/** Proof that one ledger write happened. Contains no personal data. */
export const BlockchainReceiptSchema = z.object({
  /** CAIP-2 chain id, e.g. `eip155:43113` (Avalanche Fuji). */
  chainId: z.string().min(1),
  contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  txId: Hex32Schema,
  status: z.enum(["pending", "confirmed", "failed"]),
  /** Null until the transaction is confirmed. */
  blockNumber: z.number().int().nonnegative().nullable(),
  blockTimestamp: IsoDateTimeSchema.nullable(),
  /** The event this write emits. */
  event: LedgerEventSchema,
});
export type BlockchainReceipt = z.infer<typeof BlockchainReceiptSchema>;

/* ---------------------------- Evidence commitment ---------------------------- */

/** BonaRegistry's `EvidenceKind` enum. The numbers are the values in the ABI. */
export const EVIDENCE_KIND_CODE = { report: 0, repair: 1, review: 2 } as const;
export const EvidenceKindSchema = z.enum(["report", "repair", "review"]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/** The only role that may submit each kind of evidence. Enforced on-chain too. */
export const EVIDENCE_KIND_ROLE: Record<EvidenceKind, UserRole> = {
  report: "reporter",
  repair: "school_admin",
  review: "independent_reviewer",
};

/**
 * Public commitment to one private evidence file. The file itself, its
 * storage location and its filename are never part of this shape.
 */
export const EvidenceCommitmentSchema = z.object({
  id: IdSchema,
  reportId: IdSchema,
  algorithm: z.literal("sha256"),
  /** SHA-256 of the exact uploaded bytes. Not salted: anyone with the file can check it. */
  digest: Hex32Schema,
  kind: EvidenceKindSchema,
  sizeBytes: z.number().int().positive(),
  mediaType: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  /** Null until `registerEvidence` has been sent. */
  receipt: BlockchainReceiptSchema.nullable(),
});
export type EvidenceCommitment = z.infer<typeof EvidenceCommitmentSchema>;

/* ----------------------------------- Report ---------------------------------- */

export const REPORT_CATEGORIES = [
  "sanitation",
  "water",
  "electricity",
  "buildings",
  "safety",
  "learning_resources",
  "other",
] as const;
export const ReportCategorySchema = z.enum(REPORT_CATEGORIES);
export type ReportCategory = z.infer<typeof ReportCategorySchema>;

export const REPORT_STATUSES = [
  "submitted",
  "acknowledged",
  /** Off-chain only: the school reports that work has started. */
  "in_progress",
  /** The school says it is fixed. Not yet proof. */
  "repair_claimed",
  /** An independent reviewer confirmed the repair. Final. */
  "verified",
  /** An independent reviewer rejected the repair claim. */
  "disputed",
  /** Off-chain only: the school declined the report, with a recorded reason. Final. */
  "rejected",
] as const;
export const ReportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

/** BonaRegistry's `Status` enum. The numbers are the values in the ABI. */
export const CHAIN_STATUS_CODE = {
  none: 0,
  reported: 1,
  acknowledged: 2,
  repair_claimed: 3,
  verified: 4,
  disputed: 5,
} as const;
export type ChainStatus = keyof typeof CHAIN_STATUS_CODE;

/**
 * The on-chain status a report must have while it is in each off-chain
 * status. `in_progress` is still `acknowledged` on-chain. Null means the
 * status has no on-chain write: the chain keeps whatever it had.
 */
export const CHAIN_STATUS_FOR_STATUS: Record<ReportStatus, ChainStatus | null> = {
  submitted: "reported",
  acknowledged: "acknowledged",
  in_progress: "acknowledged",
  repair_claimed: "repair_claimed",
  verified: "verified",
  disputed: "disputed",
  rejected: null,
};

export const ReportSchema = z.object({
  id: IdSchema,
  /** Human-friendly tracking reference, e.g. `BB-2026-000123`. */
  reference: z.string().regex(/^BB-\d{4}-\d{6}$/),
  institutionId: IdSchema,
  category: ReportCategorySchema,
  title: z.string().min(3).max(140),
  description: z.string().min(1).max(5000),
  status: ReportStatusSchema,
  /** Number of endorsements. See `EndorsementSchema`. */
  endorsementCount: z.number().int().nonnegative(),
  /** True while at least one interim protection is recorded and the report is not verified. */
  hasInterimProtection: z.boolean(),
  /** Null when the report was submitted anonymously. */
  reporterId: IdSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /** `computeCommitment` of the report's `ReportDocument`. */
  commitment: Hex32Schema,
  /** Receipt of `registerReport`. Null until sent. */
  receipt: BlockchainReceiptSchema.nullable(),
});
export type Report = z.infer<typeof ReportSchema>;

/** Request body for creating a report. The server assigns everything else. */
export const CreateReportInputSchema = ReportSchema.pick({
  institutionId: true,
  category: true,
  title: true,
  description: true,
}).extend({ anonymous: z.boolean() });
export type CreateReportInput = z.infer<typeof CreateReportInputSchema>;

/* -------------------------------- Endorsements ------------------------------- */

/**
 * "This affects me too." At most one per user per report; a reporter cannot
 * endorse their own report. Endorsements show how widely a problem is felt —
 * they are not evidence and are not written on-chain.
 */
export const EndorsementSchema = z.object({
  id: IdSchema,
  reportId: IdSchema,
  userId: IdSchema,
  createdAt: IsoDateTimeSchema,
});
export type Endorsement = z.infer<typeof EndorsementSchema>;

/* ------------------------------- Status history ------------------------------ */

/**
 * Every status change that is allowed. The on-chain moves match
 * BonaRegistry: a repair can only be claimed from acknowledged (which
 * includes `in_progress`) or `disputed`, and only verified or disputed
 * from `repair_claimed`.
 */
export const STATUS_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  submitted: ["acknowledged", "rejected"],
  acknowledged: ["in_progress", "repair_claimed", "rejected"],
  in_progress: ["repair_claimed"],
  repair_claimed: ["verified", "disputed"],
  disputed: ["in_progress", "repair_claimed"],
  verified: [],
  rejected: [],
};

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** The permission a user needs to move a report into `to`. */
export const PERMISSION_FOR_STATUS: Record<ReportStatus, Permission> = {
  submitted: "report:create",
  acknowledged: "report:acknowledge",
  in_progress: "case:update",
  rejected: "case:update",
  repair_claimed: "repair:claim",
  verified: "repair:verify",
  disputed: "repair:verify",
};

/* ------------------- Interim protection, repair claims, reviews -------------- */

/**
 * A temporary safety measure taken while the real repair is outstanding
 * (for example, closing off a collapsed toilet block). Recording one never
 * changes the report's status: protected is not repaired.
 */
export const InterimProtectionSchema = z.object({
  id: IdSchema,
  reportId: IdSchema,
  measure: z.string().min(1).max(2000),
  recordedBy: IdSchema,
  createdAt: IsoDateTimeSchema,
  /** `computeCommitment` of the `InterimProtectionDocument`. */
  commitment: Hex32Schema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type InterimProtection = z.infer<typeof InterimProtectionSchema>;

/** BonaRegistry's `ClaimOutcome` enum. The numbers are the values in the ABI. */
export const CLAIM_OUTCOME_CODE = { pending: 0, verified: 1, disputed: 2 } as const;
export const ClaimOutcomeSchema = z.enum(["pending", "verified", "disputed"]);
export type ClaimOutcome = z.infer<typeof ClaimOutcomeSchema>;

/** The school's statement that the problem is fixed. A claim, not proof. */
export const RepairClaimSchema = z.object({
  id: IdSchema,
  reportId: IdSchema,
  /** 0-based position among the report's claims; equals the on-chain `claimIndex`. */
  index: z.number().int().nonnegative(),
  summary: z.string().min(1).max(5000),
  claimedBy: IdSchema,
  outcome: ClaimOutcomeSchema,
  createdAt: IsoDateTimeSchema,
  /** `computeCommitment` of the `RepairClaimDocument`. */
  commitment: Hex32Schema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type RepairClaim = z.infer<typeof RepairClaimSchema>;

/**
 * An independent reviewer's finding on one repair claim. The reviewer must
 * never have acted as school admin for that institution. Submitting a review
 * moves the report to `verified` or `disputed`.
 */
export const IndependentReviewSchema = z.object({
  id: IdSchema,
  reportId: IdSchema,
  claimId: IdSchema,
  reviewerId: IdSchema,
  outcome: z.enum(["verified", "disputed"]),
  findings: z.string().min(1).max(5000),
  /** Evidence commitments of kind `review` backing the finding. */
  evidenceIds: z.array(IdSchema),
  createdAt: IsoDateTimeSchema,
  /** `computeCommitment` of the `ReviewDocument`. */
  commitment: Hex32Schema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type IndependentReview = z.infer<typeof IndependentReviewSchema>;

/* --------------------------- Commitment documents ---------------------------- */

const salted = { salt: Hex32Schema };

/**
 * The exact JSON that each on-chain commitment is a hash of. To verify a
 * commitment, a person needs this document including its salt.
 */
export const ReportDocumentSchema = z.object({
  type: z.literal("report"),
  reportId: IdSchema,
  institutionId: IdSchema,
  category: ReportCategorySchema,
  title: z.string(),
  description: z.string(),
  createdAt: IsoDateTimeSchema,
  ...salted,
});
export const InterimProtectionDocumentSchema = z.object({
  type: z.literal("interim_protection"),
  protectionId: IdSchema,
  reportId: IdSchema,
  measure: z.string(),
  createdAt: IsoDateTimeSchema,
  ...salted,
});
export const RepairClaimDocumentSchema = z.object({
  type: z.literal("repair_claim"),
  claimId: IdSchema,
  reportId: IdSchema,
  summary: z.string(),
  evidenceDigests: z.array(Hex32Schema),
  createdAt: IsoDateTimeSchema,
  ...salted,
});
export const ReviewDocumentSchema = z.object({
  type: z.literal("review"),
  reviewId: IdSchema,
  reportId: IdSchema,
  claimId: IdSchema,
  outcome: z.enum(["verified", "disputed"]),
  findings: z.string(),
  evidenceDigests: z.array(Hex32Schema),
  createdAt: IsoDateTimeSchema,
  ...salted,
});

/*
 * Finance documents. Each names its own id, its work order and its report.
 * They hold amounts and line detail, so the documents route only returns
 * their body to a caller with `procurement:read`.
 */
export const WorkOrderDocumentSchema = z.object({
  type: z.literal("work_order"),
  workOrderId: IdSchema,
  reportId: IdSchema,
  institutionId: IdSchema,
  /** 1-based. A change to the order is a new version with a new commitment. */
  version: z.number().int().positive(),
  description: z.string(),
  lines: z.array(OrderLineSchema),
  totalCents: CentsSchema,
  currency: CurrencySchema,
  createdAt: IsoDateTimeSchema,
  ...salted,
});
export const SupplierInvoiceDocumentSchema = z.object({
  type: z.literal("supplier_invoice"),
  invoiceId: IdSchema,
  workOrderId: IdSchema,
  reportId: IdSchema,
  invoiceNumber: z.string(),
  /** The order version the supplier invoiced against. */
  orderVersion: z.number().int().positive(),
  lines: z.array(OrderLineSchema),
  totalCents: CentsSchema,
  currency: CurrencySchema,
  createdAt: IsoDateTimeSchema,
  ...salted,
});
export const GoodsReceiptDocumentSchema = z.object({
  type: z.literal("goods_receipt"),
  receiptId: IdSchema,
  workOrderId: IdSchema,
  reportId: IdSchema,
  orderVersion: z.number().int().positive(),
  lines: z.array(ReceiptLineSchema),
  evidenceDigests: z.array(Hex32Schema),
  createdAt: IsoDateTimeSchema,
  ...salted,
});
export const MatchResultDocumentSchema = z.object({
  type: z.literal("match_result"),
  matchId: IdSchema,
  workOrderId: IdSchema,
  reportId: IdSchema,
  workOrderCommitment: Hex32Schema,
  invoiceCommitment: Hex32Schema,
  receiptCommitments: z.array(Hex32Schema),
  outcome: z.enum(["pass", "fail"]),
  reasons: z.array(MatchReasonSchema),
  /** Version of the rule engine that produced the outcome. */
  engineVersion: z.string(),
  createdAt: IsoDateTimeSchema,
  ...salted,
});
export const ReleaseDecisionDocumentSchema = z.object({
  type: z.literal("release_decision"),
  releaseId: IdSchema,
  workOrderId: IdSchema,
  reportId: IdSchema,
  matchCommitment: Hex32Schema,
  reviewCommitment: Hex32Schema,
  /** A release instruction. No money moves. */
  decision: z.literal("authorised"),
  createdAt: IsoDateTimeSchema,
  ...salted,
});

export const CommitmentDocumentSchema = z.discriminatedUnion("type", [
  ReportDocumentSchema,
  InterimProtectionDocumentSchema,
  RepairClaimDocumentSchema,
  ReviewDocumentSchema,
  WorkOrderDocumentSchema,
  SupplierInvoiceDocumentSchema,
  GoodsReceiptDocumentSchema,
  MatchResultDocumentSchema,
  ReleaseDecisionDocumentSchema,
]);
/** The document types that hold amounts and line detail. */
export const FINANCE_DOCUMENT_TYPES = [
  "work_order",
  "supplier_invoice",
  "goods_receipt",
  "match_result",
  "release_decision",
] as const;
export type FinanceDocumentType = (typeof FINANCE_DOCUMENT_TYPES)[number];
export type ReportDocument = z.infer<typeof ReportDocumentSchema>;
export type InterimProtectionDocument = z.infer<typeof InterimProtectionDocumentSchema>;
export type RepairClaimDocument = z.infer<typeof RepairClaimDocumentSchema>;
export type ReviewDocument = z.infer<typeof ReviewDocumentSchema>;
export type WorkOrderDocument = z.infer<typeof WorkOrderDocumentSchema>;
export type SupplierInvoiceDocument = z.infer<typeof SupplierInvoiceDocumentSchema>;
export type GoodsReceiptDocument = z.infer<typeof GoodsReceiptDocumentSchema>;
export type MatchResultDocument = z.infer<typeof MatchResultDocumentSchema>;
export type ReleaseDecisionDocument = z.infer<typeof ReleaseDecisionDocumentSchema>;
export type CommitmentDocument = z.infer<typeof CommitmentDocumentSchema>;

/* --------------------------------- Case event -------------------------------- */

/** Off-chain event names and the ledger event each corresponds to (null = no on-chain write). */
export const CASE_EVENT_REGISTRY_EVENT = {
  report_registered: "ReportRegistered",
  evidence_registered: "EvidenceRegistered",
  report_acknowledged: "ReportAcknowledged",
  interim_protection_recorded: "InterimProtectionRecorded",
  repair_claimed: "RepairClaimed",
  repair_verified: "RepairVerified",
  repair_disputed: "RepairDisputed",
  /** Off-chain only: a move to `in_progress` or `rejected`. */
  status_changed: null,
  /* The finance steps. None of them changes the report status. */
  work_order_approved: "WorkOrderApproved",
  work_order_acknowledged: "WorkOrderAcknowledged",
  invoice_submitted: "InvoiceSubmitted",
  goods_receipt_recorded: "GoodsReceiptRecorded",
  match_recorded: "MatchRecorded",
  payment_dispute_opened: "PaymentDisputeOpened",
  payment_dispute_closed: "PaymentDisputeClosed",
  release_authorised: "ReleaseAuthorised",
} as const satisfies Record<string, LedgerEvent | null>;
export type CaseEventType = keyof typeof CASE_EVENT_REGISTRY_EVENT;
export const CASE_EVENT_TYPES = Object.keys(CASE_EVENT_REGISTRY_EVENT) as [
  CaseEventType,
  ...CaseEventType[],
];
export const CaseEventTypeSchema = z.enum(CASE_EVENT_TYPES);

/** The case events of the procurement trail, in trail order. */
export const FINANCE_CASE_EVENT_TYPES = [
  "work_order_approved",
  "work_order_acknowledged",
  "invoice_submitted",
  "goods_receipt_recorded",
  "match_recorded",
  "payment_dispute_opened",
  "payment_dispute_closed",
  "release_authorised",
] as const satisfies readonly CaseEventType[];
export const FinanceCaseEventTypeSchema = z.enum(FINANCE_CASE_EVENT_TYPES);
export type FinanceCaseEventType = z.infer<typeof FinanceCaseEventTypeSchema>;

/** The status a report has immediately after each event. Null = unchanged. */
export const CASE_EVENT_RESULTING_STATUS: Record<CaseEventType, ReportStatus | null> = {
  report_registered: "submitted",
  evidence_registered: null,
  report_acknowledged: "acknowledged",
  interim_protection_recorded: null,
  repair_claimed: "repair_claimed",
  repair_verified: "verified",
  repair_disputed: "disputed",
  /** Read the new status from the event's `statusTo`. */
  status_changed: null,
  /* Finance steps never change the report status. */
  work_order_approved: null,
  work_order_acknowledged: null,
  invoice_submitted: null,
  goods_receipt_recorded: null,
  match_recorded: null,
  payment_dispute_opened: null,
  payment_dispute_closed: null,
  release_authorised: null,
};

/**
 * One entry in a report's append-only timeline. Events are never edited or
 * deleted. Every type except `status_changed` mirrors one BonaRegistry event, so the off-chain
 * timeline can always be checked against `getLogs` filtered by report id.
 */
export const CaseEventSchema = z.object({
  id: IdSchema,
  reportId: IdSchema,
  /** 0-based, gap-free position within the report's timeline. */
  sequence: z.number().int().nonnegative(),
  type: CaseEventTypeSchema,
  /** Null for anonymous reporters. */
  actorId: IdSchema.nullable(),
  actorRole: UserRoleSchema,
  occurredAt: IsoDateTimeSchema,
  /** The record this event is about: evidence, protection, claim or review id. Null for report events. */
  subjectId: IdSchema.nullable(),
  /** The bytes32 value written on-chain: a commitment or an evidence digest. Null for `report_acknowledged`. */
  anchoredValue: Hex32Schema.nullable(),
  /** Only for `status_changed`: `in_progress` or `rejected`. */
  statusTo: z.enum(["in_progress", "rejected"]).nullable(),
  /** Only for `status_changed` to `rejected`: why. */
  reason: z.string().max(1000).nullable(),
  receipt: BlockchainReceiptSchema.nullable(),
});
export type CaseEvent = z.infer<typeof CaseEventSchema>;

/** One row of a report's status timeline. Derived from case events that change status. */
export const StatusHistoryEntrySchema = z.object({
  /** The case event that caused this change. */
  eventId: IdSchema,
  reportId: IdSchema,
  /** Null for the first entry (`submitted`). */
  from: ReportStatusSchema.nullable(),
  to: ReportStatusSchema,
  actorRole: UserRoleSchema,
  /** Set when `to` is `rejected`. */
  reason: z.string().max(1000).nullable(),
  occurredAt: IsoDateTimeSchema,
  receipt: BlockchainReceiptSchema.nullable(),
});
export type StatusHistoryEntry = z.infer<typeof StatusHistoryEntrySchema>;
