import { describe, expect, it } from "vitest";
import { isLowSolError } from "@/server/escrow/http";
import { SolanaTransactionError } from "@/server/solana/rpc";
import { decodeDemoCookie, encodeDemoCookie, templateAmounts } from "./guided";
import { IpWindow, clientIp, demoModeOn, mayCreateCase, readDemoLimits } from "./limits";

describe("demo limits", () => {
  it("defaults: demo on, 2 cases per browser, 3 per IP and 10 per hour", () => {
    const l = readDemoLimits({});
    expect(demoModeOn({})).toBe(true);
    expect(l).toMatchObject({ perSession: 2, perIpHour: 3, globalHour: 10 });
    expect(l.minLamports).toBe(BigInt(50_000_000));
  });

  it("reads the env flags", () => {
    expect(demoModeOn({ BONAWORK_DEMO_MODE: "off" })).toBe(false);
    const l = readDemoLimits({
      BONAWORK_DEMO_CASES_PER_SESSION: "1",
      BONAWORK_DEMO_CASES_PER_IP_HOUR: "5",
      BONAWORK_DEMO_CASES_PER_HOUR: "0",
      BONAWORK_DEMO_MIN_SOL: "0.2",
    });
    expect(l).toMatchObject({ perSession: 1, perIpHour: 5, globalHour: 0 });
    expect(l.minLamports).toBe(BigInt(200_000_000));
    expect(readDemoLimits({ BONAWORK_DEMO_CASES_PER_HOUR: "lots" }).globalHour).toBe(10);
  });

  it("allows a case within every cap and names the first cap reached", () => {
    const limits = readDemoLimits({});
    expect(
      mayCreateCase({ session: 0, ipLastHour: 0, globalLastHour: 0 }, limits),
    ).toEqual({
      ok: true,
    });
    expect(
      mayCreateCase({ session: 2, ipLastHour: 0, globalLastHour: 0 }, limits),
    ).toMatchObject({
      ok: false,
      reason: "session",
    });
    expect(
      mayCreateCase({ session: 1, ipLastHour: 3, globalLastHour: 0 }, limits),
    ).toMatchObject({
      ok: false,
      reason: "ip",
    });
    expect(
      mayCreateCase({ session: 1, ipLastHour: 2, globalLastHour: 10 }, limits),
    ).toMatchObject({
      ok: false,
      reason: "global",
    });
  });

  it("counts new cases per IP in a sliding hour", () => {
    const w = new IpWindow(3_600_000);
    w.record("1.2.3.4", 0);
    w.record("1.2.3.4", 1_000);
    expect(w.count("1.2.3.4", 2_000)).toBe(2);
    expect(w.count("5.6.7.8", 2_000)).toBe(0);
    expect(w.count("1.2.3.4", 3_600_500)).toBe(1);
    expect(w.count("1.2.3.4", 7_300_000)).toBe(0);
  });

  it("takes the first forwarded address", () => {
    const r = new Request("http://x", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    expect(clientIp(r)).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("demo cookie", () => {
  it("round-trips and refuses tampering and expiry", () => {
    const token = encodeDemoCookie({ caseId: "c1", made: 1, shared: false }, "s", 0);
    expect(decodeDemoCookie(token, "s", 1)).toEqual({
      caseId: "c1",
      made: 1,
      shared: false,
    });
    expect(decodeDemoCookie(token, "other", 1)).toBeNull();
    const [payload] = token.split(".");
    expect(decodeDemoCookie(`${payload}.forged`, "s", 1)).toBeNull();
    expect(decodeDemoCookie(token, "s", 25 * 3_600_000)).toBeNull();
  });
});

describe("template", () => {
  it("splits the sample job: materials R3 000 to the supplier, labour R2 000 to the contractor", () => {
    expect(templateAmounts()).toEqual([300_000, 200_000]);
  });
});

describe("low devnet SOL", () => {
  it("spots Solana's insufficient-funds errors", () => {
    expect(
      isLowSolError(
        new SolanaTransactionError("InsufficientFundsForFee", [
          "Transfer: insufficient lamports 10, need 5000",
        ]),
      ),
    ).toBe(true);
    expect(
      isLowSolError({
        message: "Transaction simulation failed",
        context: {
          logs: ["Attempt to debit an account but found no record of a prior credit."],
        },
      }),
    ).toBe(true);
    expect(isLowSolError(new Error("ChallengeWindowActive"))).toBe(false);
  });
});
