/**
 * Reads the Compute Budget instructions of a transaction, so the Guardian can cap
 * the priority fee a signer agrees to pay and state it in plain words.
 */
import {
  ComputeBudgetInstruction,
  getSetComputeUnitLimitInstructionDataDecoder,
  getSetComputeUnitPriceInstructionDataDecoder,
} from "@solana-program/compute-budget";

import type { DecodedInstruction, DecodedTransaction } from "./decode";

/** Highest compute unit limit the Guardian accepts. */
export const MAX_COMPUTE_UNIT_LIMIT = 400_000;
/** Highest priority fee the Guardian accepts, in micro-lamports per compute unit. */
export const MAX_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 100_000;

/** Network defaults when no limit is set: 200 000 units per non-budget instruction, at most 1.4 million. */
const DEFAULT_UNITS_PER_INSTRUCTION = 200_000;
const MAX_TRANSACTION_UNITS = 1_400_000;
const LAMPORTS_PER_SOL = 1_000_000_000;

const LIMIT_DATA_LENGTH = 1 + 4;
const PRICE_DATA_LENGTH = 1 + 8;

export type ComputeBudgetSummary = {
  /** Every SetComputeUnitLimit value, in order. */
  unitLimits: number[];
  /** Every SetComputeUnitPrice value (micro-lamports per unit), in order. */
  unitPrices: bigint[];
  /** Compute Budget instructions that are not a well-formed limit or price. */
  other: DecodedInstruction[];
  /** The limit the network will apply. */
  effectiveUnitLimit: number;
  /** Highest priority fee the fee payer can be charged, in lamports (rounded up). */
  maxPriorityFeeLamports: bigint;
};

export function summarizeComputeBudget(tx: DecodedTransaction): ComputeBudgetSummary {
  const unitLimits: number[] = [];
  const unitPrices: bigint[] = [];
  const other: DecodedInstruction[] = [];
  let workInstructions = 0;

  for (const ix of tx.instructions) {
    if (ix.program !== "Compute Budget") {
      workInstructions++;
      continue;
    }
    try {
      if (
        ix.name ===
          ComputeBudgetInstruction[ComputeBudgetInstruction.SetComputeUnitLimit] &&
        ix.data.length === LIMIT_DATA_LENGTH
      ) {
        unitLimits.push(
          getSetComputeUnitLimitInstructionDataDecoder().decode(ix.data).units,
        );
        continue;
      }
      if (
        ix.name ===
          ComputeBudgetInstruction[ComputeBudgetInstruction.SetComputeUnitPrice] &&
        ix.data.length === PRICE_DATA_LENGTH
      ) {
        unitPrices.push(
          getSetComputeUnitPriceInstructionDataDecoder().decode(ix.data).microLamports,
        );
        continue;
      }
    } catch {
      // Unreadable data counts as "other" below.
    }
    other.push(ix);
  }

  // With duplicates the worst case is assumed: the largest value of each.
  const effectiveUnitLimit =
    unitLimits.length > 0
      ? Math.min(Math.max(...unitLimits), MAX_TRANSACTION_UNITS)
      : Math.min(workInstructions * DEFAULT_UNITS_PER_INSTRUCTION, MAX_TRANSACTION_UNITS);
  const price = unitPrices.reduce((max, p) => (p > max ? p : max), BigInt(0));
  const microLamports = BigInt(effectiveUnitLimit) * price;
  const million = BigInt(1_000_000);
  const maxPriorityFeeLamports = (microLamports + million - BigInt(1)) / million;

  return { unitLimits, unitPrices, other, effectiveUnitLimit, maxPriorityFeeLamports };
}

/** "1 234 lamports (0.000001234 SOL)". */
export function formatLamports(lamports: bigint): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  const grouped = lamports.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} lamports (${sol.toFixed(9).replace(/\.?0+$/, "")} SOL)`;
}
