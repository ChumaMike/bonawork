/**
 * BonaBlock database schema (Drizzle ORM, PostgreSQL dialect).
 *
 * Runs unchanged on Postgres (`DATABASE_URL`) and on PGlite (local
 * development and tests). Rows parse with the shared schemas in `@/shared`:
 * timestamps are stored as ISO-8601 UTC text so both drivers return exactly
 * the wire format; receipts and commitment documents are stored as JSON.
 *
 * `case_events` is append-only: the application never updates or deletes a
 * row except to attach the ledger receipt once the write is anchored.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  BlockchainReceipt,
  CaseEventType,
  ClaimOutcome,
  CommitmentDocument,
  EvidenceKind,
  MatchOutcome,
  MatchReason,
  OrderLine,
  ReceiptLine,
  ReportCategory,
  ReportStatus,
  UserRole,
} from "../src/shared";

const receipt = () => jsonb("receipt").$type<BlockchainReceipt | null>();

/**
 * How a problem affects the learners, as the reporter answered it. Every
 * answer is optional. Not part of the report's commitment document: it is
 * context for funders, not evidence.
 */
export type LearnerImpact = {
  /** How many learners cannot use the thing that is broken. */
  learners?: number;
  /** Since when, in the reporter's own words ("About 3 weeks"). */
  since?: string;
  /** What learners do instead. */
  instead?: string[];
  /** Is anyone in danger right now? */
  danger?: "yes" | "unhealthy" | "no";
};
/** ISO-8601 UTC text, set by the application. */
const isoNow = () => text("created_at").notNull();

/* --------------------------------- Schools --------------------------------- */

export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").primaryKey(),
    /** URL-friendly id kept so links written against the fixtures still resolve. */
    slug: text("slug").notNull(),
    kind: text("kind").notNull().default("school"),
    name: text("name").notNull(),
    province: text("province").notNull(),
    district: text("district").notNull(),
    town: text("town").notNull(),
    externalRef: text("external_ref"),
    phase: text("phase")
      .notNull()
      .$type<"primary" | "secondary" | "combined" | "special">(),
    learnerCount: integer("learner_count"),
    participation: text("participation")
      .notNull()
      .$type<"participating" | "invited">()
      .default("invited"),
    participatingSince: text("participating_since"),
    about: text("about").notNull().default(""),
    createdAt: isoNow(),
  },
  (t) => [uniqueIndex("institutions_slug_idx").on(t.slug)],
);

/* ---------------------------------- Users ---------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().$type<UserRole>(),
    institutionId: uuid("institution_id").references(() => institutions.id),
    /** Real name. Shown only to the user, school administrators and reviewers. */
    displayName: text("display_name").notNull(),
    /** What the public sees, e.g. "Reporter R-7F3A". */
    publicLabel: text("public_label").notNull(),
    /**
     * Supplier accounts only: the registration reference a buyer names on a
     * work order, and the trading name shown to procurement staff. Null for
     * every other role. Never part of a public response.
     */
    supplierRef: text("supplier_ref"),
    supplierName: text("supplier_name"),
    createdAt: isoNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_supplier_ref_idx").on(t.supplierRef),
  ],
);

/* --------------------------------- Reports --------------------------------- */

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey(),
    reference: text("reference").notNull(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    category: text("category").notNull().$type<ReportCategory>(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    location: text("location").notNull().default(""),
    /** Optional answers about the learners; see `LearnerImpact`. */
    impact: jsonb("impact").$type<LearnerImpact | null>(),
    status: text("status").notNull().$type<ReportStatus>(),
    endorsementCount: integer("endorsement_count").notNull().default(0),
    hasInterimProtection: boolean("has_interim_protection").notNull().default(false),
    /** Null when submitted anonymously: the reporter is simply not stored. */
    reporterId: uuid("reporter_id").references(() => users.id),
    commitment: text("commitment").notNull(),
    receipt: receipt(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("reports_reference_idx").on(t.reference),
    index("reports_institution_idx").on(t.institutionId),
  ],
);

/* ------------------------------- Case events ------------------------------- */

export const caseEvents = pgTable(
  "case_events",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull().$type<CaseEventType>(),
    actorId: uuid("actor_id").references(() => users.id),
    actorRole: text("actor_role").notNull().$type<UserRole>(),
    occurredAt: text("occurred_at").notNull(),
    subjectId: uuid("subject_id"),
    anchoredValue: text("anchored_value"),
    statusTo: text("status_to").$type<"in_progress" | "rejected" | null>(),
    reason: text("reason"),
    /** Human-readable note shown in the timeline (never written on-chain). */
    note: text("note").notNull().default(""),
    receipt: receipt(),
  },
  (t) => [uniqueIndex("case_events_report_sequence_idx").on(t.reportId, t.sequence)],
);

