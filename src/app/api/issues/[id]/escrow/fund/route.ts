import { address } from "@solana/kit";
import { z } from "zod";
import { requirePermission, requireSession } from "@/server/auth/session";
import {
  MIN_CHALLENGE_SECONDS,
  escrowDeps,
  escrowRoute,
  fundCaseWithDemoFunder,
  loadPublicEscrow,
} from "@/server/escrow";
import { CentsSchema } from "@/server/escrow/http";
import { ok, parseJson } from "@/server/http";
import { begin } from "@/server/request";

const Body = z.object({
  materials: CentsSchema,
  completion: CentsSchema,
  challengeSeconds: z.number().int().default(MIN_CHALLENGE_SECONDS),
  /**
   * Who Check 1 (materials on site) releases to: "contractor" (default),
   * "demo_supplier" (the server-held demo supplier key, devnet), or a
   * supplier's Solana address. Check 2 always releases to the contractor.
   */
  materialsPayee: z
    .union([
      z.literal("contractor"),
      z.literal("demo_supplier"),
      z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address."),
    ])
    .default("contractor"),
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
    materialsPayee:
      body.materialsPayee === "contractor" || body.materialsPayee === "demo_supplier"
        ? { kind: body.materialsPayee }
        : { kind: "supplier", address: address(body.materialsPayee) },
  });
  return ok(await loadPublicEscrow(deps, id), 201);
});
