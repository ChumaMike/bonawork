import { describe, expect, it } from "vitest";
import {
  detectStep,
  factsFrom,
  isFinished,
  personForRole,
  stepCounter,
  stepHref,
  stepInfo,
  type DemoFacts,
  type TrancheFacts,
} from "./steps";

const t = (state: TrancheFacts["state"]): TrancheFacts => ({ state });
const funded = (a: TrancheFacts["state"], b: TrancheFacts["state"]) => ({
  funded: true,
  tranches: [t(a), t(b)],
  chainError: null,
});
const facts = (over: Partial<DemoFacts>): DemoFacts => ({
  status: "acknowledged",
  budgetConfirmed: true,
  escrow: null,
  continued: false,
  ...over,
});

describe("detectStep", () => {
  it("walks the seven main steps from the real case state", () => {
    expect(detectStep(facts({ status: "submitted", budgetConfirmed: false }))).toBe(
      "report",
    );
    expect(detectStep(facts({ budgetConfirmed: false }))).toBe("scope");
    expect(detectStep(facts({}))).toBe("fund");
    expect(
      detectStep(
        facts({
          escrow: {
            funded: false,
            tranches: [t("Pending"), t("Pending")],
            chainError: null,
          },
        }),
      ),
    ).toBe("fund");
    expect(detectStep(facts({ escrow: funded("Pending", "Pending") }))).toBe("claim1");
    expect(detectStep(facts({ escrow: funded("Claimed", "Pending") }))).toBe("review1");
    expect(detectStep(facts({ escrow: funded("Verified", "Pending") }))).toBe("release1");
    expect(detectStep(facts({ escrow: funded("Released", "Pending") }))).toBe("proof");
  });

  it("carries on with Check 2 only when the visitor asks, or when it already moved", () => {
    const released = { escrow: funded("Released", "Pending") };
    expect(detectStep(facts({ ...released, continued: true }))).toBe("claim2");
    expect(detectStep(facts({ escrow: funded("Released", "Claimed") }))).toBe("school2");
    expect(
      detectStep(
        facts({ status: "repair_claimed", escrow: funded("Released", "Claimed") }),
      ),
    ).toBe("review2");
    expect(
      detectStep(facts({ status: "verified", escrow: funded("Released", "Verified") })),
    ).toBe("release2");
    expect(
      detectStep(facts({ status: "verified", escrow: funded("Released", "Released") })),
    ).toBe("done");
  });

  it("stops the guide when a check is disputed or refunded, or the case declined", () => {
    expect(detectStep(facts({ escrow: funded("Disputed", "Pending") }))).toBe("off_path");
    expect(detectStep(facts({ escrow: funded("Released", "Refunded") }))).toBe(
      "off_path",
    );
    expect(detectStep(facts({ status: "rejected" }))).toBe("off_path");
  });

  it("waits when Solana cannot be read, instead of guessing", () => {
    expect(
      detectStep(
        factsFrom(
          { status: "acknowledged", budget: {}, escrow: null, escrowError: "down" },
          false,
        ),
      ),
    ).toBe("chain_unreadable");
    expect(
      detectStep(facts({ escrow: { funded: null, tranches: null, chainError: "down" } })),
    ).toBe("chain_unreadable");
  });

  it("an escrow without a confirmed budget still counts as past the scope step", () => {
    expect(
      detectStep(facts({ budgetConfirmed: false, escrow: funded("Pending", "Pending") })),
    ).toBe("claim1");
  });
});

describe("step info", () => {
  it("numbers the main steps and the Check 2 steps", () => {
    expect(stepCounter(stepInfo("fund"))).toBe("Step 3 of 7");
    expect(stepCounter(stepInfo("proof"))).toBe("Step 7 of 7");
    expect(stepCounter(stepInfo("review2"))).toBe("Check 2 · step 3 of 4");
    expect(stepCounter(stepInfo("done"))).toBe("Demo finished");
  });

  it("names who acts and where", () => {
    expect(stepInfo("fund").person).toBe("funder");
    expect(stepInfo("claim1").person).toBe("contractor");
    expect(stepInfo("release1").person).toBe("public");
    expect(stepHref("review1", "abc")).toBe("/issues/abc/escrow/review?stage=0");
    expect(stepHref("review2", "abc")).toBe("/issues/abc/escrow/review?stage=1");
    expect(stepHref("fund", "abc")).toBe("/demo");
  });

  it("never says paid or resolved", () => {
    for (const id of [
      "report",
      "scope",
      "fund",
      "claim1",
      "review1",
      "release1",
      "proof",
      "claim2",
      "school2",
      "review2",
      "release2",
      "done",
      "off_path",
      "chain_unreadable",
    ] as const) {
      const { title, why } = stepInfo(id);
      expect(`${title} ${why}`).not.toMatch(/\bpaid\b|resolved/i);
    }
  });

  it("maps session roles to demo people", () => {
    expect(personForRole(null)).toBe("public");
    expect(personForRole("buyer")).toBe("funder");
    expect(personForRole("supplier")).toBe("contractor");
    expect(personForRole("independent_reviewer")).toBe("reviewer");
    expect(personForRole("school_admin")).toBe("school");
    expect(personForRole("district_official")).toBeNull();
  });

  it("a finished or broken case may be replaced", () => {
    expect(isFinished("done")).toBe(true);
    expect(isFinished("off_path")).toBe(true);
    expect(isFinished("proof")).toBe(false);
  });
});
