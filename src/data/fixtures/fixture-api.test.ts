import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/shared/commitment";
import { ISSUE_STATUSES, type EvidenceUpload } from "../types";
import { createFixtureApi } from "./fixture-api";
import { buildSampleIssues, SAMPLE_PASSWORD } from "./seed";

const ADMIN = "admin@khanyisa.demo";
const OTHER_ADMIN = "admin@thuto-lesedi.demo";
const REVIEWER = "reviewer@district.demo";

const newApi = () => createFixtureApi({ latency: 0, persist: false });

/** A fresh API signed in as the given sample account. */
async function apiAs(email: string) {
  const api = newApi();
  await api.signIn(email, SAMPLE_PASSWORD);
  return api;
}

async function upload(text: string): Promise<EvidenceUpload> {
  const bytes = new TextEncoder().encode(text);
  return {
    file: new File([bytes], "photo.jpg", { type: "image/jpeg" }),
    digest: await sha256Hex(bytes),
  };
}

describe("fixture data", () => {
  it("never contains a real ledger receipt", () => {
    for (const issue of buildSampleIssues()) {
      const records = [...issue.timeline, ...issue.evidence].map((item) => item.ledger);
      expect(records.every((record) => record.source !== "ledger")).toBe(true);
    }
  });

  it("covers every public status", async () => {
    const statuses = new Set((await newApi().listIssues()).map((issue) => issue.status));
    expect([...statuses].sort()).toEqual([...ISSUE_STATUSES].sort());
  });
});

describe("sign-in", () => {
  it("starts signed out and rejects wrong details", async () => {
    const api = newApi();
    expect(await api.getSession()).toBeNull();
    await expect(api.signIn(ADMIN, "wrong")).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(await api.getSession()).toBeNull();
  });

  it("returns the role and school of the signed-in user, and signs out", async () => {
    const api = await apiAs(ADMIN);
    expect((await api.getSession())?.user).toMatchObject({
      role: "school_admin",
      institutionId: "khanyisa-primary",
    });
    await api.signOut();
    expect(await api.getSession()).toBeNull();
  });
});

describe("a repair claim is not verification", () => {
  it("moves the issue to repair_claimed and waits for a reviewer", async () => {
    const api = await apiAs(ADMIN);
    const issue = await api.submitRepairClaim("issue-136", "Desks delivered.", []);
    expect(issue.status).toBe("repair_claimed");
    expect(issue.review?.state).toBe("awaiting");
    expect(issue.timeline.at(-1)?.type).toBe("repair_claimed");
  });

  it("refuses a school administrator who tries to verify their own claim", async () => {
    const api = await apiAs(ADMIN);
    await api.submitRepairClaim("issue-136", "Desks delivered.", []);
    await expect(api.verifyCompletion("issue-136", "Done.")).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(await api.probeVerification("issue-136")).toEqual({
      allowed: false,
      revert: "SchoolAdminCannotVerify",
      chainRole: "SCHOOL_ADMIN_ROLE",
    });
    expect((await api.getIssue("issue-136"))?.status).toBe("repair_claimed");
  });

  it("only a reviewer decision makes it independently verified", async () => {
    const api = await apiAs(ADMIN);
    await api.submitRepairClaim("issue-136", "Desks delivered.", []);
    await api.signIn(REVIEWER, SAMPLE_PASSWORD);
    expect((await api.probeVerification("issue-136")).allowed).toBe(true);
    const issue = await api.verifyCompletion("issue-136", "Counted 52 desks.");
    expect(issue.status).toBe("independently_verified");
    expect(issue.review).toMatchObject({ state: "verified", note: "Counted 52 desks." });
  });

  it("refuses to verify or dispute an issue that has no repair claim", async () => {
    const api = await apiAs(REVIEWER);
    await expect(api.verifyCompletion("issue-136", "Looks fine.")).rejects.toMatchObject({
      code: "invalid_transition",
    });
    await expect(api.disputeCompletion("issue-136", "Not fixed.")).rejects.toMatchObject({
      code: "invalid_transition",
    });
    expect((await api.getIssue("issue-136"))?.status).toBe("reported");
  });

  it("records a dispute with the reviewer's reason", async () => {
    const api = await apiAs(REVIEWER);
    const issue = await api.disputeCompletion("issue-124", "One pane is still broken.");
    expect(issue.status).toBe("disputed");
    expect(issue.review).toMatchObject({ state: "disputed" });
  });
});

