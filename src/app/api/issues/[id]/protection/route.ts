import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { recordInterimProtection } from "@/server/reports/admin";
import { begin, deps, issueResponse } from "@/server/request";

const Body = z.object({ description: z.string().trim().min(1).max(2000) });

/** `POST /api/issues/:id/protection` — status unchanged (`recordInterimProtection`). */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requireSession(scope.session);
  const { description } = await parseJson(request, Body);
  const reportId = await recordInterimProtection(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
    description,
  });
  return issueResponse(scope, reportId);
});
