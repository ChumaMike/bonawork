import { ChecklistRequestSchema } from "@/features/agent/contracts";
import { agentAi } from "@/server/agent/deps";
import { draftChecklist } from "@/server/agent/reviewer-copilot";
import { ok, parseJson, route } from "@/server/http";

/**
 * `POST /api/agent/checklist` — Reviewer Copilot. `{ milestone, stage, lines,
 * priceFlags }` gives the code-written checks plus up to 8 suggested ones.
 * The reviewer ticks them; nothing here passes or fails a stage.
 */
export const POST = route(async (request) => {
  const body = await parseJson(request, ChecklistRequestSchema);
  return ok(await draftChecklist(agentAi(), body));
});
