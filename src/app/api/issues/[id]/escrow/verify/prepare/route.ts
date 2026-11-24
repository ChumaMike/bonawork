import { z } from "zod";
import { requirePermission, requireSession } from "@/server/auth/session";
import {
  escrowDeps,
  escrowRoute,
  getReviewerSigner,
  prepareCaseVerify,
} from "@/server/escrow";
import { TrancheIndexSchema } from "@/server/escrow/http";
import { HttpError, ok, parseJson } from "@/server/http";
import { begin } from "@/server/request";

const Body = z.object({
  index: TrancheIndexSchema,
  note: z.string().trim().min(1).max(2000),
});

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/verify/prepare` — reviewer (`repair:verify`).
 * Body `{ index, note }`. Returns the unsigned verify transaction (base64),
 * the review fingerprint, Bona Guardian's findings, plain description lines,
 * and which key will sign. Nothing is signed or sent.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "repair:verify");
  const body = await parseJson(request, Body);
  const signer = await getReviewerSigner();
  if (!signer)
    throw new HttpError("ledger_unavailable", "No reviewer key is configured.");
  return ok(
    await prepareCaseVerify(await escrowDeps(), {
      reportIdOrReference: id,
      index: body.index,
      note: body.note,
      actorId: session.actor.id,
      signer,
    }),
  );
});
