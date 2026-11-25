import { z } from "zod";
import { requirePermission, requireSession } from "@/server/auth/session";
import {
  MIN_CHALLENGE_SECONDS,
  escrowDeps,
  escrowRoute,
  fundCaseWithDemoFunder,
  loadPublicEscrow,
} from "@/server/escrow";
import {
  CentsSchema,
  MaterialsPayeeSchema,
  toMaterialsPayee,
} from "@/server/escrow/http";
import { ok, parseJson } from "@/server/http";
import { begin } from "@/server/request";

const Body = z.object({
  materials: CentsSchema,
  completion: CentsSchema,
  challengeSeconds: z.number().int().default(MIN_CHALLENGE_SECONDS),
  materialsPayee: MaterialsPayeeSchema,
});

/** Solana needs several seconds per step; funding takes up to four steps. */
export const maxDuration = 120;

/**
 * `POST /api/issues/:id/escrow/fund` — funder (`order:approve`). Body
 * `{ materials, completion }` in cents of SANDBOX demo rand, optional
 * `challengeSeconds` and `materialsPayee`. Creates the escrow, cashes in sandbox rand to the demo
 * funder, moves it into the vault and activates. No real money moves.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "order:approve");
  const body = await parseJson(request, Body);
  const deps = await escrowDeps();
  await fundCaseWithDemoFunder(deps, {
    reportIdOrReference: id,
    terms: {
      amounts: [body.materials, body.completion],
      challengeSeconds: body.challengeSeconds,
    },
    actorId: session.actor.id,
    materialsPayee: toMaterialsPayee(body.materialsPayee),
  });
  return ok(await loadPublicEscrow(deps, id), 201);
});
