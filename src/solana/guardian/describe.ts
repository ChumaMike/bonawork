/**
 * Plain-English effects of a transaction, one sentence group per instruction.
 * On-chain data is passed in by the caller; nothing is fetched here.
 */
import type { Address } from "@solana/kit";
import {
  getTransferCheckedInstructionDataDecoder,
  getTransferInstructionDataDecoder,
} from "@solana-program/token";

import type { EscrowAccount, TrancheAccount } from "../accounts";
import {
  DisputeOutcome,
  formatRand,
  MINT_DECIMALS,
  type BonaInstructionArgs,
  type BonaInstructionName,
} from "../program";
import {
  decodeTransaction,
  type DecodedInstruction,
  type DecodedTransaction,
  type TransactionInput,
} from "./decode";
import { short } from "./policy";

export type DescribeContext = {
  /** Tranche accounts by address. */
  tranches?: Record<string, TrancheAccount>;
  /** Escrow accounts by address. */
  escrows?: Record<string, EscrowAccount>;
};

export function describeTransaction(
  tx: TransactionInput | DecodedTransaction,
  context: DescribeContext = {},
): string[] {
  const decoded =
    typeof tx === "string" || tx instanceof Uint8Array ? decodeTransaction(tx) : tx;
  return decoded.instructions.map((ix) => describeInstruction(ix, context));
}

function describeInstruction(ix: DecodedInstruction, ctx: DescribeContext): string {
  switch (ix.program) {
    case "BonaWork":
      if (!ix.name || ix.decodeError)
        return "A BonaWork call that could not be read. Do not sign it.";
      return describeBona(ix, ctx);
    case "SPL Token":
      return describeToken(ix);
    case "Compute Budget":
      return "Sets the network fee budget. No money moves.";
    case "Associated Token":
      return "Creates a token account if it does not exist yet. The fee payer covers its rent.";
    case "System":
      return "Uses the System program, which can move SOL between wallets.";
    default:
      return `Calls an unknown program (${short(ix.programAddress)}). Its effects cannot be checked.`;
  }
}

function account(ix: DecodedInstruction, name: string): Address | undefined {
  return ix.accounts.find((a) => a.name === name)?.address;
}

function trancheLabel(
  ix: DecodedInstruction,
  ctx: DescribeContext,
): { label: string; amount?: bigint } {
  const address = account(ix, "tranche");
  const data = address ? ctx.tranches?.[address] : undefined;
  if (!data)
    return {
      label: address ? `the payment stage at ${short(address)}` : "a payment stage",
    };
  return {
    label: `tranche ${data.index + 1} (${formatRand(data.amount)})`,
    amount: data.amount,
  };
}

function describeBona(ix: DecodedInstruction, ctx: DescribeContext): string {
  const name = ix.name as BonaInstructionName;
  const tranche = trancheLabel(ix, ctx);
  const escrowAddress = account(ix, "escrow");
  const escrow = escrowAddress ? ctx.escrows?.[escrowAddress] : undefined;

  switch (name) {
    case "verify_tranche": {
      const args = ix.args as BonaInstructionArgs["verify_tranche"];
      const window = escrow
        ? `a ${escrow.challengeSeconds}-second challenge window`
        : "the challenge window";
      return (
        `No money moves now. This starts ${window} for ${tranche.label}. ` +
        `It approves evidence revision ${args.expectedRevision} only.`
      );
    }
    case "claim_tranche": {
      const args = ix.args as BonaInstructionArgs["claim_tranche"];
      return (
        `No money moves now. The contractor says the work for ${tranche.label} is done ` +
        `(evidence revision ${args.expectedRevision + 1}). An independent reviewer still has to check it.`
      );
    }
    case "open_dispute":
      return `No money moves now. This freezes ${tranche.label} until the dispute is settled.`;
    case "resolve_dispute": {
      const args = ix.args as BonaInstructionArgs["resolve_dispute"];
      return args.outcome === DisputeOutcome.Refund
        ? `Returns ${tranche.label} from the escrow vault to the funder.`
        : `No money moves now. This sends ${tranche.label} back for a fresh independent review.`;
    }
    case "release_tranche": {
      const to = escrow ? ` (${short(escrow.contractor)})` : "";
      return `Pays ${tranche.label} from the escrow vault to the contractor${to}. Nobody can change the amount or the recipient.`;
    }
    case "refund_expired":
      return `Returns ${tranche.label} from the escrow vault to the funder.`;
    case "cancel_unfunded":
      return "Cancels an escrow that missed its funding deadline. Whatever reached the vault goes back to the funder.";
    case "activate_funding":
      return "No money moves. This marks the escrow as funded, once the vault holds the full amount.";
    case "create_escrow": {
      const args = ix.args as BonaInstructionArgs["create_escrow"];
      const [a, b] = args.amounts;
      return (
        `Creates an escrow for ${formatRand(a + b)} in two payments: ${formatRand(a)} for materials ` +
        `and ${formatRand(b)} for completion. No money moves yet.`
      );
    }
    case "set_reviewer": {
      const args = ix.args as BonaInstructionArgs["set_reviewer"];
      return `${args.active ? "Lists" : "Switches off"} reviewer ${short(args.wallet)}${args.active ? " as active" : ""}.`;
    }
    case "set_paused": {
      const args = ix.args as BonaInstructionArgs["set_paused"];
      return args.paused
        ? "Pauses new escrows. Existing escrows keep working."
        : "Allows new escrows again.";
    }
    case "initialize_config":
      return "Sets up the BonaWork program settings. No money moves.";
  }
}

function describeToken(ix: DecodedInstruction): string {
  const from = ix.accounts[0]?.address;
  try {
    if (ix.name === "Transfer") {
      const { amount } = getTransferInstructionDataDecoder().decode(ix.data);
      const to = ix.accounts[1]?.address;
      return `Moves ${amount} token units from ${maybeShort(from)} to ${maybeShort(to)}.`;
    }
    if (ix.name === "TransferChecked") {
      const { amount, decimals } = getTransferCheckedInstructionDataDecoder().decode(
        ix.data,
      );
      const to = ix.accounts[2]?.address;
      const shown =
        decimals === MINT_DECIMALS ? formatRand(amount) : `${amount} token units`;
      return `Moves ${shown} from ${maybeShort(from)} to ${maybeShort(to)}.`;
    }
  } catch {
    // Fall through to the generic sentence.
  }
  return `Changes a token account directly (${ix.name ?? "unknown token instruction"}).`;
}

function maybeShort(a: Address | undefined): string {
  return a ? short(a) : "an unknown account";
}
