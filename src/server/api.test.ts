/**
 * Acceptance tests for the HTTP API (docs/demo/TEST_SCENARIOS.md), calling the
 * exported route handlers with `Request` objects against an in-memory PGlite
 * database seeded through an instrumented memory ledger.
 */
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "@/shared";
import type { Issue, IssueSummary, SubmissionReceipt } from "@/data/types";
import * as adminQueue from "@/app/api/admin/queue/route";
import * as assistant from "@/app/api/assistant/route";
import * as session from "@/app/api/auth/session/route";
import * as demoAccounts from "@/app/api/demo/accounts/route";
import * as evidenceFile from "@/app/api/evidence/[id]/file/route";
import * as health from "@/app/api/health/route";
import * as issue from "@/app/api/issues/[id]/route";
import * as assessment from "@/app/api/issues/[id]/assessment/route";
import * as decline from "@/app/api/issues/[id]/decline/route";
import * as documents from "@/app/api/issues/[id]/documents/[recordId]/route";
import * as endorsement from "@/app/api/issues/[id]/endorsement/route";
import * as evidence from "@/app/api/issues/[id]/evidence/route";
import * as progress from "@/app/api/issues/[id]/progress/route";
import * as repairClaim from "@/app/api/issues/[id]/repair-claim/route";
import * as verification from "@/app/api/issues/[id]/verification/route";
import * as probe from "@/app/api/issues/[id]/verification/probe/route";
import * as issues from "@/app/api/issues/route";
import * as similar from "@/app/api/issues/similar/route";
import * as ledgerInfo from "@/app/api/ledger/route";
import * as retry from "@/app/api/ledger/retry/route";
import * as receipts from "@/app/api/receipts/[reference]/route";
import * as reports from "@/app/api/reports/route";
import * as reviewerQueue from "@/app/api/reviewer/queue/route";
import * as schools from "@/app/api/schools/route";
import * as school from "@/app/api/schools/[schoolId]/route";
import * as verify from "@/app/api/verify/evidence/route";
import { schema } from "./db";
import { processLedgerJobs } from "./reports/anchor";
import { DEMO_CASE_REFERENCE, resetDatabase } from "./seed";
import {
  HEX32,
  UUID,
  body,
  createTestWorld,
  formRequest,
  jsonRequest,
  notAnImage,
  params,
  png,
  reportByReference,
  type TestWorld,
} from "./test/harness";

const DEMO_SCHOOL = "thandolwethu-primary";
const ADMIN = "admin@thandolwethu.demo";
const REVIEWER = "reviewer@vaalridge.demo";
const LINDIWE = "lindiwe@community.demo";
const PALESA = "palesa@community.demo";
const ZANELE = "zanele@community.demo";
const DISTRICT = "district@vaalridge.demo";

let world: TestWorld;
const getIssue = (id: string, headers = {}) =>
  issue
    .GET(jsonRequest("GET", `/api/issues/${id}`, undefined, headers), params({ id }))
    .then((r) => body<Issue>(r));

async function openReport(
  reporter: string,
  fields: Partial<Record<string, string>> = {},
  files: File[] = [png(`report-${Math.random()}`)],
) {
  const response = await reports.POST(
    formRequest(
      "POST",
      "/api/reports",
      {
        schoolId: DEMO_SCHOOL,
        category: "sanitation",
        title: "Boys' toilets blocked near the hall",
        description: "Three of the four boys toilets are blocked and the floor is wet.",
        location: "Boys' block near the hall",
        anonymous: "false",
        ...fields,
      },
      files,
      world.as(reporter),
    ),
  );
  return { response, receipt: await body<SubmissionReceipt>(response.clone()) };
}

beforeAll(async () => {
  world = await createTestWorld();
}, 60_000);

afterAll(async () => {
  await world.close();
});