/* --------------------------------- Evidence -------------------------------- */

export const evidenceCommitments = pgTable(
  "evidence_commitments",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    /** 1-based position in the report's evidence history. */
    version: integer("version").notNull(),
    algorithm: text("algorithm").notNull().default("sha256"),
    digest: text("digest").notNull(),
    kind: text("kind").notNull().$type<EvidenceKind>(),
    /** Frontend purpose (problem, progress, repair_claim, review). */
    purpose: text("purpose").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    mediaType: text("media_type").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    uploadedByRole: text("uploaded_by_role").notNull().$type<UserRole>(),
    /** Private storage key. Never returned by the API. */
    storageKey: text("storage_key").notNull(),
    createdAt: text("created_at").notNull(),
    receipt: receipt(),
  },
  (t) => [
    uniqueIndex("evidence_report_digest_idx").on(t.reportId, t.digest),
    index("evidence_digest_idx").on(t.digest),
  ],
);

/* ------------------------------- Endorsements ------------------------------ */

export const endorsements = pgTable(
  "endorsements",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("endorsements_report_user_idx").on(t.reportId, t.userId)],
);

/* ----------------------- Protection, claims and reviews -------------------- */

export const interimProtections = pgTable("interim_protections", {
  id: uuid("id").primaryKey(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id),
  measure: text("measure").notNull(),
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  commitment: text("commitment").notNull(),
  receipt: receipt(),
});

export const repairClaims = pgTable("repair_claims", {
  id: uuid("id").primaryKey(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id),
  index: integer("index").notNull(),
  summary: text("summary").notNull(),
  claimedBy: uuid("claimed_by")
    .notNull()
    .references(() => users.id),
  outcome: text("outcome").notNull().$type<ClaimOutcome>().default("pending"),
  createdAt: text("created_at").notNull(),
  commitment: text("commitment").notNull(),
  receipt: receipt(),
});

export const independentReviews = pgTable("independent_reviews", {
  id: uuid("id").primaryKey(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id),
  claimId: uuid("claim_id")
    .notNull()
    .references(() => repairClaims.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => users.id),
  outcome: text("outcome").notNull().$type<"verified" | "disputed">(),
  findings: text("findings").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull().$type<string[]>().default([]),
  createdAt: text("created_at").notNull(),
  commitment: text("commitment").notNull(),
  receipt: receipt(),
});

/* --------------------------- Commitment documents -------------------------- */

/** The salted JSON each on-chain commitment hashes. Keyed by the record it belongs to. */
export const commitmentDocuments = pgTable("commitment_documents", {
  recordId: uuid("record_id").primaryKey(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => reports.id),
  type: text("type").notNull().$type<CommitmentDocument["type"]>(),
  commitment: text("commitment").notNull(),
  document: jsonb("document").notNull().$type<CommitmentDocument>(),
  createdAt: text("created_at").notNull(),
});

/* -------------------------------- Procurement ------------------------------ */

/*
 * The procurement trail of a report. These tables hold amounts, supplier
 * names and people: only the signed-in procurement routes read them. The
 * public issue views are built from `case_events` alone.
 */

/** One work order per report (for now). The scope and lines live in its versions. */
export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    /** The buyer who approved version 1. */
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    /** The supplier account the order is bound to. */
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => users.id),
    supplierName: text("supplier_name").notNull(),
    supplierRef: text("supplier_ref").notNull(),
    currentVersion: integer("current_version").notNull(),
    /** The version the supplier acknowledged; null until the first acknowledgement. */
    acknowledgedVersion: integer("acknowledged_version"),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    acknowledgedAt: text("acknowledged_at"),
    createdAt: isoNow(),
  },
  (t) => [
    uniqueIndex("work_orders_report_idx").on(t.reportId),
    index("work_orders_supplier_idx").on(t.supplierId),
  ],
);

