/**
 * Bona Guardian rules. Deterministic checks run before a key signs: a transaction
 * passes only if it does exactly the one thing the signer agreed to and nothing else.
 */
import { isSignerRole, isWritableRole, type Address } from "@solana/kit";

import type { EscrowAccount } from "../accounts";
import { bytesEqual, type Bytes32 } from "../borsh";
import {
  ACCOUNT_LAYOUTS,
  BONAWORK_PROGRAM_ADDRESS,
  findAssociatedTokenAddress,
  findReviewerPda,
  findVaultAddress,
  type BonaInstructionName,
  type VerifyTrancheArgs,
} from "../program";
import {
  formatLamports,
  MAX_COMPUTE_UNIT_LIMIT,
  MAX_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
  summarizeComputeBudget,
} from "./compute-budget";
import {
  decodeTransaction,
  GuardianDecodeError,
  type DecodedInstruction,
  type DecodedTransaction,
  type TransactionInput,
} from "./decode";

export type FindingSeverity = "error" | "warning";

export type FindingCode =
  | "UNREADABLE"
  | "FEE_PAYER_MISMATCH"
  | "TOKEN_PROGRAM_CALLED"
  | "UNEXPECTED_PROGRAM"
  | "UNEXPECTED_COMPUTE_BUDGET"
  | "DUPLICATE_COMPUTE_BUDGET"
  | "COMPUTE_LIMIT_TOO_HIGH"
  | "PRIORITY_FEE_TOO_HIGH"
  | "WRONG_INSTRUCTION_COUNT"
  | "WRONG_INSTRUCTION"
  | "MALFORMED_INSTRUCTION"
  | "WRONG_ACCOUNT_COUNT"
  | "WRONG_ACCOUNT"
  | "WRONG_ACCOUNT_ROLE"
  | "WRONG_TRANCHE"
  | "WRONG_ESCROW"
  | "WRONG_RECIPIENT"
  | "STALE_REVISION"
  | "EVIDENCE_MISMATCH"
  | "MISSING_REVIEW_HASH"
  | "MISSING_SIGNER"
  | "UNEXPECTED_SIGNER"
  | "UNEXPECTED_WRITABLE";

export type Finding = { code: FindingCode; severity: FindingSeverity; message: string };

export type GuardianResult = {
  /** True only when there is no error finding. */
  ok: boolean;
  findings: Finding[];
  /** The decoded transaction, when it could be read. */
  decoded?: DecodedTransaction;
};

export type VerifyExpectation = {
  feePayer: Address;
  reviewer: Address;
  escrow: Address;
  tranche: Address;
  revision: number;
  evidenceHash: Bytes32;
  matchHash: Bytes32;
  /** When given, the review fingerprint must match too. */
  reviewHash?: Bytes32;
};

export type ReleaseExpectation = {
  /** The keeper wallet: pays the fee and is the `caller` account. */
  feePayer: Address;
  escrow: Address;
  tranche: Address;
  /** On-chain escrow data, read by the caller. Fixes the mint and the contractor. */
  escrowAccount: Pick<EscrowAccount, "contractor" | "mint">;
};

/** At most one limit and one price, both under the caps, and no other budget instruction. */
function checkComputeBudget(
  decoded: DecodedTransaction,
  add: (code: FindingCode, message: string) => void,
) {
  const budget = summarizeComputeBudget(decoded);
  for (const ix of budget.other) {
    add(
      "UNEXPECTED_COMPUTE_BUDGET",
      `Instruction ${ix.index + 1} changes the fee budget in a way that is not allowed (${ix.name ?? "unreadable"}).`,
    );
  }
  if (budget.unitLimits.length > 1) {
    add("DUPLICATE_COMPUTE_BUDGET", "The compute limit is set more than once.");
  }
  if (budget.unitPrices.length > 1) {
    add("DUPLICATE_COMPUTE_BUDGET", "The priority fee is set more than once.");
  }
  if (budget.unitLimits.some((u) => u > MAX_COMPUTE_UNIT_LIMIT)) {
    add(
      "COMPUTE_LIMIT_TOO_HIGH",
      `The compute limit is above ${MAX_COMPUTE_UNIT_LIMIT} units, which this step never needs.`,
    );
  }
  if (budget.unitPrices.some((p) => p > BigInt(MAX_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS))) {
    add(
      "PRIORITY_FEE_TOO_HIGH",
      `The priority fee is above ${MAX_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS} micro-lamports per unit. ` +
        `It could cost up to ${formatLamports(budget.maxPriorityFeeLamports)}.`,
    );
  }
}

