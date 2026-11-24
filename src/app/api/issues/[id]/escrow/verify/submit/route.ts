import { z } from "zod";
import { requirePermission, requireSession } from "@/server/auth/session";
import {
  escrowDeps,
  escrowRoute,
  getReviewerSigner,
  signAndSubmitCaseVerify,
} from "@/server/escrow";
import { TrancheIndexSchema } from "@/server/escrow/http";
import { HttpError, ok, parseJson } from "@/server/http";
import { begin } from "@/server/request";

const Body = z.object({
  index: TrancheIndexSchema,
  transaction: z.string().min(1).max(4000),
  reviewHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/verify/submit` — reviewer (`repair:verify`).
 * Body: the transaction and review fingerprint from `prepare`. Bona Guardian
 * checks it again, the reviewer signer signs (today the demo reviewer key on
 * devnet), the feepayer adds its signature and it is sent.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  requirePermission(requireSession(scope.session), "repair:verify");
  const body = await parseJson(request, Body);
  const signer = await getReviewerSigner();
  if (!signer)
    throw new HttpError("ledger_unavailable", "No reviewer key is configured.");
  const sent = await signAndSubmitCaseVerify(await escrowDeps(), {
    reportIdOrReference: id,
    index: body.index,
    transaction: body.transaction,
    reviewHash: body.reviewHash,
    signer,
  });
  return ok({ ...sent, signer: { kind: signer.kind, label: signer.label } }, 201);
});
