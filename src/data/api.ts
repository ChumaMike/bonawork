/**
 * The frontend's only door to data. Screens call `getApi()` and nothing else.
 *
 * Today it returns the fixture implementation. To connect the real backend,
 * write an implementation of `BonaApi` that calls the HTTP API and return it
 * from `getApi()` — no screen needs to change.
 */
import type { Hex32 } from "@/shared";
import { createFixtureApi } from "./fixtures/fixture-api";
import { createHttpApi } from "./http-api";
import type {
  DemoAccount,
  AssistantMessage,
  DigestMatch,
  EvidenceItem,
  EvidencePurpose,
  EvidenceUpload,
  Issue,
  IssueFilter,
  IssueSummary,
  RecordProof,
  School,
  SchoolProfile,
  Session,
  SubmissionReceipt,
  SubmitReportInput,
  VerificationProbe,
} from "./types";

export interface BonaApi {
  /** `fixture` means every record is development sample data. */
  readonly source: "fixture" | "live";

  /** Demo mode only: accounts the sign-in screen offers for one-tap sign-in. Empty otherwise. */
  listDemoAccounts(): Promise<DemoAccount[]>;
  /** Demo mode only: sign in as one of `listDemoAccounts()` without a password. */
  signInAsDemo(email: string): Promise<Session>;

  /* Session */
  getSession(): Promise<Session | null>;
  /** Rejects with an `ApiError` of code `unauthenticated` on bad credentials. */
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;

  /* Schools */
  searchSchools(query: string): Promise<School[]>;
  getSchool(schoolId: string): Promise<SchoolProfile | null>;

  /* Public issues */
  listIssues(filter?: IssueFilter): Promise<IssueSummary[]>;
  /** Accepts an issue id or a tracking reference. */
  getIssue(idOrReference: string): Promise<Issue | null>;
  findSimilarIssues(input: { schoolId: string; text: string }): Promise<IssueSummary[]>;
  setEndorsement(
    issueId: string,
    affected: boolean,
  ): Promise<Pick<IssueSummary, "endorsements" | "endorsedByMe">>;

  /* Reporting */
  submitReport(input: SubmitReportInput): Promise<SubmissionReceipt>;
  getSubmissionReceipt(reference: string): Promise<SubmissionReceipt | null>;
  addEvidence(
    issueId: string,
    uploads: EvidenceUpload[],
    purpose: EvidencePurpose,
  ): Promise<EvidenceItem[]>;

  /* School administrator — every call needs a signed-in school_admin of that school */
  listSchoolQueue(schoolId: string): Promise<Issue[]>;
  declineIssue(issueId: string, reason: string): Promise<Issue>;
  startAssessment(issueId: string, note: string): Promise<Issue>;
  recordProgress(issueId: string, note: string): Promise<Issue>;
  recordInterimProtection(issueId: string, description: string): Promise<Issue>;
  submitRepairClaim(
    issueId: string,
    note: string,
    uploads: EvidenceUpload[],
  ): Promise<Issue>;

  /* Independent reviewer — every call needs a signed-in independent_reviewer */
  listAssignedReviews(): Promise<Issue[]>;
  /** `uploads` are the reviewer's own inspection photos, attached to the decision. */
  verifyCompletion(
    issueId: string,
    note: string,
    uploads?: EvidenceUpload[],
  ): Promise<Issue>;
  disputeCompletion(
    issueId: string,
    reason: string,
    uploads?: EvidenceUpload[],
  ): Promise<Issue>;
  /** Asks whether the signed-in user could verify this repair. Any staff role may ask. */
  probeVerification(issueId: string): Promise<VerificationProbe>;

  /* Verification */
  /**
   * The receipt, and the commitment document where there is one, for an
   * evidence item or a timeline event of this issue. Null when that record
   * anchors nothing. Fixtures return labelled samples.
   */
  getRecordProof(issueId: string, recordId: string): Promise<RecordProof | null>;
  findEvidenceByDigest(digest: Hex32): Promise<DigestMatch[]>;

  /**
   * Address of a private evidence file, for signed-in staff on that case.
   * Absent where files cannot be served, as in the fixtures.
   */
  evidenceFileUrl?(evidenceId: string): string;

  /* Bona AI */
  askAssistant(history: AssistantMessage[], question: string): Promise<AssistantMessage>;
}

export { ApiError } from "./errors";

let instance: BonaApi | null = null;

/** True while the app runs on development sample data (`NEXT_PUBLIC_API_SOURCE` is not `live`). */
export const USING_FIXTURES = process.env.NEXT_PUBLIC_API_SOURCE !== "live";

export function getApi(): BonaApi {
  instance ??= USING_FIXTURES ? createFixtureApi() : createHttpApi();
  return instance;
}
