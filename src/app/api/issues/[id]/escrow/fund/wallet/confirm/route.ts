import { z } from "zod";
import { requirePermission, requireSession } from "@/server/auth/session";
import {
  confirmWalletFundingAndActivate,
  escrowDeps,
  escrowRoute,
  loadPublicEscrow,
} from "@/server/escrow";
import { ok, parseJson } from "@/server/http";
import { begin } from "@/server/request";

const Body = z.object({
  /** The funder wallet's transfer into the vault. */
  signature: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "Not a transaction signature."),
});

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/fund/wallet/confirm` — funder (`order:approve`).
 * Reads the transfer back from Solana (`verifyPollarFunding`: exactly the
 * escrow's total in BDZAR, from the escrow's funder wallet to its vault) and
 * only then activates the escrow. 409 with the reason when the check fails.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  requirePermission(requireSession(scope.session), "order:approve");
  const body = await parseJson(request, Body);
  const deps = await escrowDeps();
  await confirmWalletFundingAndActivate(deps, {
    reportIdOrReference: id,
    transferSignature: body.signature,
  });
  return ok(await loadPublicEscrow(deps, id), 201);
});
