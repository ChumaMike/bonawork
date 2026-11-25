import { ScoutRequestSchema } from "@/features/agent/contracts";
import { scoutDeps } from "@/server/agent/deps";
import { scoutRepair } from "@/server/agent/repair-scout";
import { ok, parseJson, route } from "@/server/http";

/**
 * `POST /api/agent/scout` — Repair Scout. `{ reportText, demo? }` gives a
 * draft parts list with shop prices and a 40/60 budget. A draft for a person
 * to confirm: nothing is created, funded or approved here.
 */
export const POST = route(async (request) => {
  const body = await parseJson(request, ScoutRequestSchema);
  return ok(await scoutRepair(scoutDeps(body.demo), body.reportText));
});
