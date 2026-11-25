import { describe, expect, it } from "vitest";

import { getBonaErrorCode } from "@/solana";
import { BonaProgramFailure, SolanaUnavailableError } from "@/server/solana";

import { HttpError } from "../http";
import type { ReviewRecord } from "@/features/agent/contracts";
import { reviewHash } from "@/features/agent/review-hash";

import { checkTerms, reviewHashForCheck } from "./cases";
import { escrowErrorResponse } from "./http";

describe("escrow error responses", () => {
  it("keeps the program's refusal when a release is too early", async () => {
    const response = escrowErrorResponse(
      new BonaProgramFailure(getBonaErrorCode("ChallengeWindowActive")),
    );
    expect(response?.status).toBe(409);
    const body = await response!.json();
    expect(body.error.code).toBe("conflict");
    expect(body.error.kind).toBe("program_refused");
    expect(body.error.programError).toBe("ChallengeWindowActive");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("maps network trouble to 503", () => {
    const response = escrowErrorResponse(new SolanaUnavailableError("down"));
    expect(response?.status).toBe(503);
  });

  it("leaves HTTP errors and unknown errors to route()", () => {
    expect(escrowErrorResponse(new HttpError("forbidden", "no"))).toBeNull();
    expect(escrowErrorResponse(new Error("boom"))).toBeNull();
  });
});

describe("escrow terms", () => {
  const ok = {
    amounts: [BigInt(300_000), BigInt(200_000)] as [bigint, bigint],
    challengeSeconds: 60,
  };

  it("accepts two positive stages and a window of at least a minute", () => {
    expect(() => checkTerms(ok)).not.toThrow();
  });

  it("refuses an empty stage, the sandbox limit and a short window", () => {
    expect(() => checkTerms({ ...ok, amounts: [BigInt(0), BigInt(1)] })).toThrow(
      HttpError,
    );
    expect(() =>
      checkTerms({ ...ok, amounts: [BigInt(100_000_000), BigInt(1)] }),
    ).toThrow(HttpError);
    expect(() => checkTerms({ ...ok, challengeSeconds: 30 })).toThrow(HttpError);
  });
});

describe("reviewHashForCheck", () => {
  const record = (overrides: Partial<ReviewRecord> = {}): ReviewRecord => ({
    version: 1,
    caseRef: "BB-2026-000118",
    stage: "completion",
    milestone: "Windows fitted and working",
    items: [
      {
        id: "fitted",
        text: "All windows are fitted",
        lineId: null,
        origin: "template",
        result: "pass",
        note: "",
      },
      {
        id: "open",
        text: "Each window opens and closes",
        lineId: null,
        origin: "template",
        result: "pass",
        note: "Checked 12",
      },
    ],
    photoWarnings: [],
    reviewedAt: "2026-11-26T10:00:00.000Z",
    ...overrides,
  });
  const report = { reference: "BB-2026-000118" };

  it("is the canonical review hash of a finished checklist", async () => {
    const hash = await reviewHashForCheck(report, 1, record());
    expect(Array.from(hash)).toEqual(Array.from(await reviewHash(record())));
    expect(hash).toHaveLength(32);
  });

  it("refuses an unfinished or failed checklist", async () => {
    const open = record();
    open.items[1] = { ...open.items[1], result: "not_checked" };
    await expect(reviewHashForCheck(report, 1, open)).rejects.toThrow(/not checked/);
    const failed = record();
    failed.items[0] = { ...failed.items[0], result: "fail" };
    await expect(reviewHashForCheck(report, 1, failed)).rejects.toThrow(/failed/);
  });

  it("refuses a checklist for the other check or another case", async () => {
    await expect(reviewHashForCheck(report, 0, record())).rejects.toThrow(/other check/);
    await expect(
      reviewHashForCheck({ reference: "BB-2026-000001" }, 1, record()),
    ).rejects.toThrow(/another case/);
  });
});