/** Checks a transaction the reviewer is about to sign to verify one tranche. */
export async function checkVerifyTransaction(
  tx: TransactionInput | DecodedTransaction,
  expected: VerifyExpectation,
): Promise<GuardianResult> {
  const reviewerRecord = await findReviewerPda(expected.reviewer);
  return checkSingleInstruction(tx, {
    instruction: "verify_tranche",
    feePayer: expected.feePayer,
    accounts: {
      reviewer: expected.reviewer,
      reviewerRecord,
      escrow: expected.escrow,
      tranche: expected.tranche,
    },
    checkArgs: (args, findings) =>
      checkVerifyArgs(args as VerifyTrancheArgs, expected, findings),
  });
}

/** Checks a transaction the keeper is about to sign to release one tranche. */
export async function checkReleaseTransaction(
  tx: TransactionInput | DecodedTransaction,
  expected: ReleaseExpectation,
): Promise<GuardianResult> {
  const { contractor, mint } = expected.escrowAccount;
  const [vault, contractorAta] = await Promise.all([
    findVaultAddress(expected.escrow, mint),
    findAssociatedTokenAddress(contractor, mint),
  ]);
  return checkSingleInstruction(tx, {
    instruction: "release_tranche",
    feePayer: expected.feePayer,
    accounts: {
      caller: expected.feePayer,
      escrow: expected.escrow,
      tranche: expected.tranche,
      vault,
      mint,
      contractor,
      contractorAta,
    },
  });
}

// ---------------------------------------------------------------------- core

type SingleInstructionRule = {
  instruction: BonaInstructionName;
  feePayer: Address;
  /** Expected address per named account. Fixed program accounts come from the layout. */
  accounts: Record<string, Address>;
  checkArgs?: (args: unknown, findings: Finding[]) => void;
};

const ACCOUNT_LABELS: Record<string, { code: FindingCode; label: string }> = {
  tranche: { code: "WRONG_TRANCHE", label: "the payment stage (tranche)" },
  escrow: { code: "WRONG_ESCROW", label: "the escrow" },
  contractor: { code: "WRONG_RECIPIENT", label: "the contractor" },
  contractorAta: { code: "WRONG_RECIPIENT", label: "the contractor's token account" },
  vault: { code: "WRONG_ACCOUNT", label: "the escrow vault" },
  reviewer: { code: "WRONG_ACCOUNT", label: "the reviewer" },
  reviewerRecord: { code: "WRONG_ACCOUNT", label: "the reviewer record" },
  caller: { code: "WRONG_ACCOUNT", label: "the caller" },
  mint: { code: "WRONG_ACCOUNT", label: "the token mint" },
};

