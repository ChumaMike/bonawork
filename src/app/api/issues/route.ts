import { z } from "zod";
import { schema } from "@/server/db";
import { ok, queryOf, route } from "@/server/http";
import { findInstitution, loadBundles } from "@/server/reports/common";
import { begin } from "@/server/request";
import { REPORT_STATUS_FOR, toReportCategory, toSummary } from "@/server/view";

const Filter = z.object({
  query: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  schoolId: z.string().optional(),
  sort: z.enum(["recent", "most_affected"]).optional(),
});

/** `GET /api/issues` — public feed with `IssueFilter` query parameters. */
export const GET = route(async (request) => {
  const filter = Filter.parse(queryOf(request));
  const scope = await begin(request);
  const institution = filter.schoolId
    ? await findInstitution(scope.ctx.db, filter.schoolId)
    : null;
  if (filter.schoolId && !institution) return ok([]);
  const status = filter.status ? REPORT_STATUS_FOR[filter.status] : undefined;
  const category = filter.category ? toReportCategory(filter.category) : undefined;
  const rows = await scope.ctx.db.select().from(schema.reports);
  const bundles = await loadBundles(
    scope.ctx.db,
    rows.filter(
      (r) =>
        (!institution || r.institutionId === institution.id) &&
        (!status || r.status === status) &&
        (!category || r.category === category),
    ),
  );
  const needle = filter.query?.trim().toLowerCase();
  const summaries = bundles
    .map((b) => toSummary(b, scope.viewerId))
    .filter(
      (s) =>
        !needle ||
        `${s.title} ${s.schoolName} ${s.schoolTown} ${s.reference} ${s.location}`
          .toLowerCase()
          .includes(needle),
    );
  summaries.sort((a, b) =>
    filter.sort === "most_affected"
      ? b.endorsements - a.endorsements || b.updatedAt.localeCompare(a.updatedAt)
      : b.updatedAt.localeCompare(a.updatedAt),
  );
  return ok(summaries);
});
