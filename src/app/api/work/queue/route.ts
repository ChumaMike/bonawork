import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { listWorkQueue } from "@/server/procurement/queue";
import { begin } from "@/server/request";

/**
 * `GET /api/work/queue` — the cases that need the signed-in person now
 * (`WorkQueueItem[]`). Any role with `procurement:read`; empty for roles
 * with nothing to do. Rows carry no amount.
 */
export const GET = route(async (request) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "procurement:read");
  return ok(await listWorkQueue(scope.ctx.db, session.actor));
});
