/**
 * Bona Guardian: turn a serialized Solana transaction into something a person
 * (or a rule) can check before anyone signs it. Works fully offline.
 */
import {
  decompileTransactionMessage,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  isSignerRole,
  isWritableRole,
  type AccountRole,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  ComputeBudgetInstruction,
  identifyComputeBudgetInstruction,
} from "@solana-program/compute-budget";
import {
  AssociatedTokenInstruction,
  identifyAssociatedTokenInstruction,
  identifyTokenInstruction,
  TokenInstruction,
} from "@solana-program/token";

import {
  ACCOUNT_LAYOUTS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  BONAWORK_PROGRAM_ADDRESS,
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  decodeInstructionData,
  identifyBonaInstruction,
  SYSTEM_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "../program";

export type ProgramLabel =
  "BonaWork" | "SPL Token" | "Associated Token" | "Compute Budget" | "System" | "Unknown";

export type DecodedAccountMeta = {
  address: Address;
  role: AccountRole;
  signer: boolean;
  writable: boolean;
  /** Account name from the program layout, for BonaWork instructions. */
  name?: string;
};

export type DecodedInstruction = {
  index: number;
  programAddress: Address;
  program: ProgramLabel;
  /** "verify_tranche" for ours, "Transfer" for SPL Token, null when unknown. */
  name: string | null;
  /** Decoded Borsh args for BonaWork instructions, otherwise null. */
  args: unknown;
  accounts: DecodedAccountMeta[];
  data: Uint8Array;
  /** Set when the instruction claims to be ours but its data does not decode. */
  decodeError?: string;
};

export type DecodedTransaction = {
  version: "legacy" | 0 | 1;
  feePayer: Address;
  /** Every account that must sign, fee payer first. */
  signers: Address[];
  /** Every account the transaction may write to, fee payer included. */
  writableAccounts: Address[];
  staticAccounts: Address[];
  instructions: DecodedInstruction[];
};

export class GuardianDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardianDecodeError";
  }
}

export type TransactionInput = Uint8Array | string;

/** Wire bytes, or a base64 string of them. */
export function decodeTransaction(input: TransactionInput): DecodedTransaction {
  let compiled;
  try {
    const bytes =
      typeof input === "string"
        ? Uint8Array.from(getBase64Encoder().encode(input.trim()))
        : input;
    const tx = getTransactionDecoder().decode(bytes);
    compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  } catch (cause) {
    throw new GuardianDecodeError(
      `This is not a readable Solana transaction (${String(cause)}).`,
    );
  }

  if (
    "addressTableLookups" in compiled &&
    (compiled.addressTableLookups?.length ?? 0) > 0
  ) {
    throw new GuardianDecodeError(
      "This transaction loads accounts from a lookup table, so it cannot be checked offline.",
    );
  }

  const { header, staticAccounts } = compiled;
  const numSigners = header.numSignerAccounts;
  const writableSignerEnd = numSigners - header.numReadonlySignerAccounts;
  const writableNonSignerEnd =
    staticAccounts.length - header.numReadonlyNonSignerAccounts;
  const signers = staticAccounts.slice(0, numSigners);
  const writableAccounts = [
    ...staticAccounts.slice(0, writableSignerEnd),
    ...staticAccounts.slice(numSigners, writableNonSignerEnd),
  ];

  let messageInstructions: readonly Instruction[];
  try {
    messageInstructions = decompileTransactionMessage(compiled).instructions;
  } catch (cause) {
    throw new GuardianDecodeError(
      `The transaction message could not be read (${String(cause)}).`,
    );
  }

  const instructions = messageInstructions.map((ix, index): DecodedInstruction => {
    const data = Uint8Array.from(ix.data ?? []);
    const accounts: DecodedAccountMeta[] = (ix.accounts ?? []).map((meta) => ({
      address: meta.address,
      role: meta.role,
      signer: isSignerRole(meta.role),
      writable: isWritableRole(meta.role),
    }));
    const decoded: DecodedInstruction = {
      index,
      programAddress: ix.programAddress,
      program: labelProgram(ix.programAddress),
      name: null,
      args: null,
      accounts,
      data,
    };
    nameInstruction(decoded);
    return decoded;
  });

  return {
    version: compiled.version,
    feePayer: staticAccounts[0],
    signers,
    writableAccounts,
    staticAccounts,
    instructions,
  };
}

function labelProgram(program: Address): ProgramLabel {
  switch (program) {
    case BONAWORK_PROGRAM_ADDRESS:
      return "BonaWork";
    case TOKEN_PROGRAM_ADDRESS:
      return "SPL Token";
    case ASSOCIATED_TOKEN_PROGRAM_ADDRESS:
      return "Associated Token";
    case COMPUTE_BUDGET_PROGRAM_ADDRESS:
      return "Compute Budget";
    case SYSTEM_PROGRAM_ADDRESS:
      return "System";
    default:
      return "Unknown";
  }
}

function nameInstruction(ix: DecodedInstruction): void {
  try {
    switch (ix.program) {
      case "BonaWork": {
        const name = identifyBonaInstruction(ix.data);
        if (!name) {
          ix.decodeError = "Unknown BonaWork instruction.";
          return;
        }
        ix.name = name;
        const layout = ACCOUNT_LAYOUTS[name];
        ix.accounts.forEach((meta, i) => {
          if (layout[i]) meta.name = layout[i].name;
        });
        ix.args = decodeInstructionData(ix.data).args;
        return;
      }
      case "SPL Token":
        ix.name = TokenInstruction[identifyTokenInstruction(ix.data)] ?? null;
        return;
      case "Associated Token":
        ix.name =
          AssociatedTokenInstruction[identifyAssociatedTokenInstruction(ix.data)] ?? null;
        return;
      case "Compute Budget":
        ix.name =
          ComputeBudgetInstruction[identifyComputeBudgetInstruction(ix.data)] ?? null;
        return;
      default:
        return;
    }
  } catch (cause) {
    ix.decodeError = cause instanceof Error ? cause.message : String(cause);
  }
}
