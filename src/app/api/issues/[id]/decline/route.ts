import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { declineReport } from "@/server/reports/admin";
import { begin, deps, issueResponse } from "@/server/request";

const Body = z.object({
  reason: z.string().trim().min(1, "A reason is required.").max(1000),
});

/** `POST /api/issues/:id/decline` — → rejected (off-chain, reason public). */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requireSession(scope.session);
  const { reason } = await parseJson(request, Body);
  const reportId = await declineReport(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
    reason,
  });
  return issueResponse(scope, reportId);
});
