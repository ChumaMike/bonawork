import { asc } from "drizzle-orm";
import { getContext } from "@/server/context";
import { schema } from "@/server/db";
import { ok, queryOf, route } from "@/server/http";
import { toSchool } from "@/server/view";

/** `GET /api/schools?q=` — public school search. */
export const GET = route(async (request) => {
  const needle = (queryOf(request).q ?? "").trim().toLowerCase();
  const ctx = await getContext();
  const rows = await ctx.db
    .select()
    .from(schema.institutions)
    .orderBy(asc(schema.institutions.name));
  const matched = needle
    ? rows.filter((s) =>
        `${s.name} ${s.town} ${s.district}`.toLowerCase().includes(needle),
      )
    : rows;
  return ok(matched.map(toSchool));
});
