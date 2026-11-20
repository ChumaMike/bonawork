/**
 * DEVELOPMENT FIXTURE implementation of `BonaApi`.
 *
 * Runs entirely in the browser on invented sample data. Changes made during a
 * visit (new reports, "I'm affected too", admin and reviewer actions) are kept
 * in sessionStorage so they survive a reload and vanish when the tab closes.
 * Nothing is sent anywhere and nothing is written to a blockchain: every new
 * record gets `ledger: { source: "none" }`.
 */
import type { IsoDateTime } from "@/shared";
import type { BonaApi } from "../api";
import { ApiError } from "../errors";
import type {
  ActorRole,
  EvidenceItem,
  EvidencePurpose,
  EvidenceUpload,
  Issue,
  IssueSummary,
  SchoolProfile,
  Session,
  SessionRole,
  SubmissionReceipt,
  TimelineEvent,
  TimelineEventType,
} from "../types";
import { answerQuestion } from "./assistant";
import {
  buildSampleIssues,
  formatReference,
  SAMPLE_ACCOUNTS,
  SAMPLE_PASSWORD,
  SAMPLE_SCHOOLS,
} from "./seed";

const STORAGE_KEY = "bona.fixtures.v2";
const SESSION_KEY = "bona.fixtures.session.v1";
const OPEN_STATUSES = new Set(["reported", "under_assessment", "being_addressed"]);

const STOP_WORDS = new Set(
  "the and are has have with that this from they them there their were been for not but into near when since school".split(
    " ",
  ),
);

export function toSummary(issue: Issue): IssueSummary {
  return {
    id: issue.id,
    reference: issue.reference,
    schoolId: issue.schoolId,
    schoolName: issue.schoolName,
    schoolTown: issue.schoolTown,
    category: issue.category,
    title: issue.title,
    location: issue.location,
    status: issue.status,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    endorsements: issue.endorsements,
    endorsedByMe: issue.endorsedByMe,
    hasInterimProtection: issue.interimProtection !== null,
    evidenceCount: issue.evidence.length,
  };
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
    .map((word) => word.replace(/(ing|ed|s)$/, ""));
}

interface FixtureOptions {
  /** Artificial latency in ms, so loading states are visible in development. */
  latency?: number;
  /** Disable to keep state in memory only (used by unit tests). */
  persist?: boolean;
}

/** Timeline entries that are anchored as a salted commitment document. */
const DOCUMENT_TYPE: Partial<Record<TimelineEventType, string>> = {
  reported: "report",
  interim_protection: "interim_protection",
  repair_claimed: "repair_claim",
  verified: "review",
  disputed: "review",
};

