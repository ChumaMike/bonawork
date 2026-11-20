import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { startAssessment } from "@/server/reports/admin";
import { begin, deps, issueResponse } from "@/server/request";

const Body = z.object({ note: z.string().trim().min(1).max(2000) });

/** `POST /api/issues/:id/assessment` — submitted → acknowledged (`acknowledgeReport`). */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requireSession(scope.session);
  const { note } = await parseJson(request, Body);
  const reportId = await startAssessment(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
    note,
  });
  return issueResponse(scope, reportId);
});