/** One approved version of a work order. Its id is the record id of its commitment document. */
export const workOrderVersions = pgTable(
  "work_order_versions",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => workOrders.id),
    /** 1-based. */
    version: integer("version").notNull(),
    /** Scope of work, in words. */
    scope: text("scope").notNull(),
    lines: jsonb("lines").notNull().$type<OrderLine[]>(),
    totalCents: integer("total_cents").notNull(),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id),
    commitment: text("commitment").notNull(),
    createdAt: isoNow(),
  },
  (t) => [uniqueIndex("work_order_versions_order_version_idx").on(t.orderId, t.version)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => workOrders.id),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    /** The order version the supplier invoiced against. */
    orderVersion: integer("order_version").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    supplierRef: text("supplier_ref").notNull(),
    lines: jsonb("lines").notNull().$type<OrderLine[]>(),
    /** The total as stated on the invoice; the match engine checks it. */
    statedTotalCents: integer("stated_total_cents").notNull(),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id),
    aiDrafted: boolean("ai_drafted").notNull().default(false),
    /** SHA-256 of the pasted text an AI draft was read from. The text itself is not kept. */
    sourceTextDigest: text("source_text_digest"),
    commitment: text("commitment").notNull(),
    createdAt: isoNow(),
  },
  (t) => [index("invoices_order_idx").on(t.orderId)],
);

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => workOrders.id),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    orderVersion: integer("order_version").notNull(),
    lines: jsonb("lines").notNull().$type<ReceiptLine[]>(),
    evidenceDigests: jsonb("evidence_digests").notNull().$type<string[]>().default([]),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => users.id),
    commitment: text("commitment").notNull(),
    createdAt: isoNow(),
  },
  (t) => [index("goods_receipts_order_idx").on(t.orderId)],
);

/** One run of the rule engine over an invoice. Written by code only. */
export const matchResults = pgTable(
  "match_results",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => workOrders.id),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    /** The latest goods receipt the run saw; null when there was none. */
    receiptId: uuid("receipt_id").references(() => goodsReceipts.id),
    /** The order version that was current when the engine ran. */
    orderVersion: integer("order_version").notNull(),
    outcome: text("outcome").notNull().$type<MatchOutcome>(),
    reasons: jsonb("reasons").notNull().$type<MatchReason[]>(),
    /** SHA-256 of the canonical JSON of exactly what the engine was given. */
    inputsDigest: text("inputs_digest").notNull(),
    engineVersion: text("engine_version").notNull(),
    commitment: text("commitment").notNull(),
    createdAt: isoNow(),
  },
  (t) => [index("match_results_invoice_idx").on(t.invoiceId)],
);

/** The release instruction for an order. At most one per order. It moves no money. */
export const releaseInstructions = pgTable(
  "release_instructions",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => workOrders.id),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matchResults.id),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => independentReviews.id),
    authorisedBy: uuid("authorised_by")
      .notNull()
      .references(() => users.id),
    commitment: text("commitment").notNull(),
    createdAt: isoNow(),
  },
  (t) => [uniqueIndex("release_instructions_order_idx").on(t.orderId)],
);

/* -------------------------------- Ledger jobs ------------------------------ */

export type LedgerOperation =
  | "registerReport"
  | "registerEvidence"
  | "acknowledgeReport"
  | "recordInterimProtection"
  | "claimRepair"
  | "verifyRepair"
  | "disputeRepair"
  /* Finance writes. Payload: the matching `LedgerPort` input, every value a string. */
  | "approve_work_order"
  | "acknowledge_work_order"
  | "submit_invoice"
  | "record_goods_receipt"
  | "record_match_result"
  | "open_payment_dispute"
  | "close_payment_dispute"
  | "authorise_release";

/** Which record receives the receipt besides the case event (`event` = the event only). */
export type LedgerTargetKind =
  "report" | "evidence" | "protection" | "claim" | "review" | "event";

/**
 * A ledger write that could not be sent (RPC down, ledger not configured).
 * Replayed in creation order by `POST /api/ledger/retry`. The payload holds
 * only what the `LedgerPort` call takes: UUIDs and 0x digests.
 */
