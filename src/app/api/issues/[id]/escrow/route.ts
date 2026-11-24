import { escrowDeps, escrowRoute, loadPublicEscrow } from "@/server/escrow";
import { ok } from "@/server/http";

/**
 * `GET /api/issues/:id/escrow` — public. The case's escrow on Solana devnet as
 * the chain has it: addresses, sandbox amounts (cents as strings), tranche
 * states and times (unix seconds as strings), and every signature sent, with
 * Explorer links. `data` is null when the case has no escrow.
 */
export const GET = escrowRoute<{ id: string }>(async (_request, { id }) => {
  const deps = await escrowDeps();
  return ok(await loadPublicEscrow(deps, id), 200, { "cache-control": "no-store" });
});