function checkSingleInstruction(
  tx: TransactionInput | DecodedTransaction,
  rule: SingleInstructionRule,
): GuardianResult {
  let decoded: DecodedTransaction;
  try {
    decoded =
      typeof tx === "string" || tx instanceof Uint8Array ? decodeTransaction(tx) : tx;
  } catch (cause) {
    const message =
      cause instanceof GuardianDecodeError
        ? cause.message
        : "This transaction could not be read.";
    return result([{ code: "UNREADABLE", severity: "error", message }]);
  }

  const findings: Finding[] = [];
  const add = (code: FindingCode, message: string, severity: FindingSeverity = "error") =>
    findings.push({ code, severity, message });

  if (decoded.feePayer !== rule.feePayer) {
    add(
      "FEE_PAYER_MISMATCH",
      `The network fee would be paid by ${short(decoded.feePayer)}, not the expected wallet.`,
    );
  }

  // Only our program and fee-budget settings may appear.
  const ours: DecodedInstruction[] = [];
  for (const ix of decoded.instructions) {
    if (ix.program === "BonaWork") {
      ours.push(ix);
    } else if (ix.program === "Compute Budget") {
      continue; // Checked as a whole below.
    } else if (ix.program === "SPL Token") {
      add(
        "TOKEN_PROGRAM_CALLED",
        `Instruction ${ix.index + 1} would ${ix.name?.startsWith("Transfer") ? "move tokens" : "change a token account"} ` +
          `directly (${ix.name ?? "unknown token instruction"}). This step must not move money. Do not sign.`,
      );
    } else {
      add(
        "UNEXPECTED_PROGRAM",
        `Instruction ${ix.index + 1} calls another program (${ix.program === "Unknown" ? short(ix.programAddress) : ix.program}). ` +
          "Only BonaWork is expected.",
      );
    }
  }

  checkComputeBudget(decoded, add);

  if (ours.length !== 1) {
    add(
      "WRONG_INSTRUCTION_COUNT",
      `Expected exactly one BonaWork instruction, found ${ours.length}.`,
    );
  }
  const target = ours.find((ix) => ix.name === rule.instruction);
  for (const ix of ours) {
    if (ix.name !== rule.instruction) {
      add(
        "WRONG_INSTRUCTION",
        `Instruction ${ix.index + 1} is ${ix.name ?? "an unknown BonaWork call"}, not ${rule.instruction}.`,
      );
    }
  }

  const layout = ACCOUNT_LAYOUTS[rule.instruction];
  const expectedAddress = (name: string, i: number) =>
    rule.accounts[name] ?? layout[i].fixed ?? BONAWORK_PROGRAM_ADDRESS;

  if (target) {
    if (target.decodeError) {
      add(
        "MALFORMED_INSTRUCTION",
        `The ${rule.instruction} data is malformed: ${target.decodeError}`,
      );
    } else {
      rule.checkArgs?.(target.args, findings);
    }

    if (target.accounts.length !== layout.length) {
      add(
        "WRONG_ACCOUNT_COUNT",
        `${rule.instruction} should list ${layout.length} accounts, it lists ${target.accounts.length}.`,
      );
    }
    layout.forEach((spec, i) => {
      const actual = target.accounts[i];
      if (!actual) return;
      const want = expectedAddress(spec.name, i);
      if (actual.address !== want) {
        const known = ACCOUNT_LABELS[spec.name] ?? {
          code: "WRONG_ACCOUNT" as const,
          label: spec.name,
        };
        add(
          known.code,
          `Account ${i + 1} should be ${known.label} (${short(want)}), but it is ${short(actual.address)}.`,
        );
      }
      if (actual.role !== spec.role) {
        add(
          "WRONG_ACCOUNT_ROLE",
          `Account ${i + 1} (${spec.name}) has the wrong signer or write permission.`,
        );
      }
    });
  }

  // Signers: the fee payer plus whoever the layout says must sign. Nobody else.
  const allowedSigners = new Set<Address>([rule.feePayer]);
  const allowedWritable = new Set<Address>([rule.feePayer]);
  layout.forEach((spec, i) => {
    const addr = expectedAddress(spec.name, i);
    if (isSignerRole(spec.role)) allowedSigners.add(addr);
    if (isWritableRole(spec.role)) allowedWritable.add(addr);
  });
  for (const signer of allowedSigners) {
    if (!decoded.signers.includes(signer))
      add("MISSING_SIGNER", `${short(signer)} is expected to sign but is not asked to.`);
  }
  for (const signer of decoded.signers) {
    if (!allowedSigners.has(signer))
      add("UNEXPECTED_SIGNER", `An extra wallet (${short(signer)}) is asked to sign.`);
  }
  for (const writable of decoded.writableAccounts) {
    if (!allowedWritable.has(writable)) {
      add(
        "UNEXPECTED_WRITABLE",
        `The transaction could change an account it has no reason to touch (${short(writable)}).`,
      );
    }
  }

  return result(findings, decoded);
}

function checkVerifyArgs(
  args: VerifyTrancheArgs,
  expected: VerifyExpectation,
  findings: Finding[],
) {
  if (args.expectedRevision !== expected.revision) {
    findings.push({
      code: "STALE_REVISION",
      severity: "error",
      message: `This approves evidence revision ${args.expectedRevision}, but the latest is revision ${expected.revision}.`,
    });
  }
  if (
    !bytesEqual(args.expectedEvidenceHash, expected.evidenceHash) ||
    !bytesEqual(args.expectedMatchHash, expected.matchHash)
  ) {
    findings.push({
      code: "EVIDENCE_MISMATCH",
      severity: "error",
      message:
        "The evidence fingerprints in this transaction are not the ones you reviewed.",
    });
  }
  if (args.reviewHash.every((b) => b === 0)) {
    findings.push({
      code: "MISSING_REVIEW_HASH",
      severity: "error",
      message: "The review fingerprint is empty.",
    });
  } else if (expected.reviewHash && !bytesEqual(args.reviewHash, expected.reviewHash)) {
    findings.push({
      code: "EVIDENCE_MISMATCH",
      severity: "error",
      message: "The review fingerprint is not the one for your review.",
    });
  }
}

function result(findings: Finding[], decoded?: DecodedTransaction): GuardianResult {
  return { ok: !findings.some((f) => f.severity === "error"), findings, decoded };
}

export function short(a: Address): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
