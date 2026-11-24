import { z } from "zod";
import { escrowDeps, escrowRoute, refundCaseTranche } from "@/server/escrow";
import { TrancheIndexSchema } from "@/server/escrow/http";
import { ok, parseJson } from "@/server/http";

const Body = z.object({ index: TrancheIndexSchema });

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/refund` — anyone, no sign-in. Body `{ index }`.
 * Returns an expired, blocked or timed-out stage to the funder. The program
 * refuses while the stage can still be verified.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const body = await parseJson(request, Body);
  return ok(
    await refundCaseTranche(await escrowDeps(), {
      reportIdOrReference: id,
      index: body.index,
    }),
    201,
  );
});
