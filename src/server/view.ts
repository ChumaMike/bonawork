/**
 * Shared domain → frontend view models (`src/data/types.ts`), exactly as the
 * "Mapping" table in docs/coordination/API_ROUTES.md.
 */
import { MEMORY_CHAIN_ID } from "@/server/ledger/memory";
import type {
  BlockchainReceipt,
  PublicTrailStep,
  ReportCategory,
  ReportStatus,
  UserRole,
} from "@/shared";
import type {
  ActorRole,
  EvidenceItem,
  EvidencePurpose,
  IndependentReview,
  Issue,
  IssueCategory,
  IssueStatus,
  IssueSummary,
  LedgerRecord,
  ResponsibleAuthority,
  School,
  SchoolProfile,
  SubmissionReceipt,
  TimelineEvent,
  TimelineEventType,
} from "@/data/types";
import type { CaseEventRow, EvidenceRow, InstitutionRow } from "../../database/schema";
import {
  financeActor,
  financeNote,
  isFinanceEventType,
  matchOutcomeOfNote,
} from "./procurement/notes";
import type { IssueBundle } from "./reports/common";

/* --------------------------------- Vocabularies ----------------------------- */

export const ISSUE_STATUS_FOR: Record<ReportStatus, IssueStatus | "declined"> = {
  submitted: "reported",
  acknowledged: "under_assessment",
  in_progress: "being_addressed",
  repair_claimed: "repair_claimed",
  verified: "independently_verified",
  disputed: "disputed",
  rejected: "declined",
};

export const REPORT_STATUS_FOR: Record<string, ReportStatus> = Object.fromEntries(
  Object.entries(ISSUE_STATUS_FOR).map(([k, v]) => [v, k as ReportStatus]),
);

/** Categories are shared verbatim (D5); `classrooms` is accepted from old links only. */
export const toIssueCategory = (c: ReportCategory): IssueCategory => c;
export const toReportCategory = (c: string): ReportCategory =>
  c === "classrooms" ? "learning_resources" : (c as ReportCategory);

export const ACTOR_ROLE_FOR: Record<UserRole | "system", ActorRole> = {
  reporter: "community",
  school_admin: "school_admin",
  district_official: "district",
  independent_reviewer: "reviewer",
  buyer: "buyer",
  supplier: "supplier",
  receiving_officer: "receiving_officer",
  payment_approver: "payment_approver",
  system: "system",
};

const PROVINCE_LABEL: Record<string, string> = {
  eastern_cape: "Eastern Cape",
  free_state: "Free State",
  gauteng: "Gauteng",
  kwazulu_natal: "KwaZulu-Natal",
  limpopo: "Limpopo",
  mpumalanga: "Mpumalanga",
  northern_cape: "Northern Cape",
  north_west: "North West",
  western_cape: "Western Cape",
};

const PHASE_LABEL: Record<InstitutionRow["phase"], School["phase"]> = {
  primary: "Primary",
  secondary: "Secondary",
  combined: "Combined",
  special: "Combined",
};

/* ----------------------------------- Ledger --------------------------------- */

export function toLedgerRecord(receipt: BlockchainReceipt | null): LedgerRecord {
  if (!receipt || receipt.status === "failed") return { source: "none" };
  if (receipt.chainId === MEMORY_CHAIN_ID) {
    return { source: "simulated", status: receipt.status };
  }
  return { source: "ledger", receipt };
}

/* ---------------------------------- Schools --------------------------------- */

export function toSchool(row: InstitutionRow): School {
  return {
    id: row.id,
    name: row.name,
    phase: PHASE_LABEL[row.phase],
    town: row.town,
    district: row.district,
    province: PROVINCE_LABEL[row.province] ?? row.province,
    learners: row.learnerCount ?? 0,
    participation: row.participation,
    participatingSince: row.participatingSince,
    about: row.about,
  };
}

const OPEN: ReportStatus[] = ["submitted", "acknowledged", "in_progress"];

export function toSchoolProfile(
  row: InstitutionRow,
  bundles: IssueBundle[],
): SchoolProfile {
  const own = bundles.filter((b) => b.report.institutionId === row.id);
  return {
    ...toSchool(row),
    stats: {
      open: own.filter((b) => OPEN.includes(b.report.status)).length,
      awaitingReview: own.filter((b) => b.report.status === "repair_claimed").length,
      verified: own.filter((b) => b.report.status === "verified").length,
    },
    latestUpdates: own
      .flatMap((b) =>
        toTimeline(b).map((event) => ({
          issueId: b.report.id,
          issueTitle: b.report.title,
          event,
        })),
      )
      .sort((a, b) => b.event.occurredAt.localeCompare(a.event.occurredAt))
      .slice(0, 4),
  };
}

/* ---------------------------------- Evidence -------------------------------- */

export function toEvidenceItem(row: EvidenceRow): EvidenceItem {
  return {
    id: row.id,
    version: row.version,
    purpose: row.purpose as EvidencePurpose,
    addedBy: ACTOR_ROLE_FOR[row.uploadedByRole],
    addedAt: row.createdAt,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    digest: row.digest as EvidenceItem["digest"],
    ledger: toLedgerRecord(row.receipt),
  };
}

/* ---------------------------------- Timeline -------------------------------- */

