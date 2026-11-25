import { address } from "@solana/kit";
import { z } from "zod";
import { requirePermission, requireSession } from "@/server/auth/session";
import {
  MIN_CHALLENGE_SECONDS,
  escrowDeps,
  escrowRoute,
  prepareWalletFunding,
} from "@/server/escrow";
import {
  CentsSchema,
  MaterialsPayeeSchema,
  toMaterialsPayee,
} from "@/server/escrow/http";
import { ok, parseJson } from "@/server/http";
import { begin } from "@/server/request";

const SolanaAddress = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address.");

const Body = z.object({
  materials: CentsSchema,
  completion: CentsSchema,
  challengeSeconds: z.number().int().default(MIN_CHALLENGE_SECONDS),
  materialsPayee: MaterialsPayeeSchema,
  /** The funder's own wallet (Pollar). It becomes the escrow's funder. */
  funderWallet: SolanaAddress,
});

export const maxDuration = 60;

/**
 * `POST /api/issues/:id/escrow/fund/wallet` — funder (`order:approve`).
 * Step 1 of funding from the funder's own wallet: creates the escrow with that
 * wallet as funder and returns where to send how much (`escrow`, `vault`,
 * `amount` in cents of sandbox rand). The wallet then sends the transfer and
 * the browser calls `fund/wallet/confirm` with its signature.
 */
export const POST = escrowRoute<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "order:approve");
  const body = await parseJson(request, Body);
  return ok(
    await prepareWalletFunding(await escrowDeps(), {
      reportIdOrReference: id,
      funderWallet: address(body.funderWallet),
      terms: {
        amounts: [body.materials, body.completion],
        challengeSeconds: body.challengeSeconds,
      },
      actorId: session.actor.id,
      materialsPayee: toMaterialsPayee(body.materialsPayee),
    }),
    201,
  );
});
