/**
 * Route plumbing for the escrow API: the adapter's Solana errors become the
 * usual error envelope, with the program's own refusal kept in the body.
 *
 *   { "error": { "code": "conflict", "message": "…", "kind": "program_refused",
 *                "programError": "ChallengeWindowActive", "findings": [] } }
 */
import { address } from "@solana/kit";
import { z } from "zod";

import { API_ERROR_STATUS, type ApiErrorCode } from "@/shared";
import {
  GuardianRejectedError,
  describeSolanaError,
  getEscrowService,
} from "@/server/solana";

import { getContext } from "../context";
import { HttpError, route } from "../http";
import type { EscrowDeps, MaterialsPayee } from "./cases";

export async function escrowDeps(): Promise<EscrowDeps> {
  const ctx = await getContext();
  try {
    return { db: ctx.db, service: await getEscrowService() };
  } catch {
    throw new HttpError(
      "ledger_unavailable",
      "The Solana escrow is not configured on this server.",
    );
  }
}

export function escrowErrorResponse(error: unknown): Response | null {
  if (error instanceof HttpError || error instanceof z.ZodError) return null;
  const described = describeSolanaError(error);
  if (described.kind === "unknown") return null;
  const code: ApiErrorCode =
    described.kind === "program_refused" ||
    described.kind === "invalid_state" ||
    described.kind === "guardian_rejected"
      ? "conflict"
      : "ledger_unavailable";
  return Response.json(
    {
      error: {
        code,
        message: described.message,
        kind: described.kind,
        programError: described.programError ?? null,
        findings: error instanceof GuardianRejectedError ? error.findings : [],
      },
    },
    { status: API_ERROR_STATUS[code] },
  );
}

type Handler<P> = (request: Request, params: P) => Promise<Response>;

/** `route()` plus Solana error mapping. */
export function escrowRoute<P extends Record<string, string> = Record<string, never>>(
  handler: Handler<P>,
) {
  return route<P>(async (request, params) => {
    try {
      return await handler(request, params);
    } catch (error) {
      const response = escrowErrorResponse(error);
      if (response) return response;
      throw error;
    }
  });
}

export const TrancheIndexSchema = z.union([z.literal(0), z.literal(1)]);

/** Rand amounts from a form, as integer cents. */
export const CentsSchema = z
  .union([z.string().regex(/^\d{1,9}$/), z.number().int().nonnegative()])
  .transform((v) => BigInt(v));

/**
 * Who Check 1 (materials on site) releases to: "contractor" (default),
 * "demo_supplier" (the server-held demo supplier key, devnet), or a
 * supplier's Solana address. Check 2 always releases to the contractor.
 */
export const MaterialsPayeeSchema = z
  .union([
    z.literal("contractor"),
    z.literal("demo_supplier"),
    z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address."),
  ])
  .default("contractor");

export function toMaterialsPayee(
  value: z.infer<typeof MaterialsPayeeSchema>,
): MaterialsPayee {
  return value === "contractor" || value === "demo_supplier"
    ? { kind: value }
    : { kind: "supplier", address: address(value) };
}
