import { z } from "zod";
import { ReviewRecordSchema } from "@/features/agent/contracts";
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
  /** The reviewer's finished checklist for this check. Its hash is the review_hash. */
  review: ReviewRecordSchema,
});

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/verify/prepare` — reviewer (`repair:verify`).
 * Body `{ index, review }`: the finished checklist for that check. The server
 * hashes it (the review_hash), then returns the unsigned verify transaction
 * (base64), Bona Guardian's findings (which bind that hash), plain description
 * lines, and which key will sign. Nothing is signed or sent. A checklist with
 * an unchecked or failed item is refused.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  requirePermission(requireSession(scope.session), "repair:verify");
  const body = await parseJson(request, Body);
  const signer = await getReviewerSigner();
  if (!signer)
    throw new HttpError("ledger_unavailable", "No reviewer key is configured.");
  return ok(
    await prepareCaseVerify(await escrowDeps(), {
      reportIdOrReference: id,
      index: body.index,
      review: body.review,
      signer,
    }),
  );
});
