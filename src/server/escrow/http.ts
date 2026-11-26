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

/** Words Solana uses when a paying key holds too little SOL for the fee or rent. */
const LOW_SOL =
  /insufficient (funds|lamports)|InsufficientFundsFor(Fee|Rent)|no record of a prior credit/i;

/** True when a Solana failure says a platform key ran out of devnet SOL. */
export function isLowSolError(error: unknown): boolean {
  const seen = new Set<unknown>();
  const texts: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (value == null || depth > 5 || seen.has(value)) return;
    if (typeof value === "string") {
      texts.push(value);
      return;
    }
    if (typeof value !== "object") return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
      return;
    }
    const obj = value as Record<string, unknown>;
    for (const [key, v] of Object.entries(obj)) {
      if (typeof v === "string") texts.push(v);
      else if (["cause", "context", "err", "logs", "InstructionError"].includes(key)) {
        walk(v, depth + 1);
      }
    }
    if (value instanceof Error) {
      texts.push(value.message);
      walk((value as { cause?: unknown }).cause, depth + 1);
    }
  };
  walk(error, 0);
  return texts.some((t) => LOW_SOL.test(t));
}

export const LOW_SOL_TEXT = "Demo wallet needs a top-up, try again later.";

export function escrowErrorResponse(error: unknown): Response | null {
  if (error instanceof HttpError || error instanceof z.ZodError) return null;
  if (isLowSolError(error)) {
    console.warn("[escrow] a platform key is low on devnet SOL:", String(error));
    return Response.json(
      {
        error: {
          code: "ledger_unavailable",
          message: LOW_SOL_TEXT,
          kind: "low_sol",
          programError: null,
          findings: [],
        },
      },
      { status: API_ERROR_STATUS.ledger_unavailable },
    );
  }
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