export const ledgerJobs = pgTable(
  "ledger_jobs",
  {
    id: uuid("id").primaryKey(),
    /** Creation order; jobs are replayed in this order so a report is registered before its evidence. */
    position: serial("position").notNull(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    operation: text("operation").notNull().$type<LedgerOperation>(),
    payload: jsonb("payload").notNull().$type<Record<string, string>>(),
    targetKind: text("target_kind").notNull().$type<LedgerTargetKind>(),
    targetId: uuid("target_id").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => caseEvents.id),
    status: text("status").notNull().$type<"pending" | "failed" | "done" | "rejected">(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("ledger_jobs_status_idx").on(t.status)],
);

/* ----------------------------- Solana escrows ------------------------------ */

/** One Solana transaction sent for an escrow. Public: signatures only. */
export type EscrowTxRecord = {
  step:
    | "create"
    | "cash_in"
    | "fund"
    | "activate"
    | "claim"
    | "verify"
    | "release"
    | "refund"
    | "sweep"
    | "reassign_reviewer";
  /** Tranche index for claim / verify / release / refund. */
  index?: 0 | 1;
  signature: string;
  at: string;
};

/** Who a tranche releases to, as fixed in the escrow at creation. */
export type EscrowPayee = {
  address: string;
  /** `supplier`: a materials supplier. `contractor`: the escrow's contractor. */
  role: "supplier" | "contractor";
  /** True when the address is a server-held demo key. */
  demo: boolean;
};

/**
 * The BonaWork escrow on Solana devnet that holds the sandbox demo rand for a
 * case. One per report. The chain is the source of truth for tranche states;
 * this row keeps the addresses, the amounts as created and the signatures sent,
 * and `watch` marks the escrows the Escrow Watchdog (keeper) still scans.
 */
export const escrowCases = pgTable(
  "escrow_cases",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    cluster: text("cluster").notNull().$type<"devnet">().default("devnet"),
    escrowAddress: text("escrow_address").notNull(),
    vaultAddress: text("vault_address").notNull(),
    /** Hex SHA-256 of the case, as written into the escrow. */
    caseHash: text("case_hash").notNull(),
    termsHash: text("terms_hash").notNull(),
    funderAddress: text("funder_address").notNull(),
    /** `demo`: the server-held demo funder key. `wallet`: the funder's own wallet. */
    funderKind: text("funder_kind").notNull().$type<"demo" | "wallet">(),
    contractorAddress: text("contractor_address").notNull(),
    schoolAddress: text("school_address").notNull(),
    reviewerAddress: text("reviewer_address").notNull(),
    /** Payee per tranche: [Check 1, Check 2]. Empty on layout-1 (legacy) rows. */
    payees: jsonb("payees").notNull().$type<EscrowPayee[]>().default([]),
    /**
     * Escrow account layout. 1: before per-tranche payees (403 bytes, no longer
     * decodable by this client). 2: with payees (435 bytes).
     */
    layout: integer("layout").notNull().default(1),
    /** Cents of sandbox demo rand per tranche, as strings: [materials, completion]. */
    trancheAmounts: jsonb("tranche_amounts").notNull().$type<[string, string]>(),
    challengeSeconds: integer("challenge_seconds").notNull(),
    transactions: jsonb("transactions").notNull().$type<EscrowTxRecord[]>().default([]),
    /** Scanned by `/api/cron/watchdog` until both tranches are settled. */
    watch: boolean("watch").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("escrow_cases_report_idx").on(t.reportId),
    uniqueIndex("escrow_cases_escrow_idx").on(t.escrowAddress),
    index("escrow_cases_watch_idx").on(t.watch),
  ],
);

/** One confirmed line of a Repair Scout budget. Public: parts and prices only. */
export type RepairBudgetLine = {
  description: string;
  quantity: number;
  kind: "material" | "service";
  unitPriceCents: number;
};

/**
 * The repair budget the school confirmed with Repair Scout. It only prefills
 * the funder's escrow terms (total and the 40/60 split); the escrow itself is
 * what binds. One per report; confirming again replaces it.
 */
export const repairBudgets = pgTable("repair_budgets", {
  reportId: uuid("report_id")
    .primaryKey()
    .references(() => reports.id),
  totalCents: integer("total_cents").notNull(),
  materialsCents: integer("materials_cents").notNull(),
  completionCents: integer("completion_cents").notNull(),
  lines: jsonb("lines").notNull().$type<RepairBudgetLine[]>(),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedAt: text("confirmed_at").notNull(),
});

export type RepairBudgetRow = typeof repairBudgets.$inferSelect;
export type EscrowCaseRow = typeof escrowCases.$inferSelect;
export type InstitutionRow = typeof institutions.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type CaseEventRow = typeof caseEvents.$inferSelect;
export type EvidenceRow = typeof evidenceCommitments.$inferSelect;
export type EndorsementRow = typeof endorsements.$inferSelect;
export type InterimProtectionRow = typeof interimProtections.$inferSelect;
export type RepairClaimRow = typeof repairClaims.$inferSelect;
export type IndependentReviewRow = typeof independentReviews.$inferSelect;
export type CommitmentDocumentRow = typeof commitmentDocuments.$inferSelect;
export type LedgerJobRow = typeof ledgerJobs.$inferSelect;
export type WorkOrderRow = typeof workOrders.$inferSelect;
export type WorkOrderVersionRow = typeof workOrderVersions.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type GoodsReceiptRow = typeof goodsReceipts.$inferSelect;
export type MatchResultRow = typeof matchResults.$inferSelect;
export type ReleaseInstructionRow = typeof releaseInstructions.$inferSelect;
