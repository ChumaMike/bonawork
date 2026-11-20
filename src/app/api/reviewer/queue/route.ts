import { desc, eq } from "drizzle-orm";
import { requirePermission, requireSession } from "@/server/auth/session";
import { schema } from "@/server/db";
import { ok, route } from "@/server/http";
import { begin, issuesOf } from "@/server/request";

/** `GET /api/reviewer/queue` — issues awaiting independent review (`repair_claimed`). */
export const GET = route(async (request) => {
  const scope = await begin(request);
  requirePermission(requireSession(scope.session), "repair:verify");
  const rows = await scope.ctx.db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.status, "repair_claimed"))
    .orderBy(desc(schema.reports.updatedAt));
  return ok(await issuesOf(scope, rows));
});
