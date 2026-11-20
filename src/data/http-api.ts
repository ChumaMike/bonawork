/**
 * LIVE implementation of `BonaApi`: a thin `fetch` wrapper over the routes in
 * docs/coordination/API_ROUTES.md. Runs in the browser with the session
 * cookie; unwraps the `{ data } | { error }` envelope and rejects with
 * `ApiError` (`src/data/errors.ts`).
 */
import type { Hex32 } from "@/shared";
import type { BonaApi } from "./api";
import { ApiError } from "./errors";
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

interface Options {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  json?: unknown;
  form?: FormData;
}

const KNOWN_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "invalid_transition",
] as const;

/** Build the `ApiError` for an envelope error; unknown codes keep the server's string. */
export function apiErrorFrom(
  code: string | undefined,
  message: string,
  status: number,
): ApiError {
  const known = (KNOWN_CODES as readonly string[]).includes(code ?? "")
    ? (code as ApiError["code"])
    : status === 401
      ? "unauthenticated"
      : status === 403
        ? "forbidden"
        : status === 404
          ? "not_found"
          : ((code ?? "internal") as ApiError["code"]);
  return new ApiError(known, message);
}

export function createHttpApi(baseUrl = ""): BonaApi {
  async function call<T>(path: string, options: Options = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? (options.json || options.form ? "POST" : "GET"),
      credentials: "include",
      headers: options.json ? { "content-type": "application/json" } : undefined,
      body: options.json ? JSON.stringify(options.json) : options.form,
    });
    let body: { data?: T; error?: { code: string; message: string } } = {};
    try {
      body = await response.json();
    } catch {
      // Not JSON: fall through to the status check.
    }
    if (!response.ok || body.error) {
      throw apiErrorFrom(
        body.error?.code,
        body.error?.message ?? `Request failed (${response.status}).`,
        response.status,
      );
    }
    return body.data as T;
  }

  /** `null` for a 404 instead of an exception. */
  async function optional<T>(path: string): Promise<T | null> {
    try {
      return await call<T>(path);
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_found") return null;
      throw error;
    }
  }

  function formWith(fields: Record<string, string>, uploads: EvidenceUpload[]): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    for (const upload of uploads) form.append("evidence", upload.file, upload.file.name);
    return form;
  }

  const query = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    const text = search.toString();
    return text ? `?${text}` : "";
  };

  const issuePath = (issueId: string, suffix: string) =>
    `/api/issues/${encodeURIComponent(issueId.trim())}${suffix}`;

  const api: BonaApi = {
    source: "live",

    /* Session */
    getSession: () => call<Session | null>("/api/auth/session"),
    signIn: (email, password) =>
      call<Session>("/api/auth/session", { json: { email, password } }),
    listDemoAccounts: async () => {
      try {
        const { accounts } = await call<{ accounts: DemoAccount[] }>(
          "/api/demo/accounts",
        );
        return accounts;
      } catch (error) {
        // Outside the demo the route does not exist; the cards simply do not appear.
        if (error instanceof ApiError && error.code === "not_found") return [];
        throw error;
      }
    },
    signInAsDemo: (email) => call<Session>("/api/demo/accounts", { json: { email } }),
    signOut: async () => {
      await call<null>("/api/auth/session", { method: "DELETE" });
    },

    /* Schools */
    searchSchools: (q) => call<School[]>(`/api/schools${query({ q })}`),
    getSchool: (schoolId) =>
      optional<SchoolProfile>(`/api/schools/${encodeURIComponent(schoolId)}`),

    /* Public issues */
    listIssues: (filter: IssueFilter = {}) =>
      call<IssueSummary[]>(
        `/api/issues${query({
          query: filter.query,
          status: filter.status,
          category: filter.category,
          schoolId: filter.schoolId,
          sort: filter.sort,
        })}`,
      ),
    getIssue: (idOrReference) => optional<Issue>(issuePath(idOrReference, "")),
    findSimilarIssues: (input) =>
      call<IssueSummary[]>("/api/issues/similar", { json: input }),
    setEndorsement: (issueId, affected) =>
      call<Pick<IssueSummary, "endorsements" | "endorsedByMe">>(
        issuePath(issueId, "/endorsement"),
        { method: "PUT", json: { affected } },
      ),

    /* Reporting */
    submitReport: (input: SubmitReportInput) =>
      call<SubmissionReceipt>("/api/reports", {
        form: formWith(
          {
            schoolId: input.schoolId,
            category: input.category,
            title: input.title,
            description: input.description,
            location: input.location,
            anonymous: String(input.anonymous),
          },
          input.evidence,
        ),
      }),
    getSubmissionReceipt: (reference) =>
      optional<SubmissionReceipt>(
        `/api/receipts/${encodeURIComponent(reference.trim())}`,
      ),
    addEvidence: (issueId, uploads, purpose: EvidencePurpose) =>
      call<EvidenceItem[]>(issuePath(issueId, "/evidence"), {
        form: formWith({ purpose }, uploads),
      }),

    /* School administrator — scoped by the signed-in administrator's institution. */
    listSchoolQueue: () => call<Issue[]>("/api/admin/queue"),
    declineIssue: (issueId, reason) =>
      call<Issue>(issuePath(issueId, "/decline"), { json: { reason } }),
    startAssessment: (issueId, note) =>
      call<Issue>(issuePath(issueId, "/assessment"), { json: { note } }),
    recordProgress: (issueId, note) =>
      call<Issue>(issuePath(issueId, "/progress"), { json: { note } }),
    recordInterimProtection: (issueId, description) =>
      call<Issue>(issuePath(issueId, "/protection"), { json: { description } }),
    submitRepairClaim: (issueId, note, uploads) =>
      call<Issue>(issuePath(issueId, "/repair-claim"), {
        form: formWith({ note }, uploads),
      }),

    /* Independent reviewer */
    listAssignedReviews: () => call<Issue[]>("/api/reviewer/queue"),
    verifyCompletion: (issueId, note, uploads = []) =>
      call<Issue>(issuePath(issueId, "/verification"), {
        form: formWith({ outcome: "verified", note }, uploads),
      }),
    disputeCompletion: (issueId, reason, uploads = []) =>
      call<Issue>(issuePath(issueId, "/verification"), {
        form: formWith({ outcome: "disputed", note: reason }, uploads),
      }),
    probeVerification: (issueId) =>
      call<VerificationProbe>(issuePath(issueId, "/verification/probe"), {
        method: "POST",
      }),

    /* Evidence files (private; same-origin session cookie) */
    evidenceFileUrl: (evidenceId) =>
      `/api/evidence/${encodeURIComponent(evidenceId)}/file`,

    /* Verification */
    getRecordProof: (issueId, recordId) =>
      optional<RecordProof>(
        issuePath(issueId, `/documents/${encodeURIComponent(recordId)}`),
      ),
    findEvidenceByDigest: (digest: Hex32) =>
      call<DigestMatch[]>(`/api/verify/evidence${query({ digest })}`),

    /* Bona AI */
    askAssistant: (history: AssistantMessage[], question) =>
      call<AssistantMessage>("/api/assistant", { json: { history, question } }),
  };
  return api;
}

export { ApiError };
