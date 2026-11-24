import { describe, expect, it } from "vitest";

import { getBonaErrorCode } from "@/solana";
import { BonaProgramFailure, SolanaUnavailableError } from "@/server/solana";

import { HttpError } from "../http";
import { checkTerms } from "./cases";
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