export function createFixtureApi(options: FixtureOptions = {}): BonaApi {
  const { latency = 150, persist = true } = options;
  let issues: Issue[] | null = null;
  let session: Session | null | undefined;

  function currentSession(): Session | null {
    if (session !== undefined) return session;
    session = null;
    if (persist) {
      try {
        const stored = window.sessionStorage.getItem(SESSION_KEY);
        if (stored) session = JSON.parse(stored) as Session;
      } catch {
        // Storage unavailable: treated as signed out.
      }
    }
    return session;
  }

  function storeSession(next: Session | null): void {
    session = next;
    if (!persist) return;
    try {
      if (next) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Storage unavailable: the session lasts until the page reloads.
    }
  }

  /** The fixture enforces the same role rules the backend will, so the UI is built against them. */
  function requireRole(...roles: SessionRole[]): Session {
    const current = currentSession();
    if (!current) throw new ApiError("unauthenticated", "Sign in first.");
    if (!roles.includes(current.user.role)) {
      throw new ApiError("forbidden", "Your role cannot do this.");
    }
    return current;
  }

  function load(): Issue[] {
    if (issues) return issues;
    if (persist) {
      try {
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        if (stored) return (issues = JSON.parse(stored) as Issue[]);
      } catch {
        // Storage unavailable or unreadable: fall back to a fresh seed.
      }
    }
    return (issues = buildSampleIssues());
  }

  function save(): void {
    if (!persist || !issues) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
    } catch {
      // Storage unavailable: state simply lasts until the page reloads.
    }
  }

  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latency));
  const now = (): IsoDateTime => new Date().toISOString();

  function find(idOrReference: string): Issue | undefined {
    const key = idOrReference.trim().toUpperCase();
    return load().find(
      (issue) => issue.id === idOrReference || issue.reference.toUpperCase() === key,
    );
  }

  function mustFind(issueId: string): Issue {
    const issue = find(issueId);
    if (!issue) throw new Error(`Unknown issue: ${issueId}`);
    return issue;
  }

  function asAdminOf(issueId: string): Issue {
    const { user } = requireRole("school_admin");
    const issue = mustFind(issueId);
    if (issue.schoolId !== user.institutionId) {
      throw new ApiError("forbidden", "This issue belongs to another school.");
    }
    return issue;
  }

  function asReviewer(issueId: string): Issue {
    requireRole("independent_reviewer");
    return mustFind(issueId);
  }

  function addEvent(
    issue: Issue,
    type: TimelineEventType,
    actor: ActorRole,
    note: string,
  ): TimelineEvent {
    const event: TimelineEvent = {
      id: `${issue.id}-event-${issue.timeline.length + 1}`,
      type,
      note,
      actor,
      occurredAt: now(),
      ledger: { source: "none" },
    };
    issue.timeline.push(event);
    issue.updatedAt = event.occurredAt;
    return event;
  }

  function attach(
    issue: Issue,
    uploads: EvidenceUpload[],
    purpose: EvidencePurpose,
    addedBy: ActorRole,
  ): EvidenceItem[] {
    const added = uploads.map((upload, index): EvidenceItem => {
      const version = issue.evidence.length + index + 1;
      return {
        id: `${issue.id}-evidence-${version}`,
        version,
        purpose,
        addedBy,
        addedAt: now(),
        mediaType: upload.file.type || "application/octet-stream",
        sizeBytes: Math.max(upload.file.size, 1),
        digest: upload.digest,
        ledger: { source: "none" },
      };
    });
    issue.evidence.push(...added);
    issue.evidenceCount = issue.evidence.length;
    return added;
  }

  const copy = <T>(value: T): T => structuredClone(value);

  const api: BonaApi = {
    source: "fixture",
    async listDemoAccounts() {
      return SAMPLE_ACCOUNTS.map((account) => ({
        email: account.email,
        role: account.session.user.role,
        displayName: account.session.user.displayName,
      }));
    },

    signInAsDemo: (email) => api.signIn(email, SAMPLE_PASSWORD),

    async getSession() {
      await wait();
      return copy(currentSession());
    },

    async signIn(email, password) {
      await wait();
      const account = SAMPLE_ACCOUNTS.find(
        (candidate) => candidate.email === email.trim().toLowerCase(),
      );
      if (!account || password !== SAMPLE_PASSWORD) {
        throw new ApiError("unauthenticated", "Wrong email or password.");
      }
      storeSession(copy(account.session));
      return copy(account.session);
    },

    async signOut() {
      await wait();
      storeSession(null);
    },

    async searchSchools(query) {
      await wait();
      const needle = query.trim().toLowerCase();
      if (!needle) return copy(SAMPLE_SCHOOLS);
      return copy(
        SAMPLE_SCHOOLS.filter((school) =>
          `${school.name} ${school.town} ${school.district}`
            .toLowerCase()
            .includes(needle),
        ),
      );
    },

    async getSchool(schoolId) {
      await wait();
      const school = SAMPLE_SCHOOLS.find((s) => s.id === schoolId);
      if (!school) return null;
      const own = load().filter((issue) => issue.schoolId === schoolId);
      const profile: SchoolProfile = {
        ...school,
        stats: {
          open: own.filter((issue) => OPEN_STATUSES.has(issue.status)).length,
          awaitingReview: own.filter((issue) => issue.status === "repair_claimed").length,
          verified: own.filter((issue) => issue.status === "independently_verified")
            .length,
        },
        latestUpdates: own
          .flatMap((issue) =>
            issue.timeline.map((event) => ({
              issueId: issue.id,
              issueTitle: issue.title,
              event,
            })),
          )
          .sort((a, b) => b.event.occurredAt.localeCompare(a.event.occurredAt))
          .slice(0, 4),
      };
      return copy(profile);
    },

    async listIssues(filter = {}) {
      await wait();
      const needle = filter.query?.trim().toLowerCase();
      const result = load().filter(
        (issue) =>
          (!filter.status || issue.status === filter.status) &&
          (!filter.category || issue.category === filter.category) &&
          (!filter.schoolId || issue.schoolId === filter.schoolId) &&
          (!needle ||
            `${issue.title} ${issue.schoolName} ${issue.schoolTown} ${issue.reference} ${issue.location}`
              .toLowerCase()
              .includes(needle)),
      );
      result.sort((a, b) =>
        filter.sort === "most_affected"
          ? b.endorsements - a.endorsements
          : b.updatedAt.localeCompare(a.updatedAt),
      );
      return result.map(toSummary);
    },

    async getIssue(idOrReference) {
      await wait();
      const issue = find(idOrReference);
      return issue ? copy(issue) : null;
    },

    async findSimilarIssues({ schoolId, text }) {
      await wait();
      const wanted = new Set(words(text));
      if (wanted.size === 0) return [];
      return load()
        .filter(
          (issue) =>
            issue.schoolId === schoolId &&
            issue.status !== "independently_verified" &&
            issue.status !== "declined",
        )
        .map((issue) => ({
          issue,
          score: words(`${issue.title} ${issue.description} ${issue.location}`).filter(
            (word) => wanted.has(word),
          ).length,
        }))
        .filter((candidate) => candidate.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((candidate) => toSummary(candidate.issue));
    },

    async setEndorsement(issueId, affected) {
      // Record first, then simulate the round trip: a reload right after the tap
      // must still find the endorsement, as it would with the real backend.
      const issue = mustFind(issueId);
      if (issue.endorsedByMe !== affected) {
        issue.endorsedByMe = affected;
        issue.endorsements += affected ? 1 : -1;
        save();
      }
      await wait();
      return { endorsements: issue.endorsements, endorsedByMe: issue.endorsedByMe };
    },

    async submitReport(input) {
      await wait();
      const school = SAMPLE_SCHOOLS.find((s) => s.id === input.schoolId);
      if (!school) throw new Error(`Unknown school: ${input.schoolId}`);
      const all = load();
      const next =
        Math.max(...all.map((issue) => Number(issue.reference.slice(-6))), 0) + 1;
      const submittedAt = now();
      const issue: Issue = {
        id: `issue-${next}`,
        reference: formatReference(new Date().getUTCFullYear(), next),
        schoolId: school.id,
        schoolName: school.name,
        schoolTown: school.town,
        category: input.category,
        title: input.title.trim(),
        location: input.location.trim(),
        description: input.description.trim(),
        status: "reported",
        createdAt: submittedAt,
        updatedAt: submittedAt,
        endorsements: 1,
        endorsedByMe: true,
        hasInterimProtection: false,
        evidenceCount: 0,
        authority: {
          name: `${school.name} — school management team`,
          responsibility: "Day-to-day maintenance and making the area safe.",
          level: "school",
        },
        interimProtection: null,
        review: null,
        timeline: [],
        evidence: [],
      };
      addEvent(
        issue,
        "reported",
        "community",
        input.anonymous ? "Reported anonymously." : "Reported by a community member.",
      );
      attach(issue, input.evidence, "problem", "community");
      all.push(issue);
      save();
      return copy(receiptFor(issue));
    },

    async getSubmissionReceipt(reference) {
      await wait();
      const issue = find(reference);
      return issue ? copy(receiptFor(issue)) : null;
    },

    async addEvidence(issueId, uploads, purpose) {
      await wait();
      const issue = mustFind(issueId);
      const added = attach(issue, uploads, purpose, "community");
      if (added.length > 0) {
        addEvent(
          issue,
          "evidence_added",
          "community",
          added.length === 1
            ? "A community member added 1 file as evidence."
            : `A community member added ${added.length} files as evidence.`,
        );
      }
      save();
      return copy(added);
    },

    async listSchoolQueue(schoolId) {
      await wait();
      if (requireRole("school_admin").user.institutionId !== schoolId) {
        throw new ApiError("forbidden", "This is another school.");
      }
      return copy(
        load()
          .filter((issue) => issue.schoolId === schoolId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    },

    async declineIssue(issueId, reason) {
      await wait();
      const issue = asAdminOf(issueId);
      if (issue.status !== "reported" && issue.status !== "under_assessment") {
        throw new ApiError("invalid_transition", "This issue can no longer be declined.");
      }
      issue.status = "declined";
      addEvent(issue, "declined", "school_admin", reason);
      save();
      return copy(issue);
    },

    async startAssessment(issueId, note) {
      await wait();
      const issue = asAdminOf(issueId);
      issue.status = "under_assessment";
      addEvent(issue, "assessment_started", "school_admin", note);
      save();
      return copy(issue);
    },

    async recordProgress(issueId, note) {
      await wait();
      const issue = asAdminOf(issueId);
      issue.status = "being_addressed";
      issue.review = null;
      addEvent(issue, "progress_recorded", "school_admin", note);
      save();
      return copy(issue);
    },

    async recordInterimProtection(issueId, description) {
      await wait();
      const issue = asAdminOf(issueId);
      const event = addEvent(issue, "interim_protection", "school_admin", description);
      issue.interimProtection = { description, recordedAt: event.occurredAt };
      issue.hasInterimProtection = true;
      save();
      return copy(issue);
    },

    async submitRepairClaim(issueId, note, uploads) {
      await wait();
      const issue = asAdminOf(issueId);
      // A claim only moves the issue to `repair_claimed`. Only a reviewer can
      // move it to `independently_verified`.
      issue.status = "repair_claimed";
      attach(issue, uploads, "repair_claim", "school_admin");
      const event = addEvent(issue, "repair_claimed", "school_admin", note);
      issue.review = {
        state: "awaiting",
        reviewerLabel: "Independent reviewer (sample)",
        assignedAt: event.occurredAt,
        note: null,
      };
      save();
      return copy(issue);
    },

    async listAssignedReviews() {
      await wait();
      requireRole("independent_reviewer");
      return copy(
        load()
          .filter((issue) => issue.review !== null)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    },

    async verifyCompletion(issueId, note) {
      await wait();
      const issue = asReviewer(issueId);
      if (issue.status !== "repair_claimed") {
        throw new ApiError(
          "invalid_transition",
          "Only an issue with a repair claim can be verified.",
        );
      }
      issue.status = "independently_verified";
      const event = addEvent(issue, "verified", "reviewer", note);
      issue.review = {
        state: "verified",
        reviewerLabel: issue.review?.reviewerLabel ?? "Independent reviewer (sample)",
        assignedAt: issue.review?.assignedAt ?? event.occurredAt,
        note,
      };
      save();
      return copy(issue);
    },

    async disputeCompletion(issueId, reason) {
      await wait();
      const issue = asReviewer(issueId);
      if (issue.status !== "repair_claimed") {
        throw new ApiError(
          "invalid_transition",
          "Only an issue with a repair claim can be disputed.",
        );
      }
      issue.status = "disputed";
      const event = addEvent(issue, "disputed", "reviewer", reason);
      issue.review = {
        state: "disputed",
        reviewerLabel: issue.review?.reviewerLabel ?? "Independent reviewer (sample)",
        assignedAt: issue.review?.assignedAt ?? event.occurredAt,
        note: reason,
      };
      save();
      return copy(issue);
    },

    async probeVerification(issueId) {
      await wait();
      const { user } = requireRole(
        "school_admin",
        "independent_reviewer",
        "district_official",
      );
      mustFind(issueId);
      // Mirrors BonaRegistry: the role that claims a repair can never verify it.
      if (user.role === "independent_reviewer") {
        return { allowed: true, revert: null, chainRole: "REVIEWER_ROLE" };
      }
      if (user.role === "school_admin") {
        return {
          allowed: false,
          revert: "SchoolAdminCannotVerify",
          chainRole: "SCHOOL_ADMIN_ROLE",
        };
      }
      return { allowed: false, revert: "MissingReviewerRole", chainRole: "none" };
    },

    async getRecordProof(issueId, recordId) {
      await wait();
      const issue = find(issueId);
      const evidence = issue?.evidence.find((item) => item.id === recordId);
      const event = issue?.timeline.find((item) => item.id === recordId);
      const record = evidence ?? event;
      if (!issue || !record || record.ledger.source === "none") return null;
      // A sample has no transaction and no salt. Both say so in every field,
      // and BonaBlock Verify will refuse them rather than report a match.
      const receipt =
        record.ledger.source === "ledger"
          ? copy(record.ledger.receipt)
          : {
              sample: true,
              note: "Sample receipt from the BonaBlock preview. This is not an Avalanche transaction.",
              chainId: "bona:memory",
              contractAddress: null,
              txId: null,
              status: record.ledger.status,
              blockNumber: null,
              blockTimestamp: null,
            };
      const documentType = event ? DOCUMENT_TYPE[event.type] : undefined;
      if (!documentType) return { receipt };
      return {
        receipt,
        document: {
          sample: true,
          note: "Sample document from the BonaBlock preview. It was never committed to a ledger.",
          type: documentType,
          reportId: issue.id,
          salt: null,
        },
      };
    },

    async findEvidenceByDigest(digest) {
      await wait();
      return copy(
        load().flatMap((issue) =>
          issue.evidence
            .filter((item) => item.digest === digest)
            .map((evidence) => ({ issue: toSummary(issue), evidence })),
        ),
      );
    },

    async askAssistant(_history, question) {
      await wait();
      return answerQuestion(question, load().map(toSummary), SAMPLE_SCHOOLS);
    },
  };

  function receiptFor(issue: Issue): SubmissionReceipt {
    return {
      reference: issue.reference,
      issueId: issue.id,
      submittedAt: issue.createdAt,
      schoolName: issue.schoolName,
      title: issue.title,
      evidence: issue.evidence.filter((item) => item.purpose === "problem"),
      ledger: issue.timeline[0]?.ledger ?? { source: "none" },
    };
  }

  return api;
}