describe("school administrator rules", () => {
  it("needs a signed-in administrator of that school", async () => {
    await expect(newApi().listSchoolQueue("khanyisa-primary")).rejects.toMatchObject({
      code: "unauthenticated",
    });
    const other = await apiAs(OTHER_ADMIN);
    await expect(other.listSchoolQueue("khanyisa-primary")).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(other.recordProgress("issue-136", "Ordered.")).rejects.toMatchObject({
      code: "forbidden",
    });
    const reviewer = await apiAs(REVIEWER);
    await expect(
      reviewer.submitRepairClaim("issue-136", "Done.", []),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("declines a report with a public reason, and only before work starts", async () => {
    const api = await apiAs(ADMIN);
    const issue = await api.declineIssue("issue-136", "Desks arrive next term.");
    expect(issue.status).toBe("declined");
    expect(issue.timeline.at(-1)).toMatchObject({
      type: "declined",
      note: "Desks arrive next term.",
    });
    await expect(api.declineIssue("issue-102", "No.")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });
});

describe("community participation", () => {
  it("counts each visitor once for I'm affected too", async () => {
    const api = newApi();
    const before = (await api.getIssue("issue-118"))!.endorsements;
    await api.setEndorsement("issue-118", true);
    const again = await api.setEndorsement("issue-118", true);
    expect(again).toEqual({ endorsements: before + 1, endorsedByMe: true });
    const removed = await api.setEndorsement("issue-118", false);
    expect(removed).toEqual({ endorsements: before, endorsedByMe: false });
  });

  it("suggests similar issues at the same school only", async () => {
    const api = newApi();
    const text = "The toilets are blocked";
    const same = await api.findSimilarIssues({ schoolId: "thuto-lesedi-primary", text });
    expect(same.map((issue) => issue.id)).toContain("issue-118");
    const other = await api.findSimilarIssues({ schoolId: "khanyisa-primary", text });
    expect(other).toEqual([]);
  });
});

describe("reporting", () => {
  it("creates a public report with a reference and no ledger record", async () => {
    const api = newApi();
    const evidence = await upload("photo-bytes");
    const receipt = await api.submitReport({
      schoolId: "khanyisa-primary",
      category: "water",
      title: "The tap outside Grade 2 is leaking",
      description: "Water runs all day.",
      location: "Outside Grade 2",
      anonymous: true,
      evidence: [evidence],
    });

    expect(receipt.reference).toMatch(/^BB-\d{4}-\d{6}$/);
    expect(receipt.ledger).toEqual({ source: "none" });
    expect(receipt.evidence[0].digest).toBe(evidence.digest);

    const issue = await api.getIssue(receipt.reference);
    expect(issue).toMatchObject({
      status: "reported",
      endorsements: 1,
      endorsedByMe: true,
    });

    const matches = await api.findEvidenceByDigest(evidence.digest);
    expect(matches.map((match) => match.issue.id)).toEqual([receipt.issueId]);
    expect(await api.findEvidenceByDigest((await upload("edited")).digest)).toEqual([]);
  });
});

describe("receipts for BonaBlock Verify", () => {
  it("gives a labelled sample, never transaction data, for a sample record", async () => {
    const api = newApi();
    const issue = (await api.getIssue("issue-97"))!;
    const evidence = await api.getRecordProof(issue.id, issue.evidence[0]!.id);
    expect(evidence?.receipt).toMatchObject({
      sample: true,
      chainId: "bona:memory",
      txId: null,
    });
    // An evidence file is its own input: there is no document to copy.
    expect(evidence?.document).toBeUndefined();

    const reported = issue.timeline.find((event) => event.type === "reported")!;
    const proof = await api.getRecordProof(issue.id, reported.id);
    expect(proof?.receipt).toMatchObject({ sample: true });
    expect(proof?.document).toMatchObject({ sample: true, type: "report", salt: null });
  });

  it("has no receipt for a record that was never written, or an unknown one", async () => {
    const api = newApi();
    const issue = (await api.getIssue("issue-118"))!;
    expect(await api.getRecordProof(issue.id, issue.timeline[0]!.id)).toBeNull();
    expect(await api.getRecordProof("issue-97", "nope")).toBeNull();
  });
});
