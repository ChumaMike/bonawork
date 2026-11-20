/**
 * Frontend view models.
 *
 * These are the shapes the screens render. They reuse the shared wire types
 * (`@/shared`) wherever one exists. Where the shared contracts do not yet
 * cover something the product needs — the six public statuses, community
 * endorsements, interim protection, independent review — the shape is defined
 * here and listed in docs/FRONTEND_INTEGRATION.md as a proposed contract.
 */
import type {
  BlockchainReceipt,
  FinanceCaseEventType,
  Hex32,
  IsoDateTime,
  PublicTrailStep,
} from "@/shared";

/*
 * The procurement view models are shared with the backend as they are: the
 * routes return exactly these shapes. Screens import them from here.
 */
export type {
  ApproveWorkOrderInput,
  InvoiceDraft,
  InvoiceDraftLine,
  MatchReason,
  MatchReasonCode,
  MismatchExplanation,
  MoneyTrail,
  MoneyTrailStep,
  OrderLine,
  ProcurementStage,
  PublicTrailStep,
  ReceiptLine,
  RecordGoodsReceiptInput,
  ReleaseBlocker,
  ReleaseBlockerCode,
  ReleaseGate,
  SubmitInvoiceInput,
  TrailActor,
  TrailInvoice,
  TrailLine,
  TrailMatch,
  TrailOrder,
  TrailReceipt,
  WorkQueueAction,
  WorkQueueItem,
} from "@/shared";

/* --------------------------------- Status --------------------------------- */

/**
 * What the public sees. Order is the normal life of an issue.
 * `repair_claimed` is deliberately distinct from `independently_verified`:
 * a repair claim is not verification.
 */
