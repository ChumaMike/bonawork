import {
  escrowDeps,
  escrowRoute,
  loadPublicEscrow,
  sweepCaseSurplus,
} from "@/server/escrow";
import { ok } from "@/server/http";

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/sweep` — anyone, no sign-in. The keeper key asks
 * the program to return sandbox rand in the vault beyond what the open checks
 * are owed to the funder. The program only ever pays the escrow's own funder.
 * `sent: null` when there was nothing to return.
 */
export const POST = escrowRoute<{ id: string }>(async (_request, { id }) => {
  const deps = await escrowDeps();
  const sent = await sweepCaseSurplus(deps, { reportIdOrReference: id });
  return ok({ sent, escrow: await loadPublicEscrow(deps, id) }, sent ? 201 : 200);
});
