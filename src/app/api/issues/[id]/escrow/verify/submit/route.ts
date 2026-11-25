import { z } from "zod";
import { ReviewRecordSchema } from "@/features/agent/contracts";
import { requirePermission, requireSession } from "@/server/auth/session";
import {
  escrowDeps,
  escrowRoute,
  getReviewerSigner,
  signAndSubmitCaseVerify,
  syncCaseStatusAfterVerify,
} from "@/server/escrow";
import { TrancheIndexSchema } from "@/server/escrow/http";
import { HttpError, ok, parseJson } from "@/server/http";
import { begin, deps } from "@/server/request";

const Body = z.object({
  index: TrancheIndexSchema,
  transaction: z.string().min(1).max(4000),
  /** The same finished checklist sent to prepare; the server hashes it again. */
  review: ReviewRecordSchema,
});

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/verify/submit` — reviewer (`repair:verify`).
 * Body: the transaction from `prepare` and the same checklist. Bona Guardian
 * checks the transaction again against the recomputed review hash, the
 * reviewer signer signs (today the demo reviewer key on devnet), the feepayer
 * adds its signature and it is sent. After Check 2, a case in
 * `repair_claimed` becomes `verified`; `caseStatus` says what happened.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "repair:verify");
  const body = await parseJson(request, Body);
  const signer = await getReviewerSigner();
  if (!signer)
    throw new HttpError("ledger_unavailable", "No reviewer key is configured.");
  const sent = await signAndSubmitCaseVerify(await escrowDeps(), {
    reportIdOrReference: id,
    index: body.index,
    transaction: body.transaction,
    review: body.review,
    signer,
  });
  const caseStatus = await syncCaseStatusAfterVerify(deps(scope.ctx), {
    reportIdOrReference: id,
    index: body.index,
    actor: session.actor,
    sent,
    review: body.review,
  });
  return ok(
    { ...sent, signer: { kind: signer.kind, label: signer.label }, caseStatus },
    201,
  );
});