function timelineType(event: CaseEventRow): TimelineEventType {
  switch (event.type) {
    case "report_registered":
      return "reported";
    case "evidence_registered":
      return "evidence_added";
    case "report_acknowledged":
      return "assessment_started";
    case "interim_protection_recorded":
      return "interim_protection";
    case "repair_claimed":
      return "repair_claimed";
    case "repair_verified":
      return "verified";
    case "repair_disputed":
      return "disputed";
    case "status_changed":
      return event.statusTo === "rejected" ? "declined" : "progress_recorded";
    // Finance steps never reach the timeline (see `toTimeline`); the type keeps the switch total.
    case "work_order_approved":
    case "work_order_acknowledged":
    case "invoice_submitted":
    case "goods_receipt_recorded":
    case "match_recorded":
    case "payment_dispute_opened":
    case "payment_dispute_closed":
    case "release_authorised":
      return event.type;
  }
}

/**
 * The public timeline of a report. Finance steps are left out on purpose:
 * a timeline entry carries the event's stored note, and nothing about a
 * finance step may be public except what `toPublicTrail` builds. This also
 * keeps them out of a school's `latestUpdates`.
 */
export function toTimeline(bundle: IssueBundle): TimelineEvent[] {
  return bundle.events
    .filter((event) => !isFinanceEventType(event.type))
    .map((event) => ({
      id: event.id,
      type: timelineType(event) as TimelineEventType,
      // For a decline the note is the public reason itself.
      note: event.statusTo === "rejected" ? (event.reason ?? event.note) : event.note,
      actor: ACTOR_ROLE_FOR[event.actorRole],
      occurredAt: event.occurredAt,
      ledger: toLedgerRecord(event.receipt),
    }));
}

/**
 * The procurement steps of a report as anyone may see them: which step, the
 * role that took it, when, and the proof. Built from the case events alone:
 * this path reads no finance table, so it has no amount, supplier or person
 * to leak. The role comes from the event type and the sentence is a code
 * constant chosen by type, never the row's free text.
 */
export function toPublicTrail(bundle: IssueBundle): PublicTrailStep[] {
  return bundle.events.flatMap((event) => {
    if (!isFinanceEventType(event.type)) return [];
    const step: PublicTrailStep = {
      eventId: event.id,
      type: event.type,
      actor: financeActor(event.type, event.actorRole),
      occurredAt: event.occurredAt,
      note: financeNote(event.type, event.note),
      ledger: toLedgerRecord(event.receipt),
    };
    if (event.type === "match_recorded") {
      const outcome = matchOutcomeOfNote(event.note);
      if (outcome) step.outcome = outcome;
    }
    return [step];
  });
}

/* ----------------------------------- Issues --------------------------------- */

const DISTRICT_CATEGORIES: ReportCategory[] = [
  "sanitation",
  "water",
  "electricity",
  "buildings",
];

export function authorityFor(bundle: IssueBundle): ResponsibleAuthority {
  const { institution, report } = bundle;
  if (DISTRICT_CATEGORIES.includes(report.category)) {
    return {
      name: `${institution.district} — infrastructure unit`,
      responsibility: "Repairs the school cannot pay for or carry out itself.",
      level: "district",
    };
  }
  return {
    name: `${institution.name} — school management team`,
    responsibility: "Day-to-day maintenance and making the area safe.",
    level: "school",
  };
}

function reviewFor(bundle: IssueBundle): IndependentReview | null {
  const claim = bundle.claims.at(-1);
  if (!claim) return null;
  const review = bundle.reviews.find((r) => r.claimId === claim.id);
  if (review) {
    return {
      state: review.outcome,
      reviewerLabel: bundle.labels[review.reviewerId] ?? "Independent reviewer",
      assignedAt: claim.createdAt,
      note: review.findings,
    };
  }
  if (bundle.report.status === "repair_claimed") {
    return {
      state: "awaiting",
      reviewerLabel: "Independent district reviewer",
      assignedAt: claim.createdAt,
      note: null,
    };
  }
  return null;
}

export function toSummary(bundle: IssueBundle, viewerId: string | null): IssueSummary {
  const { report, institution } = bundle;
  return {
    id: report.id,
    reference: report.reference,
    schoolId: institution.id,
    schoolName: institution.name,
    schoolTown: institution.town,
    category: toIssueCategory(report.category),
    title: report.title,
    location: report.location,
    status: ISSUE_STATUS_FOR[report.status] as IssueStatus,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    endorsements: report.endorsementCount,
    endorsedByMe: viewerId !== null && bundle.endorserIds.includes(viewerId),
    hasInterimProtection: report.hasInterimProtection,
    evidenceCount: bundle.evidence.length,
  };
}

export function toIssue(bundle: IssueBundle, viewerId: string | null): Issue {
  const protection = bundle.protections.at(-1);
  return {
    ...toSummary(bundle, viewerId),
    description: bundle.report.description,
    authority: authorityFor(bundle),
    interimProtection: protection
      ? { description: protection.measure, recordedAt: protection.createdAt }
      : null,
    review: reviewFor(bundle),
    timeline: toTimeline(bundle),
    evidence: bundle.evidence.map(toEvidenceItem),
    publicTrail: toPublicTrail(bundle),
  };
}

export function toSubmissionReceipt(bundle: IssueBundle): SubmissionReceipt {
  return {
    reference: bundle.report.reference,
    issueId: bundle.report.id,
    submittedAt: bundle.report.createdAt,
    schoolName: bundle.institution.name,
    title: bundle.report.title,
    evidence: bundle.evidence.filter((e) => e.purpose === "problem").map(toEvidenceItem),
    ledger: toLedgerRecord(bundle.report.receipt),
  };
}
