import { z } from "zod";
import { MandateRulesSchema } from "@/features/agent/contracts";
import { agentAi } from "@/server/agent/deps";
import { SAMPLE_CANDIDATES, planMandate } from "@/server/agent/funding-mandate";
import { ok, parseJson, route } from "@/server/http";

const Body = z.object({ rules: MandateRulesSchema });

/**
 * `POST /api/agent/mandate` — Funding Mandate (sample cases for now).
 * `{ rules }` gives the cases that fit, ordered with reasons, each checked
 * against the caps in code. A list for the funder to approve; nothing is
 * funded here. The coordinator can pass real open cases to `planMandate`.
 */
export const POST = route(async (request) => {
  const { rules } = await parseJson(request, Body);
  return ok(await planMandate(agentAi(), rules, SAMPLE_CANDIDATES, 0, true));
});
