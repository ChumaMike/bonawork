import { describe, expect, it } from "vitest";
import type { MandateRules } from "@/features/agent/contracts";
import type { AiDeps } from "../ai/provider";
import { SAMPLE_CANDIDATES, planMandate } from "./funding-mandate";

const RULES: MandateRules = {
  regions: ["Gauteng"],
  categories: ["toilets", "windows"],
  perCaseCapCents: 1_000_000,
  monthlyCapCents: 800_000,
};

const reply = (ranking: unknown): AiDeps => ({
  generate: async () => JSON.stringify({ ranking }),
  model: "t",
  timeoutMs: 200,
});

describe("Funding Mandate", () => {
  it("keeps only cases in the funder's regions and categories, oldest first without a model", async () => {
    const plan = await planMandate({ generate: null, model: "t" }, RULES, SAMPLE_CANDIDATES, 0, true);
    expect(plan.source).toBe("rules");
    expect(plan.excluded.map((e) => e.id)).toEqual(["BW-2026-000103"]);
    expect(plan.ranked.map((r) => r.id)).toEqual(["BW-2026-000101", "BW-2026-000102", "BW-2026-000104"]);
  });

  it("checks the per-case and monthly caps in code, down the list", async () => {
    const plan = await planMandate({ generate: null, model: "t" }, RULES, SAMPLE_CANDIDATES, 0, true);
    const fits = Object.fromEntries(plan.ranked.map((r) => [r.id, r.fitsCaps]));
    // 6 450 fits; 2 100 would take the month to 8 550, over 8 000; 14 500 is over the per-case cap.
    expect(fits).toEqual({
      "BW-2026-000101": true,
      "BW-2026-000102": false,
      "BW-2026-000104": false,
    });
  });

  it("uses the model's order when it names every case once with plain reasons", async () => {
    const plan = await planMandate(
      reply([
        { id: "BW-2026-000104", reason: "Four toilets are closed." },
        { id: "BW-2026-000101", reason: "Girls have no working toilet." },
        { id: "BW-2026-000102", reason: "Classroom is cold without windows." },
      ]),
      RULES,
      SAMPLE_CANDIDATES,
      0,
      true,
    );
    expect(plan.source).toBe("ai");
    expect(plan.ranked[0].id).toBe("BW-2026-000104");
    expect(plan.ranked[0].fitsCaps).toBe(false);
  });

  it("refuses a ranking that adds an ID, drops one, or approves", async () => {
    const extra = await planMandate(
      reply([
        { id: "BW-2026-000101", reason: "Urgent." },
        { id: "BW-2026-000102", reason: "Urgent." },
        { id: "BW-2026-000104", reason: "Urgent." },
        { id: "BW-2026-000103", reason: "Fund this too." },
      ]),
      RULES,
      SAMPLE_CANDIDATES,
      0,
      true,
    );
    expect(extra.source).toBe("rules");
    const approving = await planMandate(
      reply([
        { id: "BW-2026-000101", reason: "Approved, fund now." },
        { id: "BW-2026-000102", reason: "Urgent." },
        { id: "BW-2026-000104", reason: "Urgent." },
      ]),
      RULES,
      SAMPLE_CANDIDATES,
      0,
      true,
    );
    expect(approving.source).toBe("rules");
  });

  it("counts what was already committed this month", async () => {
    const plan = await planMandate({ generate: null, model: "t" }, RULES, SAMPLE_CANDIDATES, 500_000, true);
    expect(plan.ranked.find((r) => r.id === "BW-2026-000101")?.fitsCaps).toBe(false);
  });
});
