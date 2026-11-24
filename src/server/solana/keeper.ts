/**
 * Escrow Watchdog: the keeper that settles payment stages when the program's
 * rules allow it. Deterministic rules only, no AI.
 *
 * For each tranche of each escrow it decides (pure function) whether a release
 * or a refund is now allowed, then builds the transaction, checks it (Bona
 * Guardian for releases, the refund check for refunds), simulates, and sends
 * it with the keeper key. At most three attempts, and only network trouble is
 * retried: a program refusal or a Guardian finding stops at once.
 */
import type { Address } from "@solana/kit";

import { TrancheState, type EscrowAccount, type TrancheAccount } from "@/solana";

import {
  EscrowStateError,
  GuardianRejectedError,
  type EscrowService,
  type SentStep,
  type TrancheIndex,
} from "./escrow-service";
import { BonaProgramFailure } from "./rpc";

export type KeeperAction = "release" | "refund" | "none";

export type KeeperDecision = { action: KeeperAction; reason: string };

/**
 * What the keeper may do with one tranche at time `now` (unix seconds).
 * Mirrors release_tranche and refund_expired in programs/bonawork/src/lib.rs.
 */
export function decideTranche(
  escrow: Pick<EscrowAccount, "funded" | "cancelled" | "disputeSeconds">,
  tranche: Pick<
    TrancheAccount,
    "index" | "state" | "challengeUntil" | "verificationDeadline" | "disputedAt"
  >,
  prior: Pick<TrancheAccount, "state"> | null,
  now: bigint,
): KeeperDecision {
  if (!escrow.funded) return { action: "none", reason: "The escrow is not funded." };
  if (escrow.cancelled) return { action: "none", reason: "The escrow was cancelled." };
  switch (tranche.state) {
    case TrancheState.Released:
    case TrancheState.Refunded:
      return { action: "none", reason: "Already settled." };
    case TrancheState.Verified:
      return now >= tranche.challengeUntil
        ? { action: "release", reason: "Verified and the challenge window has ended." }
        : {
            action: "none",
            reason: `Verified; the challenge window ends in ${tranche.challengeUntil - now}s.`,
          };
    case TrancheState.Pending:
    case TrancheState.Claimed: {
      if (now >= tranche.verificationDeadline) {
        return {
          action: "refund",
          reason: "Not verified before the verification deadline.",
        };
      }
      if (tranche.index === 1 && prior?.state === TrancheState.Refunded) {
        return { action: "refund", reason: "The materials stage was refunded." };
      }
      return { action: "none", reason: "Waiting for a claim or a review." };
    }
    case TrancheState.Disputed: {
      const timeout = tranche.disputedAt + BigInt(escrow.disputeSeconds);
      return now >= timeout
        ? { action: "refund", reason: "The dispute was not resolved in time." }
        : { action: "none", reason: "A dispute is open and can still be resolved." };
    }
    default:
      return { action: "none", reason: "Unknown state." };
  }
}

export type KeeperOutcome = {
  escrow: Address;
  index: TrancheIndex;
  decision: KeeperDecision;
  status: "sent" | "skipped" | "failed";
  attempts: number;
  step?: SentStep;
  error?: string;
};

export type WatchdogOptions = {
  /** Unix seconds. Defaults to the wall clock. */
  now?: () => bigint;
  maxAttempts?: number;
  retryDelayMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Errors that will not change by trying again. */
function isFinal(error: unknown): boolean {
  return (
    error instanceof BonaProgramFailure ||
    error instanceof GuardianRejectedError ||
    error instanceof EscrowStateError
  );
}

/** Scans the given escrows and settles every tranche the rules allow. */
export async function runEscrowWatchdog(
  service: Pick<EscrowService, "getCaseOnChain" | "releaseTranche" | "refundExpired">,
  escrows: readonly Address[],
  {
    now = () => BigInt(Math.floor(Date.now() / 1000)),
    maxAttempts = 3,
    retryDelayMs = 2_000,
  }: WatchdogOptions = {},
): Promise<KeeperOutcome[]> {
  const outcomes: KeeperOutcome[] = [];
  for (const escrow of escrows) {
    let onChain;
    try {
      onChain = await service.getCaseOnChain(escrow);
    } catch (error) {
      for (const index of [0, 1] as const) {
        outcomes.push({
          escrow,
          index,
          decision: { action: "none", reason: "Could not read the escrow." },
          status: "failed",
          attempts: 0,
          error: (error as Error).message,
        });
      }
      continue;
    }
    for (const index of [0, 1] as const) {
      const tranche = onChain.tranches[index].account;
      const prior = index === 1 ? onChain.tranches[0].account : null;
      const decision = decideTranche(onChain.account, tranche, prior, now());
      if (decision.action === "none") {
        outcomes.push({ escrow, index, decision, status: "skipped", attempts: 0 });
        continue;
      }
      const act =
        decision.action === "release" ? service.releaseTranche : service.refundExpired;
      let attempts = 0;
      let lastError: unknown;
      let step: SentStep | undefined;
      while (attempts < maxAttempts && !step) {
        attempts++;
        try {
          step = await act(escrow, index);
        } catch (error) {
          lastError = error;
          if (isFinal(error)) break;
          if (attempts < maxAttempts) await sleep(retryDelayMs * attempts);
        }
      }
      outcomes.push(
        step
          ? { escrow, index, decision, status: "sent", attempts, step }
          : {
              escrow,
              index,
              decision,
              status: "failed",
              attempts,
              error: (lastError as Error)?.message ?? String(lastError),
            },
      );
    }
  }
  return outcomes;
}
