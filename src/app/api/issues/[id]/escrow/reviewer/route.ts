import { address } from "@solana/kit";
import { z } from "zod";
import { requirePermission, requireSession } from "@/server/auth/session";
import { escrowDeps, escrowRoute, reassignCaseReviewer } from "@/server/escrow";
import { ok, parseJson } from "@/server/http";
import { begin } from "@/server/request";

const Body = z.object({
  newReviewer: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address."),
});

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/reviewer` — school (`case:update`). Body
 * `{ newReviewer }`. Replaces the escrow's reviewer; the program needs the
 * platform admin key and the escrow's school key (a DEMO key on devnet) to sign
 * together, and the new reviewer must be listed and active. Refused on chain
 * while a check is verified or disputed (`ReviewerChangeBlocked`).
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  requirePermission(requireSession(scope.session), "case:update");
  const body = await parseJson(request, Body);
  return ok(
    await reassignCaseReviewer(await escrowDeps(), {
      reportIdOrReference: id,
      newReviewer: address(body.newReviewer),
    }),
    201,
  );
});
