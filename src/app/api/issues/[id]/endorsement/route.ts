import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { ok, parseJson, route } from "@/server/http";
import { setEndorsement } from "@/server/reports/endorse";
import { begin } from "@/server/request";

const Body = z.object({ affected: z.boolean() });

/** `PUT /api/issues/:id/endorsement` — "I'm affected too" (reporters only, once, not own report). */
export const PUT = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requireSession(scope.session);
  const { affected } = await parseJson(request, Body);
  return ok(
    await setEndorsement(scope.ctx.db, {
      reportIdOrReference: id,
      actor: session.actor,
      affected,
    }),
  );
});