describe("seed", () => {
  it("creates the demo case BB-2026-000042 in repair_claimed with 7 endorsements and memory receipts", async () => {
    const demo = await getIssue(DEMO_CASE_REFERENCE);
    expect(demo.status).toBe("repair_claimed");
    expect(demo.endorsements).toBe(7);
    expect(demo.schoolName).toBe("Thandolwethu Primary School");
    expect(demo.evidence).toHaveLength(5);
    expect(demo.review).toMatchObject({ state: "awaiting" });
    expect(demo.timeline.map((e) => e.type)).toEqual([
      "reported",
      "evidence_added",
      "evidence_added",
      "assessment_started",
      "evidence_added",
      "progress_recorded",
      "evidence_added",
      "evidence_added",
      "repair_claimed",
    ]);
    for (const event of demo.timeline.filter((e) => e.type !== "progress_recorded")) {
      expect(event.ledger).toEqual({ source: "simulated", status: "confirmed" });
    }
    expect(demo.timeline.find((e) => e.type === "progress_recorded")?.ledger).toEqual({
      source: "none",
    });
  });

  it("serves schools by slug and by id, and the health/ledger endpoints describe the setup", async () => {
    const list = await body<Array<{ id: string; name: string }>>(
      await schools.GET(jsonRequest("GET", "/api/schools?q=thando")),
    );
    expect(list).toHaveLength(1);
    const bySlug = await body<{ id: string; stats: unknown }>(
      await school.GET(
        jsonRequest("GET", `/api/schools/${DEMO_SCHOOL}`),
        params({ schoolId: DEMO_SCHOOL }),
      ),
    );
    expect(bySlug.id).toBe(list[0].id);
    expect(bySlug.stats).toEqual({ open: 2, awaitingReview: 1, verified: 1 });
    const byId = await school.GET(
      jsonRequest("GET", `/api/schools/${list[0].id}`),
      params({ schoolId: list[0].id }),
    );
    expect(byId.status).toBe(200);
    expect(
      await (await health.GET(jsonRequest("GET", "/api/health"))).json(),
    ).toMatchObject({
      status: "ok",
      service: "bona",
      ledger: "memory",
      database: "pglite",
    });
    expect(
      await body(await ledgerInfo.GET(jsonRequest("GET", "/api/ledger"))),
    ).toMatchObject({
      chainId: "bona:memory",
      live: false,
      explorerTxUrlBase: null,
    });
  });
});

