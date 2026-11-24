/**
 * Route plumbing for the escrow API: the adapter's Solana errors become the
 * usual error envelope, with the program's own refusal kept in the body.
 *
 *   { "error": { "code": "conflict", "message": "…", "kind": "program_refused",
 *                "programError": "ChallengeWindowActive", "findings": [] } }
 */
import { z } from "zod";

import { API_ERROR_STATUS, type ApiErrorCode } from "@/shared";
import {
  GuardianRejectedError,
  describeSolanaError,
  getEscrowService,
} from "@/server/solana";

import { getContext } from "../context";
import { HttpError, route } from "../http";
import type { EscrowDeps } from "./cases";

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
