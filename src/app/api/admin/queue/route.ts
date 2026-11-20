import { desc, eq } from "drizzle-orm";
import { requirePermission, requireSession } from "@/server/auth/session";
import { schema } from "@/server/db";
import { HttpError, ok, route } from "@/server/http";
import { begin, issuesOf } from "@/server/request";

/** `GET /api/admin/queue` — every issue of the signed-in school administrator's institution. */
export const GET = route(async (request) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "report:read:school");
  const institutionId = session.user.institutionId;
  if (!institutionId)
    throw new HttpError("forbidden", "This account is not attached to a school.");
  const rows = await scope.ctx.db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.institutionId, institutionId))
    .orderBy(desc(schema.reports.updatedAt));
  return ok(await issuesOf(scope, rows));
});