describe("auth", () => {
  it("signs in with the demo password, reads the session and signs out", async () => {
    const bad = await session.POST(
      jsonRequest("POST", "/api/auth/session", { email: ADMIN, password: "wrong" }),
    );
    expect(bad.status).toBe(401);
    const good = await session.POST(
      jsonRequest("POST", "/api/auth/session", {
        email: ADMIN,
        password: "bona-demo-2026",
      }),
    );
    expect(good.status).toBe(200);
    const cookie = good.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^bona_session=.+HttpOnly/);
    const me = await body<{ user: { role: string }; permissions: string[] }>(
      await session.GET(jsonRequest("GET", "/api/auth/session", undefined, { cookie })),
    );
    expect(me.user.role).toBe("school_admin");
    expect(me.permissions).toContain("repair:claim");
    expect(me.permissions).not.toContain("repair:verify");
    expect(
      await body(await session.GET(jsonRequest("GET", "/api/auth/session"))),
    ).toBeNull();
    const out = await session.DELETE(jsonRequest("DELETE", "/api/auth/session"));
    expect(out.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});

describe("TS-01 valid reporting", () => {
  it("creates the case, its events and evidence with receipts, within the request", async () => {
    const file = png("e1-cubicles");
    const { response, receipt } = await openReport(LINDIWE, {}, [file]);
    expect(response.status).toBe(201);
    expect(receipt.reference).toMatch(/^BB-\d{4}-\d{6}$/);
    expect(receipt.issueId).toMatch(UUID);
    expect(receipt.ledger).toEqual({ source: "simulated", status: "confirmed" });
    expect(receipt.evidence).toHaveLength(1);
    expect(receipt.evidence[0].digest).toBe(
      await sha256Hex(new Uint8Array(await file.arrayBuffer())),
    );

    const created = await getIssue(receipt.issueId);
    expect(created.status).toBe("reported");
    expect(created.timeline.map((e) => e.type)).toEqual(["reported", "evidence_added"]);
    expect(created.timeline[0].note).toBe("Reported by Reporter R-7F3A.");
    const events = await world.ctx.db
      .select()
      .from(schema.caseEvents)
      .where(eq(schema.caseEvents.reportId, receipt.issueId))
      .orderBy(asc(schema.caseEvents.sequence));
    expect(events.map((e) => e.sequence)).toEqual([0, 1]);
    expect(events[0].receipt?.event).toBe("ReportRegistered");
    expect(events[1].receipt?.event).toBe("EvidenceRegistered");

    const byReference = await receipts.GET(
      jsonRequest("GET", `/api/receipts/${receipt.reference}`),
      params({ reference: receipt.reference }),
    );
    expect((await body<SubmissionReceipt>(byReference)).issueId).toBe(receipt.issueId);

    const feed = await body<IssueSummary[]>(
      await issues.GET(
        jsonRequest("GET", `/api/issues?schoolId=${DEMO_SCHOOL}&sort=recent`),
      ),
    );
    expect(feed[0].id).toBe(receipt.issueId);
  });

  it("stores anonymous reports without the reporter", async () => {
    const { receipt } = await openReport(PALESA, {
      anonymous: "true",
      title: "Anonymous test report",
    });
    const row = await reportByReference(world, receipt.reference);
    expect(row.reporterId).toBeNull();
    const [event] = await world.ctx.db
      .select()
      .from(schema.caseEvents)
      .where(eq(schema.caseEvents.reportId, receipt.issueId));
    expect(event.actorId).toBeNull();
    expect(event.note).toBe("Reported anonymously.");
  });
});

describe("TS-02 duplicate reporting", () => {
  it("suggests the existing case for the same facility and never a verified one", async () => {
    const found = await body<IssueSummary[]>(
      await similar.POST(
        jsonRequest("POST", "/api/issues/similar", {
          schoolId: DEMO_SCHOOL,
          text: "Girls toilets broken, door missing.",
        }),
      ),
    );
    expect(found[0]?.reference).toBe(DEMO_CASE_REFERENCE);
    const verified = await body<IssueSummary[]>(
      await similar.POST(
        jsonRequest("POST", "/api/issues/similar", {
          schoolId: DEMO_SCHOOL,
          text: "Broken window panes in Grade 6B again",
        }),
      ),
    );
    expect(verified.map((i) => i.reference)).not.toContain("BB-2026-000038");
  });
});

describe("TS-03 new evidence on an existing case", () => {
  it("adds evidence once, rejects the same bytes again and leaves earlier evidence unchanged", async () => {
    const before = await getIssue(DEMO_CASE_REFERENCE);
    const file = png("e3-again");
    const first = await evidence.POST(
      formRequest(
        "POST",
        "/api/issues/x/evidence",
        { purpose: "problem" },
        [file],
        world.as(PALESA),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(first.status).toBe(201);
    const again = await evidence.POST(
      formRequest(
        "POST",
        "/api/issues/x/evidence",
        { purpose: "problem" },
        [file],
        world.as(PALESA),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("conflict");
    const after = await getIssue(DEMO_CASE_REFERENCE);
    expect(after.status).toBe(before.status);
    expect(after.evidence.slice(0, before.evidence.length)).toEqual(before.evidence);
    expect(after.evidence).toHaveLength(before.evidence.length + 1);
    expect(after.timeline.slice(0, before.timeline.length)).toEqual(before.timeline);
    expect(after.timeline.at(-1)).toMatchObject({
      type: "evidence_added",
      actor: "community",
    });
  });

  it("rejects a non-image renamed as an image and rejects uploads from the wrong role", async () => {
    const renamed = await evidence.POST(
      formRequest(
        "POST",
        "/api/issues/x/evidence",
        { purpose: "problem" },
        [notAnImage()],
        world.as(PALESA),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(renamed.status).toBe(422);
    const wrongRole = await evidence.POST(
      formRequest(
        "POST",
        "/api/issues/x/evidence",
        { purpose: "problem" },
        [png("admin-try")],
        world.as(ADMIN),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(wrongRole.status).toBe(403);
  });
});

describe("TS-04 endorsement", () => {
  const put = (who: string, affected = true) =>
    endorsement.PUT(
      jsonRequest("PUT", "/api/issues/x/endorsement", { affected }, world.as(who)),
      params({ id: DEMO_CASE_REFERENCE }),
    );

  it("counts once per account, never the reporter's own, never staff", async () => {
    expect(await body(await put(ZANELE))).toEqual({
      endorsements: 8,
      endorsedByMe: true,
    });
    expect(await body(await put(ZANELE))).toEqual({
      endorsements: 8,
      endorsedByMe: true,
    });
    expect((await getIssue(DEMO_CASE_REFERENCE, world.as(ZANELE))).endorsedByMe).toBe(
      true,
    );
    expect((await getIssue(DEMO_CASE_REFERENCE)).endorsedByMe).toBe(false);
    expect((await put(LINDIWE)).status).toBe(403);
    expect((await put(ADMIN)).status).toBe(403);
    expect((await put(REVIEWER)).status).toBe(403);
    expect(
      (
        await endorsement.PUT(
          jsonRequest("PUT", "/api/issues/x/endorsement", { affected: true }),
          params({ id: DEMO_CASE_REFERENCE }),
        )
      ).status,
    ).toBe(401);
    expect(await body(await put(ZANELE, false))).toEqual({
      endorsements: 7,
      endorsedByMe: false,
    });
    expect((await getIssue(DEMO_CASE_REFERENCE)).status).toBe("repair_claimed");
  }, 60_000);
});

describe("TS-05 unauthorised closure", () => {
  it("refuses the school administrator at the API and shows the contract's own refusal", async () => {
    const before = await getIssue(DEMO_CASE_REFERENCE);
    const attempt = await verification.POST(
      formRequest(
        "POST",
        "/api/issues/x/verification",
        { outcome: "verified", note: "Looks fine" },
        [],
        world.as(ADMIN),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(attempt.status).toBe(403);
    const after = await getIssue(DEMO_CASE_REFERENCE);
    expect(after.status).toBe("repair_claimed");
    expect(after.timeline).toHaveLength(before.timeline.length);

    const asAdmin = await body(
      await probe.POST(
        jsonRequest(
          "POST",
          "/api/issues/x/verification/probe",
          undefined,
          world.as(ADMIN),
        ),
        params({ id: DEMO_CASE_REFERENCE }),
      ),
    );
    expect(asAdmin).toEqual({
      allowed: false,
      revert: "SchoolAdminCannotVerify",
      chainRole: "school_admin",
    });
    const asReviewer = await body(
      await probe.POST(
        jsonRequest(
          "POST",
          "/api/issues/x/verification/probe",
          undefined,
          world.as(REVIEWER),
        ),
        params({ id: DEMO_CASE_REFERENCE }),
      ),
    );
    expect(asReviewer).toEqual({ allowed: true, revert: null, chainRole: "reviewer" });
    const asDistrict = await body(
      await probe.POST(
        jsonRequest(
          "POST",
          "/api/issues/x/verification/probe",
          undefined,
          world.as(DISTRICT),
        ),
        params({ id: DEMO_CASE_REFERENCE }),
      ),
    );
    expect(asDistrict).toMatchObject({
      allowed: false,
      revert: "Unauthorized",
      chainRole: "none",
    });
    const asReporter = await probe.POST(
      jsonRequest(
        "POST",
        "/api/issues/x/verification/probe",
        undefined,
        world.as(LINDIWE),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(asReporter.status).toBe(403);
  });

  it("refuses to verify a case without a repair claim and refuses reporters", async () => {
    const inProgress = await verification.POST(
      formRequest(
        "POST",
        "/api/issues/x/verification",
        { outcome: "verified", note: "no" },
        [],
        world.as(REVIEWER),
      ),
      params({ id: "BB-2026-000118" }),
    );
    expect(inProgress.status).toBe(409);
    expect((await inProgress.json()).error.code).toBe("invalid_transition");
    const reporter = await verification.POST(
      formRequest(
        "POST",
        "/api/issues/x/verification",
        { outcome: "verified", note: "no" },
        [],
        world.as(LINDIWE),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(reporter.status).toBe(403);
  });
});

describe("TS-06 reviewer verification", () => {
  it("moves a claimed case to independently_verified and freezes it", async () => {
    const { receipt } = await openReport(LINDIWE, {
      title: "Fresh case for verification",
    });
    const id = receipt.issueId;
    const assessed = await assessment.POST(
      jsonRequest(
        "POST",
        "/api/issues/x/assessment",
        { note: "Inspected." },
        world.as(ADMIN),
      ),
      params({ id }),
    );
    expect(assessed.status).toBe(200);
    expect((await body<Issue>(assessed)).status).toBe("under_assessment");
    const claimed = await repairClaim.POST(
      formRequest(
        "POST",
        "/api/issues/x/repair-claim",
        { note: "Fixed it." },
        [png("claim-6")],
        world.as(ADMIN),
      ),
      params({ id }),
    );
    expect((await body<Issue>(claimed)).status).toBe("repair_claimed");
    const queue = await body<Issue[]>(
      await reviewerQueue.GET(
        jsonRequest("GET", "/api/reviewer/queue", undefined, world.as(REVIEWER)),
      ),
    );
    expect(queue.map((i) => i.id)).toContain(id);

    const verified = await verification.POST(
      formRequest(
        "POST",
        "/api/issues/x/verification",
        { outcome: "verified", note: "Confirmed on site." },
        [png("review-6")],
        world.as(REVIEWER),
      ),
      params({ id }),
    );
    expect(verified.status).toBe(200);
    const result = await body<Issue>(verified);
    expect(result.status).toBe("independently_verified");
    expect(result.review).toMatchObject({
      state: "verified",
      note: "Confirmed on site.",
    });
    expect(result.timeline.at(-1)).toMatchObject({
      type: "verified",
      actor: "reviewer",
      ledger: { source: "simulated" },
    });

    const second = await verification.POST(
      formRequest(
        "POST",
        "/api/issues/x/verification",
        { outcome: "disputed", note: "Changed my mind" },
        [],
        world.as(REVIEWER),
      ),
      params({ id }),
    );
    expect(second.status).toBe(409);
    const more = await progress.POST(
      jsonRequest(
        "POST",
        "/api/issues/x/progress",
        { note: "more work" },
        world.as(ADMIN),
      ),
      params({ id }),
    );
    expect(more.status).toBe(409);
    const evidenceAfter = await evidence.POST(
      formRequest(
        "POST",
        "/api/issues/x/evidence",
        { purpose: "problem" },
        [png("late")],
        world.as(LINDIWE),
      ),
      params({ id }),
    );
    expect(evidenceAfter.status).toBe(409);
  });
});

describe("demo reset", () => {
  it("re-seeds with fresh report ids so the ledger accepts the case again", async () => {
    const before = await getIssue(DEMO_CASE_REFERENCE);
    await resetDatabase(world.ctx);
    const after = await getIssue(DEMO_CASE_REFERENCE);
    expect(after.id).not.toBe(before.id);
    expect(after.status).toBe("repair_claimed");
    expect(after.endorsements).toBe(7);
    // The ledger agrees with the database: a reviewer can dispute right away.
    const disputed = await verification.POST(
      formRequest(
        "POST",
        "/api/issues/x/verification",
        { outcome: "disputed", note: "After reset: two toilets still broken." },
        [],
        world.as(REVIEWER),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(disputed.status).toBe(200);
    expect((await body<Issue>(disputed)).status).toBe("disputed");
    await resetDatabase(world.ctx);
    expect((await getIssue(DEMO_CASE_REFERENCE)).status).toBe("repair_claimed");
  }, 30_000);
});

describe("demo accounts (one-tap sign-in)", () => {
  it("does not exist outside demo mode", async () => {
    const previous = process.env.DEMO_RESET_ENABLED;
    delete process.env.DEMO_RESET_ENABLED;
    try {
      expect(
        (await demoAccounts.GET(jsonRequest("GET", "/api/demo/accounts"))).status,
      ).toBe(404);
      expect(
        (
          await demoAccounts.POST(
            jsonRequest("POST", "/api/demo/accounts", { email: REVIEWER }),
          )
        ).status,
      ).toBe(404);
    } finally {
      if (previous !== undefined) process.env.DEMO_RESET_ENABLED = previous;
    }
  });

  it("lists one account per role and signs in as one of them without a password", async () => {
    const previous = process.env.DEMO_RESET_ENABLED;
    process.env.DEMO_RESET_ENABLED = "true";
    try {
      const listed = await body<{ accounts: { email: string; role: string }[] }>(
        await demoAccounts.GET(jsonRequest("GET", "/api/demo/accounts")),
      );
      expect(listed.accounts.map((a) => a.role).sort()).toEqual([
        "district_official",
        "independent_reviewer",
        "reporter",
        "school_admin",
      ]);
      // Only the listed accounts can be entered this way, even though more are seeded.
      const refused = await demoAccounts.POST(
        jsonRequest("POST", "/api/demo/accounts", { email: LINDIWE }),
      );
      expect(refused.status).toBe(401);
      const entered = await demoAccounts.POST(
        jsonRequest("POST", "/api/demo/accounts", { email: REVIEWER }),
      );
      expect(entered.status).toBe(200);
      const cookie = entered.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("bona_session=");
      const me = await body<{ user: { role: string } }>(
        await session.GET(jsonRequest("GET", "/api/auth/session", undefined, { cookie })),
      );
      expect(me.user.role).toBe("independent_reviewer");
    } finally {
      if (previous === undefined) delete process.env.DEMO_RESET_ENABLED;
      else process.env.DEMO_RESET_ENABLED = previous;
    }
  });
});

describe("TS-07 disputed resolution", () => {
  it("records the dispute, keeps the claim in the history and allows a new claim", async () => {
    const before = await getIssue(DEMO_CASE_REFERENCE);
    const disputed = await verification.POST(
      formRequest(
        "POST",
        "/api/issues/x/verification",
        {
          outcome: "disputed",
          note: "Site visit 10 November. Toilets 5 and 6 still do not flush. Cubicle 3 door has not been replaced. Work is incomplete.",
        },
        [png("e6-review-cubicles-5-6"), png("e7-review-door-missing")],
        world.as(REVIEWER),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(disputed.status).toBe(200);
    const result = await body<Issue>(disputed);
    expect(result.status).toBe("disputed");
    expect(result.review?.state).toBe("disputed");
    expect(result.timeline.slice(0, before.timeline.length)).toEqual(before.timeline);
    expect(result.timeline.filter((e) => e.type === "repair_claimed")).toHaveLength(1);
    expect(result.timeline.at(-1)).toMatchObject({ type: "disputed" });

    const reclaimed = await repairClaim.POST(
      formRequest(
        "POST",
        "/api/issues/x/repair-claim",
        { note: "Toilets 5 and 6 and the door are now done." },
        [png("e8-second-claim")],
        world.as(ADMIN),
      ),
      params({ id: DEMO_CASE_REFERENCE }),
    );
    expect(reclaimed.status).toBe(200);
    const again = await body<Issue>(reclaimed);
    expect(again.status).toBe("repair_claimed");
    expect(again.review).toMatchObject({ state: "awaiting" });
    expect(
      again.timeline
        .filter((e) => ["repair_claimed", "disputed"].includes(e.type))
        .map((e) => e.type),
    ).toEqual(["repair_claimed", "disputed", "repair_claimed"]);
    const adminQueueIssues = await body<Issue[]>(
      await adminQueue.GET(
        jsonRequest("GET", "/api/admin/queue", undefined, world.as(ADMIN)),
      ),
    );
    expect(
      adminQueueIssues.every((i) => i.schoolName === "Thandolwethu Primary School"),
    ).toBe(true);
  });
});

describe("TS-10 ledger unavailable", () => {
  it("keeps the report with a failed job, and the retry anchors it", async () => {
    world.ledger.down = true;
    const { response, receipt } = await openReport(LINDIWE, {
      title: "Reported while the RPC is down",
    });
    expect(response.status).toBe(201);
    expect(receipt.ledger).toEqual({ source: "none" });
    expect(receipt.evidence[0].ledger).toEqual({ source: "none" });
    const jobs = await world.ctx.db
      .select()
      .from(schema.ledgerJobs)
      .where(eq(schema.ledgerJobs.reportId, receipt.issueId));
    expect(jobs.map((j) => [j.operation, j.status])).toEqual([
      ["registerReport", "failed"],
      ["registerEvidence", "pending"],
    ]);

    const denied = await retry.POST(jsonRequest("POST", "/api/ledger/retry"));
    expect(denied.status).toBe(403);
    const stillDown = await body<{ anchored: number; failed: number }>(
      await retry.POST(
        jsonRequest("POST", "/api/ledger/retry", undefined, {
          "x-cron-secret": "test-cron-secret",
        }),
      ),
    );
    expect(stillDown.anchored).toBe(0);
    expect(stillDown.failed).toBe(1);

    world.ledger.down = false;
    const summary = await body<{ anchored: number; failed: number }>(
      await retry.POST(
        jsonRequest("POST", "/api/ledger/retry", undefined, {
          "x-cron-secret": "test-cron-secret",
        }),
      ),
    );
    expect(summary).toMatchObject({ anchored: 2, failed: 0 });
    const anchored = await getIssue(receipt.issueId);
    expect(anchored.timeline.map((e) => e.ledger)).toEqual([
      { source: "simulated", status: "confirmed" },
      { source: "simulated", status: "confirmed" },
    ]);
    expect(anchored.evidence[0].ledger).toEqual({
      source: "simulated",
      status: "confirmed",
    });
    const after = await world.ctx.db
      .select()
      .from(schema.ledgerJobs)
      .where(eq(schema.ledgerJobs.reportId, receipt.issueId));
    expect(after.every((j) => j.status === "done")).toBe(true);
  });

  it("rolls back a change the contract refuses", async () => {
    // An interim protection on a report the chain still has as `reported` is InvalidState.
    const { receipt } = await openReport(LINDIWE, {
      title: "Protection before acknowledgement",
    });
    const before = await getIssue(receipt.issueId);
    const refused = await (
      await import("@/app/api/issues/[id]/protection/route")
    ).POST(
      jsonRequest(
        "POST",
        "/api/issues/x/protection",
        { description: "Taped off." },
        world.as(ADMIN),
      ),
      params({ id: receipt.issueId }),
    );
    expect(refused.status).toBe(409);
    const after = await getIssue(receipt.issueId);
    expect(after.timeline).toHaveLength(before.timeline.length);
    expect(after.interimProtection).toBeNull();
  });
});

describe("TS-13 declined report", () => {
  it("moves a new report to declined with the public reason as a `declined` timeline event", async () => {
    const { receipt } = await openReport(PALESA, { title: "Loose gate hinge" });
    const refused = await decline.POST(
      jsonRequest("POST", "/api/issues/x/decline", { reason: "" }, world.as(ADMIN)),
      params({ id: receipt.issueId }),
    );
    expect(refused.status).toBe(422);
    const declined = await decline.POST(
      jsonRequest(
        "POST",
        "/api/issues/x/decline",
        { reason: "Not a school facility; referred to the municipality." },
        world.as(ADMIN),
      ),
      params({ id: receipt.issueId }),
    );
    expect(declined.status).toBe(200);
    const issueAfter = await body<Issue>(declined);
    expect(issueAfter.status).toBe("declined");
    const last = issueAfter.timeline.at(-1)!;
    expect(last.type).toBe("declined");
    expect(last.note).toBe("Not a school facility; referred to the municipality.");
    expect(last.actor).toBe("school_admin");
  });
});

describe("anchoring queue on a slow chain", () => {
  it("stops at the time budget, reports what is left, and never sends a write twice", async () => {
    world.ledger.down = true;
    const first = await openReport(LINDIWE, {
      title: "Queued while the chain is slow (1)",
    });
    const second = await openReport(PALESA, {
      title: "Queued while the chain is slow (2)",
    });
    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(201);
    world.ledger.down = false;

    // No time at all: nothing is attempted and the whole queue is reported as remaining.
    const none = await processLedgerJobs(world.ctx.db, world.ctx.ledger, {
      budgetMs: -1,
    });
    expect(none).toMatchObject({ attempted: 0, anchored: 0, remaining: 4 });

    // Two calls at once share one run: four writes are sent, not eight.
    const [a, b] = await Promise.all([
      processLedgerJobs(world.ctx.db, world.ctx.ledger),
      processLedgerJobs(world.ctx.db, world.ctx.ledger),
    ]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ attempted: 4, anchored: 4, rejected: 0, remaining: 0 });

    const jobs = await world.ctx.db
      .select()
      .from(schema.ledgerJobs)
      .where(eq(schema.ledgerJobs.reportId, second.receipt.issueId));
    expect(jobs.map((j) => [j.status, j.attempts])).toEqual([
      ["done", 2],
      ["done", 1],
    ]);
  });
});

describe("TS-11 invalid input", () => {
  it("returns 422 with a message for bad fields, 403 for staff, 404 for an unknown school", async () => {
    const empty = (await openReport(LINDIWE, { description: "" })).response;
    expect(empty.status).toBe(422);
    expect((await empty.json()).error.code).toBe("invalid_input");
    expect((await openReport(LINDIWE, { schoolId: "" })).response.status).toBe(422);
    expect(
      (await openReport(LINDIWE, { schoolId: "no-such-school" })).response.status,
    ).toBe(404);
    expect((await openReport(LINDIWE, {}, [notAnImage()])).response.status).toBe(422);
    expect((await openReport(LINDIWE, { category: "weather" })).response.status).toBe(
      422,
    );
    const signedOut = await reports.POST(
      formRequest("POST", "/api/reports", {
        schoolId: DEMO_SCHOOL,
        category: "water",
        title: "No water",
        description: "None",
      }),
    );
    // A signed-out visitor may report: nothing is attributed, the public sees "Reporter".
    expect(signedOut.status).toBe(201);
    const guestReceipt = await body<{ reference: string; issueId: string }>(signedOut);
    const guestRow = await reportByReference(world, guestReceipt.reference);
    expect(guestRow.reporterId).toBeNull();
    const guestIssue = await getIssue(guestReceipt.issueId);
    expect(guestIssue.timeline[0].note).toBe("Reported by Reporter.");
    const guestEvidence = await evidence.POST(
      formRequest("POST", "/api/issues/x/evidence", { purpose: "problem" }, [
        png("guest-evidence"),
      ]),
      params({ id: guestReceipt.issueId }),
    );
    expect(guestEvidence.status).toBe(201);
    const staff = (await openReport(ADMIN)).response;
    expect(staff.status).toBe(403);
    const markup = await openReport(LINDIWE, {
      description: "<script>alert(1)</script> leaking pipe",
    });
    expect((await getIssue(markup.receipt.issueId)).description).toBe(
      "<script>alert(1)</script> leaking pipe",
    );
  });
});

describe("evidence privacy and verification documents", () => {
  it("serves the private file only to roles with evidence:read", async () => {
    const demo = await getIssue(DEMO_CASE_REFERENCE);
    const item = demo.evidence[0];
    const get = (headers = {}) =>
      evidenceFile.GET(
        jsonRequest("GET", `/api/evidence/${item.id}/file`, undefined, headers),
        params({ id: item.id }),
      );
    expect((await get()).status).toBe(401);
    expect((await get(world.as(LINDIWE))).status).toBe(403);
    expect((await get(world.as("admin@khanyisa.demo"))).status).toBe(403);
    for (const who of [ADMIN, DISTRICT, REVIEWER]) {
      const ok = await get(world.as(who));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toBe("image/png");
      const bytes = new Uint8Array(await ok.arrayBuffer());
      expect(await sha256Hex(bytes)).toBe(item.digest);
    }
    const matches = await body<Array<{ issue: IssueSummary }>>(
      await verify.GET(jsonRequest("GET", `/api/verify/evidence?digest=${item.digest}`)),
    );
    expect(matches[0].issue.reference).toBe(DEMO_CASE_REFERENCE);
    expect(
      (await verify.GET(jsonRequest("GET", "/api/verify/evidence?digest=nope"))).status,
    ).toBe(422);
  });

  it("exposes the salted commitment documents and evidence receipts for BonaBlock Verify", async () => {
    const demo = await getIssue(DEMO_CASE_REFERENCE);
    const report = await reportByReference(world, DEMO_CASE_REFERENCE);
    const doc = await body<{
      kind: string;
      commitment: string;
      document: { salt: string; title: string };
      receipt: { event: string };
    }>(
      await documents.GET(
        jsonRequest("GET", "/api/issues/x/documents/y"),
        params({ id: demo.id, recordId: demo.id }),
      ),
    );
    expect(doc.kind).toBe("report");
    expect(doc.commitment).toBe(report.commitment);
    expect(doc.document.salt).toMatch(HEX32);
    expect(doc.document.title).toBe(demo.title);
    expect(doc.receipt.event).toBe("ReportRegistered");
    const ev = await body<{ kind: string; digest: string; receipt: { event: string } }>(
      await documents.GET(
        jsonRequest("GET", "/api/issues/x/documents/y"),
        params({ id: demo.id, recordId: demo.evidence[0].id }),
      ),
    );
    expect(ev).toMatchObject({
      kind: "evidence",
      digest: demo.evidence[0].digest,
      receipt: { event: "EvidenceRegistered" },
    });
    const missing = await documents.GET(
      jsonRequest("GET", "/api/issues/x/documents/y"),
      params({ id: demo.id, recordId: "not-a-record" }),
    );
    expect(missing.status).toBe(404);

    // The timeline passes case-event ids: they resolve to the anchored record.
    const issue = await getIssue(demo.id);
    const reported = issue.timeline.find((e) => e.type === "reported")!;
    const viaEvent = await body<{ kind: string; recordId: string }>(
      await documents.GET(
        jsonRequest("GET", "/api/issues/x/documents/y"),
        params({ id: demo.id, recordId: reported.id }),
      ),
    );
    expect(viaEvent).toMatchObject({ kind: "report", recordId: demo.id });
    const claimed = issue.timeline.find((e) => e.type === "repair_claimed")!;
    const claim = await body<{ kind: string; receipt: { event: string } }>(
      await documents.GET(
        jsonRequest("GET", "/api/issues/x/documents/y"),
        params({ id: demo.id, recordId: claimed.id }),
      ),
    );
    expect(claim).toMatchObject({
      kind: "repair_claim",
      receipt: { event: "RepairClaimed" },
    });
    const progress = issue.timeline.find((e) => e.type === "progress_recorded")!;
    const none = await documents.GET(
      jsonRequest("GET", "/api/issues/x/documents/y"),
      params({ id: demo.id, recordId: progress.id }),
    );
    expect(none.status).toBe(404);
  });

  it("answers the assistant from records only", async () => {
    const reply = await body<{ text: string; issues?: IssueSummary[] }>(
      await assistant.POST(
        jsonRequest("POST", "/api/assistant", {
          history: [],
          question: "The girls toilets at Thandolwethu are broken",
        }),
      ),
    );
    expect(reply.text).toContain("keyword match");
    expect(reply.issues?.[0].reference).toBe(DEMO_CASE_REFERENCE);
  });
});

describe("TS-12 privacy on the ledger", () => {
  it("passes only UUIDs, 0x digests, commitments and enum names to the LedgerPort", async () => {
    expect(world.ledger.calls.length).toBeGreaterThan(30);
    const ok = (value: unknown): boolean => {
      if (typeof value === "string") {
        return (
          UUID.test(value) ||
          HEX32.test(value) ||
          [
            "report",
            "repair",
            "review",
            "registrar",
            "school_admin",
            "reviewer",
          ].includes(value)
        );
      }
      if (value && typeof value === "object") return Object.values(value).every(ok);
      return false;
    };
    for (const call of world.ledger.calls) {
      for (const arg of call.args)
        expect(ok(arg), `${call.method}(${JSON.stringify(arg)})`).toBe(true);
    }
    const jobs = await world.ctx.db.select().from(schema.ledgerJobs);
    for (const job of jobs)
      expect(ok(job.payload), JSON.stringify(job.payload)).toBe(true);
    const serialised = JSON.stringify(world.ledger.calls);
    for (const secret of [
      "Lindiwe",
      "Mahlangu",
      "lindiwe@community.demo",
      "toilet",
      "Thandolwethu",
      "Reporter R-",
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });
});
