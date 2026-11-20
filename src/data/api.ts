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
  ApproveWorkOrderInput,
  DemoAccount,
  AssistantMessage,
  DigestMatch,
  EvidenceItem,
  EvidencePurpose,
  EvidenceUpload,
  InvoiceDraft,
  Issue,
  IssueFilter,
  IssueSummary,
  MismatchExplanation,
  MoneyTrail,
  ReleaseProbe,
  RecordGoodsReceiptInput,
  RecordProof,
  School,
  SchoolProfile,
  Session,
  SubmissionReceipt,
  SubmitInvoiceInput,
  SubmitReportInput,
  VerificationProbe,
  WorkQueueItem,
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

  /*
   * Procurement trail. Every call needs a signed-in procurement role; each
   * write returns the trail as the caller may now see it. No real money
   * moves: the last step is a release instruction.
   */
  /** The cases that need the signed-in person now. Empty for roles with nothing to do. */
  listWorkQueue(): Promise<WorkQueueItem[]>;
  /**
   * The procurement trail of one case, filtered for the caller. Null when the
   * case has no work order, or none the caller may see.
   */
  getMoneyTrail(issueId: string): Promise<MoneyTrail | null>;
  /** Buyer. Creates the work order, or its next version. */
  approveWorkOrder(issueId: string, input: ApproveWorkOrderInput): Promise<MoneyTrail>;
  /** Supplier. Acknowledges the current order version. */
  acknowledgeOrder(issueId: string): Promise<MoneyTrail>;
  /** Supplier. Bona AI reads pasted invoice text into fields. Writes nothing. */
  draftInvoice(issueId: string, text: string): Promise<InvoiceDraft>;
  /** Supplier. The rule engine then matches it; the result is in the returned trail. */
  submitInvoice(issueId: string, input: SubmitInvoiceInput): Promise<MoneyTrail>;
  /** Receiving officer. */
  recordGoodsReceipt(
    issueId: string,
    input: RecordGoodsReceiptInput,
  ): Promise<MoneyTrail>;
  /** Why this match was blocked, in plain words. Explains the rule engine; decides nothing. */
  explainMismatch(issueId: string, matchId: string): Promise<MismatchExplanation>;
  /**
   * Payment approver. Rejects with an `ApiError` of code `conflict` while the
   * release gate is shut; `getMoneyTrail(issueId).gate.blockers` says why.
   */
  authoriseRelease(issueId: string): Promise<MoneyTrail>;
  /**
   * Payment approver. Asks the ledger whether it would accept a release for
   * this case right now, and with which refusal if not. Never writes.
   */
  probeRelease(issueId: string): Promise<ReleaseProbe>;

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
