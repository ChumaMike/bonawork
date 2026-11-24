export * from "./escrow-service";
export * from "./keeper";
export * from "./keys";
export * from "./network";
export * from "./refund-check";
export * from "./rpc";

import {
  EscrowStateError,
  GuardianRejectedError,
  MissingKeyError,
} from "./escrow-service";
import {
  BonaProgramFailure,
  SolanaTransactionError,
  SolanaUnavailableError,
} from "./rpc";

export type SolanaErrorKind =
  | "network_unavailable"
  | "program_refused"
  | "guardian_rejected"
  | "invalid_state"
  | "not_configured"
  | "transaction_failed"
  | "unknown";

/**
 * A safe, plain-English error for the API layer. Program refusals use
 * `bonaErrorMessage`; nothing here ever contains key material.
 */
export function describeSolanaError(error: unknown): {
  kind: SolanaErrorKind;
  message: string;
  programError?: string | null;
} {
  if (error instanceof SolanaUnavailableError)
    return { kind: "network_unavailable", message: error.message };
  if (error instanceof BonaProgramFailure)
    return {
      kind: "program_refused",
      message: error.message,
      programError: error.errorName,
    };
  if (error instanceof GuardianRejectedError)
    return { kind: "guardian_rejected", message: error.message };
  if (error instanceof EscrowStateError)
    return { kind: "invalid_state", message: error.message };
  if (error instanceof MissingKeyError)
    return { kind: "not_configured", message: error.message };
  if (error instanceof SolanaTransactionError)
    return { kind: "transaction_failed", message: error.message };
  return { kind: "unknown", message: "Something went wrong sending this to Solana." };
}