export const ISSUE_STATUSES = [
  "reported",
  "under_assessment",
  "being_addressed",
  "repair_claimed",
  "independently_verified",
  "disputed",
  "declined",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_CATEGORIES = [
  "sanitation",
  "water",
  "electricity",
  "buildings",
  "safety",
  "learning_resources",
  "other",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

/** Who did something, as the public reads it. `system` is the platform itself, e.g. the rule engine. */
export type ActorRole =
  | "community"
  | "school_admin"
  | "district"
  | "reviewer"
  | "buyer"
  | "supplier"
  | "receiving_officer"
  | "payment_approver"
  | "system";

/* --------------------------------- Ledger --------------------------------- */

/**
 * Where a record stands on the ledger.
 *
 * - `none`      — nothing has been written to a ledger.
 * - `simulated` — development sample. It carries no transaction data at all,
 *                 so the UI has nothing that could be mistaken for a real one.
 * - `ledger`    — a real receipt returned by the backend.
 */
export type LedgerRecord =
  | { source: "none" }
  | { source: "simulated"; status: "pending" | "confirmed" }
  | { source: "ledger"; receipt: BlockchainReceipt };

/**
 * A record's ledger receipt as plain JSON, ready to paste into BonaBlock Verify.
 * Kept loose on purpose: the verifier, not this app, decides what is valid.
 */
export type ReceiptJson = Record<string, unknown>;

/** What BonaBlock Verify needs to check one ledger record. */
export interface RecordProof {
  /** Null when the record has not been written to a ledger. */
  receipt: ReceiptJson | null;
  /**
   * The salted commitment document behind a report, interim protection,
   * repair claim or review. Absent for evidence, where the file is the input.
   */
  document?: ReceiptJson | null;
}

/* -------------------------------- Evidence -------------------------------- */

export type EvidencePurpose = "problem" | "progress" | "repair_claim" | "review";

/** Public metadata about one private evidence file. Never the file itself. */
export interface EvidenceItem {
  id: string;
  /** 1-based position in the issue's evidence history. */
  version: number;
  purpose: EvidencePurpose;
  addedBy: ActorRole;
  addedAt: IsoDateTime;
  mediaType: string;
  sizeBytes: number;
  /** SHA-256 of the exact uploaded bytes. */
  digest: Hex32;
  ledger: LedgerRecord;
}

/** A file chosen in the browser, with its fingerprint computed on the device. */
export interface EvidenceUpload {
  file: File;
  digest: Hex32;
}

/* -------------------------------- Timeline -------------------------------- */

export type TimelineEventType =
  | "reported"
  | "assessment_started"
  | "progress_recorded"
  | "interim_protection"
  | "repair_claimed"
  | "verified"
  | "disputed"
  | "declined"
  | "evidence_added"
  /* The finance steps keep their case-event names. */
  | FinanceCaseEventType;

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  note: string;
  actor: ActorRole;
  occurredAt: IsoDateTime;
  ledger: LedgerRecord;
}

/* --------------------------------- Issues --------------------------------- */

export interface ResponsibleAuthority {
  name: string;
  /** What this body is responsible for, in plain language. */
  responsibility: string;
  level: "school" | "district" | "province";
}

export interface InterimProtection {
  description: string;
  recordedAt: IsoDateTime;
}

export interface IndependentReview {
  state: "awaiting" | "verified" | "disputed";
  reviewerLabel: string;
  assignedAt: IsoDateTime;
  note: string | null;
}

export interface IssueSummary {
  id: string;
  /** Tracking reference, e.g. `BB-2026-000123`. */
  reference: string;
  schoolId: string;
  schoolName: string;
  schoolTown: string;
  category: IssueCategory;
  title: string;
  location: string;
  status: IssueStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  endorsements: number;
  /** Whether this visitor has said "I'm affected too". */
  endorsedByMe: boolean;
  hasInterimProtection: boolean;
  evidenceCount: number;
}

export interface Issue extends IssueSummary {
  description: string;
  authority: ResponsibleAuthority;
  interimProtection: InterimProtection | null;
  review: IndependentReview | null;
  timeline: TimelineEvent[];
  evidence: EvidenceItem[];
  /**
   * The procurement steps on this case, oldest first: role, time and proof
   * only. Absent or empty when the case has no work order.
   */
  publicTrail?: PublicTrailStep[];
}

export interface IssueFilter {
  query?: string;
  status?: IssueStatus;
  category?: IssueCategory;
  schoolId?: string;
  sort?: "recent" | "most_affected";
}

/* --------------------------------- Schools -------------------------------- */

export interface School {
  id: string;
  name: string;
  phase: "Primary" | "Secondary" | "Combined";
  town: string;
  district: string;
  province: string;
  learners: number;
  /** `participating` schools respond to reports here; `invited` ones have not joined yet. */
  participation: "participating" | "invited";
  participatingSince: IsoDateTime | null;
  about: string;
}

export interface SchoolUpdate {
  issueId: string;
  issueTitle: string;
  event: TimelineEvent;
}

export interface SchoolProfile extends School {
  stats: { open: number; awaitingReview: number; verified: number };
  latestUpdates: SchoolUpdate[];
}

/* -------------------------------- Reporting ------------------------------- */

export interface SubmitReportInput {
  schoolId: string;
  category: IssueCategory;
  title: string;
  description: string;
  location: string;
  anonymous: boolean;
  evidence: EvidenceUpload[];
}

export interface SubmissionReceipt {
  reference: string;
  issueId: string;
  submittedAt: IsoDateTime;
  schoolName: string;
  title: string;
  evidence: EvidenceItem[];
  /** Ledger state of the report event itself. */
  ledger: LedgerRecord;
}

/* -------------------------------- Assistant ------------------------------- */

export interface AssistantAction {
  label: string;
  href: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  issues?: IssueSummary[];
  school?: School;
  actions?: AssistantAction[];
}

/* --------------------------------- Session -------------------------------- */

/** Mirrors `UserRole` in `@/shared`. Import it from there once this branch has the updated shared types. */
export type SessionRole =
  | "reporter"
  | "school_admin"
  | "district_official"
  | "independent_reviewer"
  | "buyer"
  | "supplier"
  | "receiving_officer"
  | "payment_approver";

/** An account the sign-in screen offers for one-tap sign-in during the demo. */
export interface DemoAccount {
  email: string;
  role: SessionRole;
  /** Public display name, e.g. "Ms Zanele Nkosi". */
  displayName: string;
}

export interface Session {
  user: {
    id: string;
    /** Public display name, e.g. "School admin". Never a private name. */
    displayName: string;
    role: SessionRole;
    /** The school a school administrator belongs to. Null for other roles. */
    institutionId: string | null;
  };
  permissions: string[];
}

/** Result of asking the ledger whether the caller may verify a repair. Never writes. */
export interface VerificationProbe {
  allowed: boolean;
  /** The contract error name when refused, e.g. `SchoolAdminCannotVerify`. */
  revert: string | null;
  chainRole: string;
}

/* ------------------------------ Verification ------------------------------ */

export interface DigestMatch {
  issue: IssueSummary;
  evidence: EvidenceItem;
}
