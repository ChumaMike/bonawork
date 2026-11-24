import { describe, expect, it, vi } from "vitest";

import { TrancheState, type TrancheAccount } from "@/solana";

import { BonaProgramFailure, SolanaUnavailableError } from "./rpc";
import { decideTranche, runEscrowWatchdog } from "./keeper";
import type { OnChainCase } from "./escrow-service";

const n = (v: number) => BigInt(v);
const funded = { funded: true, cancelled: false, disputeSeconds: 3_600 };

function tranche(over: Partial<TrancheAccount> = {}) {
  return {
    index: 0,
    state: TrancheState.Pending,
    challengeUntil: n(0),
    verificationDeadline: n(10_000),
    disputedAt: n(0),
    ...over,
  };
}

describe("decideTranche", () => {
  it("releases a verified tranche only once the challenge window has ended", () => {
    const t = tranche({ state: TrancheState.Verified, challengeUntil: n(1_000) });
    expect(decideTranche(funded, t, null, n(999)).action).toBe("none");
    expect(decideTranche(funded, t, null, n(1_000)).action).toBe("release");
    expect(decideTranche(funded, t, null, n(5_000)).action).toBe("release");
  });

  it("never refunds a verified tranche, even after its verification deadline", () => {
    const t = tranche({
      state: TrancheState.Verified,
      challengeUntil: n(50_000),
      verificationDeadline: n(100),
    });
    expect(decideTranche(funded, t, null, n(20_000)).action).toBe("none");
  });

  it("refunds a pending or claimed tranche after its verification deadline", () => {
    for (const state of [TrancheState.Pending, TrancheState.Claimed]) {
      const t = tranche({ state, verificationDeadline: n(500) });
      expect(decideTranche(funded, t, null, n(499)).action).toBe("none");
      expect(decideTranche(funded, t, null, n(500)).action).toBe("refund");
    }
  });

  it("refunds the completion tranche when the materials tranche was refunded", () => {
    const t = tranche({ index: 1 });
    expect(decideTranche(funded, t, { state: TrancheState.Refunded }, n(1)).action).toBe(
      "refund",
    );
    expect(decideTranche(funded, t, { state: TrancheState.Released }, n(1)).action).toBe(
      "none",
    );
    // Tranche 0 ignores a "prior".
    expect(
      decideTranche(funded, tranche({ index: 0 }), { state: TrancheState.Refunded }, n(1))
        .action,
    ).toBe("none");
  });

  it("refunds a dispute only after the dispute timeout", () => {
    const t = tranche({ state: TrancheState.Disputed, disputedAt: n(1_000) });
    expect(decideTranche(funded, t, null, n(4_599)).action).toBe("none");
    expect(decideTranche(funded, t, null, n(4_600)).action).toBe("refund");
  });

  it("does nothing for settled tranches, unfunded or cancelled escrows", () => {
    for (const state of [TrancheState.Released, TrancheState.Refunded]) {
      expect(decideTranche(funded, tranche({ state }), null, n(99_999)).action).toBe(
        "none",
      );
    }
    const due = tranche({ verificationDeadline: n(1) });
    expect(decideTranche({ ...funded, funded: false }, due, null, n(5)).action).toBe(
      "none",
    );
    expect(decideTranche({ ...funded, cancelled: true }, due, null, n(5)).action).toBe(
      "none",
    );
  });
});

describe("runEscrowWatchdog", () => {
  const escrow = "11111111111111111111111111111112" as never;
  const onChain = (states: [TrancheState, TrancheState]) =>
    ({
      account: funded,
      tranches: states.map((state, index) => ({
        index,
        account: tranche({ index, state, challengeUntil: n(10) }),
      })),
    }) as unknown as OnChainCase;

  it("retries network trouble up to three times, then reports failure", async () => {
    const release = vi.fn().mockRejectedValue(new SolanaUnavailableError());
    const out = await runEscrowWatchdog(
      {
        getCaseOnChain: async () =>
          onChain([TrancheState.Verified, TrancheState.Pending]),
        releaseTranche: release,
        refundExpired: vi.fn(),
      },
      [escrow],
      { now: () => n(100), retryDelayMs: 0 },
    );
    expect(release).toHaveBeenCalledTimes(3);
    expect(out[0]).toMatchObject({ status: "failed", attempts: 3 });
    expect(out[1]).toMatchObject({ status: "skipped" });
  });

  it("stops at once when the program refuses", async () => {
    const release = vi.fn().mockRejectedValue(new BonaProgramFailure(6022));
    const out = await runEscrowWatchdog(
      {
        getCaseOnChain: async () =>
          onChain([TrancheState.Verified, TrancheState.Pending]),
        releaseTranche: release,
        refundExpired: vi.fn(),
      },
      [escrow],
      { now: () => n(100), retryDelayMs: 0 },
    );
    expect(release).toHaveBeenCalledTimes(1);
    expect(out[0].error).toBe("The money is locked until the challenge window ends.");
  });

  it("sends a release once it is allowed", async () => {
    const step = { signature: "sig", explorerUrl: "url" };
    const out = await runEscrowWatchdog(
      {
        getCaseOnChain: async () =>
          onChain([TrancheState.Verified, TrancheState.Pending]),
        releaseTranche: vi.fn().mockResolvedValue(step),
        refundExpired: vi.fn(),
      },
      [escrow],
      { now: () => n(100) },
    );
    expect(out[0]).toMatchObject({ status: "sent", attempts: 1, step });
  });
});
