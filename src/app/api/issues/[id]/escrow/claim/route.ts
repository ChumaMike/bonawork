import { z } from "zod";
import { requirePermission, requireSession } from "@/server/auth/session";
import { claimCaseTranche, escrowDeps, escrowRoute } from "@/server/escrow";
import { TrancheIndexSchema } from "@/server/escrow/http";
import { ok, parseJson } from "@/server/http";
import { begin } from "@/server/request";

const Body = z.object({
  index: TrancheIndexSchema,
  note: z.string().trim().min(1).max(2000),
});

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/claim` — contractor (`invoice:submit`). Body
 * `{ index, note }`. Signed with the demo contractor key and the match key.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  requirePermission(requireSession(scope.session), "invoice:submit");
  const body = await parseJson(request, Body);
  const sent = await claimCaseTranche(await escrowDeps(), {
    reportIdOrReference: id,
    index: body.index,
    note: body.note,
  });
  return ok(sent, 201);
});
