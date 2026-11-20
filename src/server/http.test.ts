import { describe, expect, it } from "vitest";
import { ApiErrorSchema, LedgerError } from "@/shared";
import { loadEnv } from "./env";
import { fail, ok } from "./http";

describe("response helpers", () => {
  it("wraps data and maps error codes to statuses", async () => {
    expect(await ok({ a: 1 }).json()).toEqual({ data: { a: 1 } });
    const response = fail("invalid_transition", "A repair must be claimed first.");
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.error.code).toBe("invalid_transition");
  });
});

describe("ledger error", () => {
  it("carries a code that callers can branch on", () => {
    const error = LedgerError.fromContract("SchoolAdminCannotVerify", "verifyRepair");
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "LedgerError",
      code: "self_verification",
      contractError: "SchoolAdminCannotVerify",
    });
    expect(new LedgerError("rpc_unavailable", null, "down").contractError).toBeNull();
  });
});

describe("environment", () => {
  const key = (byte: string) => `0x${byte.repeat(32)}`;

  it("needs nothing to run locally", () => {
    expect(loadEnv({})).toMatchObject({
      LEDGER_MODE: "auto",
      EVIDENCE_STORAGE_DIR: ".evidence",
    });
  });

  it("refuses the same key for two on-chain roles", () => {
    expect(() =>
      loadEnv({
        LEDGER_SCHOOL_ADMIN_PRIVATE_KEY: key("a1"),
        LEDGER_REVIEWER_PRIVATE_KEY: key("a1"),
      }),
    ).toThrow(/must all differ/);
    expect(
      loadEnv({
        LEDGER_SCHOOL_ADMIN_PRIVATE_KEY: key("a1"),
        LEDGER_REVIEWER_PRIVATE_KEY: key("b2"),
      }).LEDGER_REVIEWER_PRIVATE_KEY,
    ).toBe(key("b2"));
  });
});
