/**
 * The keeper's check before it signs a refund: the transaction must do exactly
 * one refund_expired to the escrow's own funder, signed by the keeper alone.
 * The same idea as Bona Guardian's checkReleaseTransaction, for refunds.
 */
import type { Address } from "@solana/kit";

import {
  ACCOUNT_LAYOUTS,
  BONAWORK_PROGRAM_ADDRESS,
  decodeTransaction,
  findAssociatedTokenAddress,
  findVaultAddress,
  short,
  type DecodedTransaction,
  type EscrowAccount,
  type Finding,
  type GuardianResult,
  type TransactionInput,
} from "@/solana";

export type RefundExpectation = {
  /** The keeper wallet: pays the fee and is the `caller` account. */
  feePayer: Address;
  escrow: Address;
  tranche: Address;
  /** Tranche 0, passed when refunding tranche 1. */
  priorTranche?: Address;
  escrowAccount: Pick<EscrowAccount, "funder" | "mint">;
};

export async function checkRefundTransaction(
  tx: TransactionInput | DecodedTransaction,
  expected: RefundExpectation,
): Promise<GuardianResult> {
  const findings: Finding[] = [];
  const add = (code: Finding["code"], message: string) =>
    findings.push({ code, severity: "error", message });

  let decoded: DecodedTransaction;
  try {
    decoded =
      typeof tx === "string" || tx instanceof Uint8Array ? decodeTransaction(tx) : tx;
  } catch {
    add("UNREADABLE", "This transaction could not be read.");
    return { ok: false, findings };
  }

  const { funder, mint } = expected.escrowAccount;
  const [vault, funderAta] = await Promise.all([
    findVaultAddress(expected.escrow, mint),
    findAssociatedTokenAddress(funder, mint),
  ]);
  const want: Record<string, Address> = {
    caller: expected.feePayer,
    escrow: expected.escrow,
    tranche: expected.tranche,
    priorTranche: expected.priorTranche ?? BONAWORK_PROGRAM_ADDRESS,
    vault,
    mint,
    funder,
    funderAta,
  };

  if (decoded.feePayer !== expected.feePayer) {
    add("FEE_PAYER_MISMATCH", `The fee would be paid by ${short(decoded.feePayer)}.`);
  }
  if (decoded.instructions.length !== 1) {
    add(
      "WRONG_INSTRUCTION_COUNT",
      `Expected exactly one instruction, found ${decoded.instructions.length}.`,
    );
  }
  const ix = decoded.instructions[0];
  if (ix && (ix.program !== "BonaWork" || ix.name !== "refund_expired")) {
    add(
      "WRONG_INSTRUCTION",
      `Instruction 1 is ${ix.name ?? ix.program}, not refund_expired.`,
    );
  }
  if (ix && ix.name === "refund_expired") {
    if (ix.decodeError) add("MALFORMED_INSTRUCTION", ix.decodeError);
    const layout = ACCOUNT_LAYOUTS.refund_expired;
    if (ix.accounts.length !== layout.length) {
      add(
        "WRONG_ACCOUNT_COUNT",
        `refund_expired should list ${layout.length} accounts, it lists ${ix.accounts.length}.`,
      );
    }
    layout.forEach((spec, i) => {
      const actual = ix.accounts[i];
      if (!actual) return;
      const expectedAddress = want[spec.name] ?? spec.fixed;
      if (actual.address !== expectedAddress) {
        add(
          spec.name === "funder" || spec.name === "funderAta"
            ? "WRONG_RECIPIENT"
            : "WRONG_ACCOUNT",
          `Account ${i + 1} (${spec.name}) should be ${short(String(expectedAddress) as Address)}, but it is ${short(actual.address)}.`,
        );
      }
      if (actual.role !== spec.role) {
        add(
          "WRONG_ACCOUNT_ROLE",
          `Account ${i + 1} (${spec.name}) has the wrong permission.`,
        );
      }
    });
  }
  for (const signer of decoded.signers) {
    if (signer !== expected.feePayer) {
      add("UNEXPECTED_SIGNER", `An extra wallet (${short(signer)}) is asked to sign.`);
    }
  }
  return { ok: findings.length === 0, findings, decoded };
}
