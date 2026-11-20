import { ok, route } from "@/server/http";
import { loadBundles, requireReport } from "@/server/reports/common";
import { begin } from "@/server/request";
import { toIssue } from "@/server/view";

/** `GET /api/issues/:idOrReference` — public issue detail. */
export const GET = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const report = await requireReport(scope.ctx.db, id);
  const [bundle] = await loadBundles(scope.ctx.db, [report]);
  return ok(toIssue(bundle, scope.viewerId));
});
