/**
 * Funding Mandate: a funder's standing rules, and a short list to approve.
 *
 * 1. Code keeps only cases in the funder's regions and categories.
 * 2. A model may put those in an order and give a one-line reason for each,
 *    naming cases by ID only. Any unknown or missing ID, a new number or a
 *    word of decision refuses the reply; then code orders them, oldest first.
 * 3. Code checks the per-case cap and the monthly cap down the list.
 * 4. The funder approves each one. Nothing here spends, signs or funds.
 */
import { z } from "zod";
import {
  MandateRulesSchema,
  type MandateCandidate,
  type MandatePlan,
  type MandateRules,
} from "@/features/agent/contracts";
import { formatRand } from "@/shared/price-check";
import {
  DATA_RULE,
  ModelRefused,
  dataBlock,
  inventedNumbers,
  numbersVouchedBy,
  parseModelJson,
  stripPii,
  withFallback,
} from "../ai/guard";
import type { AiDeps } from "../ai/provider";

/** Sample open cases for the demo page, labelled as samples. */
export const SAMPLE_CANDIDATES: MandateCandidate[] = [
  {
    id: "BW-2026-000101",
    school: "Sample school A",
    region: "Gauteng",
    category: "toilets",
    budgetCents: 645_000,
    summary: "Two toilets in the girls' block do not flush.",
    reportedAt: "2026-10-28T08:00:00Z",
  },
  {
    id: "BW-2026-000102",
    school: "Sample school B",
    region: "Gauteng",
    category: "windows",
    budgetCents: 210_000,
    summary: "Three broken windows in a Grade 4 classroom.",
    reportedAt: "2026-11-10T08:00:00Z",
  },
  {
    id: "BW-2026-000103",
    school: "Sample school C",
    region: "Limpopo",
    category: "water",
    budgetCents: 980_000,
    summary: "The only tap for 600 learners leaks and runs dry by noon.",
    reportedAt: "2026-11-02T08:00:00Z",
  },
  {
    id: "BW-2026-000104",
    school: "Sample school D",
    region: "Gauteng",
    category: "toilets",
    budgetCents: 1_450_000,
    summary: "Sewer pipe blocked; four toilets closed.",
    reportedAt: "2026-11-15T08:00:00Z",
  },
];

const WORDS_OF_DECISION = /\b(approv\w*|fund(ed)?|paid|pay|authori[sz]\w*|guarantee\w*|resolved|releas\w*)\b/i;

const RankSchema = z.strictObject({
  ranking: z
    .array(z.strictObject({ id: z.string().max(64), reason: z.string().trim().min(3).max(200) }))
    .max(50),
});

const SYSTEM_PROMPT = `You are Bona AI inside BonaWork. A funder has rules for which school repairs they want to see. Code has already kept only the cases that fit the funder's regions and categories. Your only job is to put these cases in a sensible order to look at (urgency for learners first, then how long they have waited) and give one short reason for each.
Rules you must follow:
- ${DATA_RULE}
- Name cases only by their id. Use every id exactly once and no other id.
- You decide nothing. Never say a case is approved, funded or paid. Code checks the money limits and the funder decides.
- Use only numbers that appear in DATA.
Respond with JSON only: {"ranking": [{"id": string, "reason": string}]}`;

function oldestFirst(candidates: MandateCandidate[]) {
  return [...candidates]
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
    .map((c) => ({ id: c.id, reason: `Reported ${c.reportedAt.slice(0, 10)}, waiting longest first.` }));
}

export async function planMandate(
  deps: AiDeps,
  rulesInput: MandateRules,
  candidates: MandateCandidate[],
  spentThisMonthCents: number,
  sample: boolean,
): Promise<MandatePlan> {
  const rules = MandateRulesSchema.parse(rulesInput);
  const regions = new Set(rules.regions.map((r) => r.toLowerCase()));
  const categories = new Set(rules.categories.map((c) => c.toLowerCase()));

  const excluded: MandatePlan["excluded"] = [];
  const eligible: MandateCandidate[] = [];
  for (const c of candidates) {
    if (!regions.has(c.region.toLowerCase())) excluded.push({ id: c.id, why: `Region ${c.region} is not in your rules.` });
    else if (!categories.has(c.category.toLowerCase())) excluded.push({ id: c.id, why: `Category ${c.category} is not in your rules.` });
    else eligible.push(c);
  }

  const data = eligible
    .map((c) => `id ${c.id} | category ${c.category} | reported ${c.reportedAt.slice(0, 10)} | ${stripPii(c.summary).slice(0, 200)}`)
    .join("\n");
  const allowed = numbersVouchedBy(data);
  const ids = new Set(eligible.map((c) => c.id));

  const { value: order, source } =
    eligible.length === 0
      ? { value: [], source: "rules" as const }
      : await withFallback(
          "funding-mandate",
          deps,
          { system: SYSTEM_PROMPT, prompt: dataBlock("cases", data), maxOutputTokens: 600 },
          (raw) => {
            const { ranking } = parseModelJson(raw, RankSchema);
            const seen = new Set(ranking.map((r) => r.id));
            if (seen.size !== ranking.length || seen.size !== ids.size || ranking.some((r) => !ids.has(r.id))) {
              throw new ModelRefused("the ranking does not name every case exactly once");
            }
            for (const r of ranking) {
              if (WORDS_OF_DECISION.test(r.reason)) throw new ModelRefused("a reason uses a word of decision");
              if (inventedNumbers(r.reason.replace(r.id, ""), allowed).length > 0) {
                throw new ModelRefused("a reason has a number that is not in the cases");
              }
            }
            return ranking;
          },
          () => oldestFirst(eligible),
        );

  // Caps, in code, down the list in the order shown.
  const byId = new Map(eligible.map((c) => [c.id, c]));
  let committed = spentThisMonthCents;
  const ranked = order.map(({ id, reason }) => {
    const c = byId.get(id)!;
    if (c.budgetCents > rules.perCaseCapCents) {
      return { id, reason, fitsCaps: false, capNote: `${formatRand(c.budgetCents)} is over your cap of ${formatRand(rules.perCaseCapCents)} per case.` };
    }
    if (committed + c.budgetCents > rules.monthlyCapCents) {
      return { id, reason, fitsCaps: false, capNote: `Would take this month past your cap of ${formatRand(rules.monthlyCapCents)}.` };
    }
    committed += c.budgetCents;
    return { id, reason, fitsCaps: true, capNote: `${formatRand(c.budgetCents)} fits your caps.` };
  });

  return { ranked, excluded, spentThisMonthCents, source, sample };
}
