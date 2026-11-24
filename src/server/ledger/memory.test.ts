import { describe, expect, it } from "vitest";
import { BlockchainReceiptSchema, type Hex32 } from "@/shared";
import { fail, ok } from "../http";
import { LedgerError, MEMORY_CHAIN_ID, createMemoryLedger } from "./memory";

const reportId = "00000000-0000-4000-8000-000000000001";
const institutionId = "00000000-0000-4000-8000-000000000009";
const hex = (byte: string): Hex32 => `0x${byte.repeat(32)}`;

const rejects = (promise: Promise<unknown>, contractError: string) =>
  expect(promise).rejects.toMatchObject({ name: "LedgerError", contractError });

async function registered() {
  const ledger = createMemoryLedger();
  await ledger.registerReport({ reportId, institutionId, commitment: hex("a1") });
  return ledger;
}

describe("in-memory ledger", () => {
  it("runs the full lifecycle and returns valid, clearly non-Solana receipts", async () => {
    const ledger = await registered();
    expect(await ledger.statusOf(reportId)).toBe("reported");
    await ledger.registerEvidence({ reportId, digest: hex("e1"), kind: "report" });
    await ledger.acknowledgeReport({ reportId });
    await ledger.recordInterimProtection({ reportId, commitment: hex("b1") });
    expect(await ledger.statusOf(reportId)).toBe("acknowledged");
    await ledger.claimRepair({ reportId, commitment: hex("c1") });
    await ledger.disputeRepair({ reportId, reviewCommitment: hex("d1") });
    expect(await ledger.statusOf(reportId)).toBe("disputed");
    await ledger.claimRepair({ reportId, commitment: hex("c2") });
    const receipt = await ledger.verifyRepair({ reportId, reviewCommitment: hex("d2") });
    expect(await ledger.statusOf(reportId)).toBe("verified");
    expect(BlockchainReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(receipt).toMatchObject({ chainId: MEMORY_CHAIN_ID, event: "RepairVerified" });
    expect(await ledger.getReceipt(receipt.txId, receipt.event)).toEqual(receipt);
  });

  it("refuses to verify a repair nobody has claimed", async () => {
    const ledger = await registered();
    await rejects(
      ledger.verifyRepair({ reportId, reviewCommitment: hex("d1") }),
      "InvalidState",
    );
    await ledger.acknowledgeReport({ reportId });
    await rejects(
      ledger.verifyRepair({ reportId, reviewCommitment: hex("d1") }),
      "InvalidState",
    );
  });

  it("refuses a repair claim before the report is acknowledged", async () => {
    const ledger = await registered();
    await rejects(
      ledger.claimRepair({ reportId, commitment: hex("c1") }),
      "InvalidState",
    );
  });

  it("freezes a verified report", async () => {
    const ledger = await registered();
    await ledger.acknowledgeReport({ reportId });
    await ledger.claimRepair({ reportId, commitment: hex("c1") });
    await ledger.verifyRepair({ reportId, reviewCommitment: hex("d1") });
    await rejects(
      ledger.registerEvidence({ reportId, digest: hex("e9"), kind: "review" }),
      "InvalidState",
    );
    await rejects(
      ledger.claimRepair({ reportId, commitment: hex("c2") }),
      "InvalidState",
    );
  });

  it("rejects duplicates and unknown reports", async () => {
    const ledger = await registered();
    await rejects(
      ledger.registerReport({ reportId, institutionId, commitment: hex("a2") }),
      "ReportAlreadyRegistered",
    );
    await ledger.registerEvidence({ reportId, digest: hex("e1"), kind: "report" });
    await rejects(
      ledger.registerEvidence({ reportId, digest: hex("e1"), kind: "report" }),
      "DuplicateEvidence",
    );
    await rejects(
      ledger.acknowledgeReport({ reportId: "00000000-0000-4000-8000-000000000002" }),
      "ReportNotFound",
    );
    expect(await ledger.statusOf("00000000-0000-4000-8000-000000000002")).toBe("none");
    expect(LedgerError.fromContract("InvalidState", "x").message).toContain(
      "InvalidState",
    );
    expect(LedgerError.fromContract("InvalidState", "x").code).toBe("invalid_state");
  });
});

describe("response helpers", () => {
  it("wraps data and maps error codes to statuses", async () => {
    expect(await ok({ a: 1 }).json()).toEqual({ data: { a: 1 } });
    const response = fail("invalid_transition", "A repair must be claimed first.");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "invalid_transition", message: "A repair must be claimed first." },
    });
  });
});
