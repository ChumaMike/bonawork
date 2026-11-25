import { z } from "zod";
import { escrowDeps, escrowRoute, releaseCaseTranche } from "@/server/escrow";
import { TrancheIndexSchema } from "@/server/escrow/http";
import { ok, parseJson } from "@/server/http";

const Body = z.object({ index: TrancheIndexSchema });

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/release` — anyone, no sign-in. Body `{ index }`.
 * The keeper key asks the program to release a verified stage as a sandbox
 * payout to the payee fixed in the escrow for that check. Before the challenge window ends the program
 * refuses: 409 with `programError: "ChallengeWindowActive"`.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const body = await parseJson(request, Body);
  return ok(
    await releaseCaseTranche(await escrowDeps(), {
      reportIdOrReference: id,
      index: body.index,
    }),
    201,
  );
});
