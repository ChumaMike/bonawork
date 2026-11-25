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
  DEFAULT_PUBKEY,
  DisputeOutcome,
  findAssociatedTokenAddress,
  formatRand,
  MINT_DECIMALS,
  type BonaInstructionArgs,
  type BonaInstructionName,
} from "../program";
import { formatLamports, summarizeComputeBudget } from "./compute-budget";
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

/**
 * One line per instruction, then one line with the most the fee payer can be
 * charged as a priority fee. Async because recipient token accounts are re-derived.
 */
export async function describeTransaction(
  tx: TransactionInput | DecodedTransaction,
  context: DescribeContext = {},
): Promise<string[]> {
  const decoded =
    typeof tx === "string" || tx instanceof Uint8Array ? decodeTransaction(tx) : tx;
  const lines = await Promise.all(
    decoded.instructions.map((ix) => describeInstruction(ix, context)),
  );
  return [...lines, describePriorityFee(decoded)];
}

function describePriorityFee(decoded: DecodedTransaction): string {
  const { maxPriorityFeeLamports } = summarizeComputeBudget(decoded);
  if (maxPriorityFeeLamports === BigInt(0)) {
    return "No priority fee is set. Only the base network fee applies.";
  }
  return (
    `Maximum priority fee: ${formatLamports(maxPriorityFeeLamports)}, ` +
    `paid by ${short(decoded.feePayer)} on top of the base network fee.`
  );
}

async function describeInstruction(
  ix: DecodedInstruction,
  ctx: DescribeContext,
): Promise<string> {
  switch (ix.program) {
    case "BonaWork":
      if (!ix.name || ix.decodeError)
        return "A BonaWork call that could not be read. Do not sign it.";
      return describeBona(ix, ctx);
    case "SPL Token":
      return describeToken(ix);
    case "Compute Budget":
      return describeComputeBudget(ix);
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

function trancheLabel(ix: DecodedInstruction, ctx: DescribeContext): string {
  const address = account(ix, "tranche");
  const data = address ? ctx.tranches?.[address] : undefined;
  if (!data)
    return address ? `the payment stage at ${short(address)}` : "a payment stage";
  return `${CHECK_NAMES[data.index] ?? `payment stage ${data.index + 1}`} (${formatRand(data.amount)})`;
}

/** The two reviewer checks, one per tranche. */
export const CHECK_NAMES = ["Check 1: Materials on site", "Check 2: Work done"] as const;

function trancheIndex(ix: DecodedInstruction, ctx: DescribeContext): number | undefined {
  const address = account(ix, "tranche");
  return address ? ctx.tranches?.[address]?.index : undefined;
}

async function describeBona(
  ix: DecodedInstruction,
  ctx: DescribeContext,
): Promise<string> {
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
        `No money moves now. This starts ${window} for ${tranche}. ` +
        `It approves evidence revision ${args.expectedRevision} only.`
      );
    }
    case "claim_tranche": {
      const args = ix.args as BonaInstructionArgs["claim_tranche"];
      return (
        `No money moves now. The contractor says the work for ${tranche} is done ` +
        `(evidence revision ${args.expectedRevision + 1}). An independent reviewer still has to check it.`
      );
    }
    case "open_dispute":
      return `No money moves now. This freezes ${tranche} until the dispute is settled.`;
    case "resolve_dispute": {
      const args = ix.args as BonaInstructionArgs["resolve_dispute"];
      if (args.outcome !== DisputeOutcome.Refund) {
        return `No money moves now. This sends ${tranche} back for a fresh independent review.`;
      }
      return `Returns ${tranche} from the escrow vault. ${await describeRecipient(ix, escrow, "funder")}`;
    }
    case "release_tranche":
      return (
        `Releases ${tranche} from the escrow vault as a sandbox payout. ` +
        (await describeRecipient(ix, escrow, "payee", trancheIndex(ix, ctx)))
      );
    case "sweep_surplus":
      return (
        "Returns tokens in the vault beyond what the open checks are owed. " +
        (await describeRecipient(ix, escrow, "funder"))
      );
    case "reassign_reviewer": {
      const args = ix.args as BonaInstructionArgs["reassign_reviewer"];
      return (
        `No money moves. Replaces this escrow's reviewer with ${short(args.newReviewer)}. ` +
        "The platform admin and the school must both sign."
      );
    }
    case "refund_expired":
      return `Returns ${tranche} from the escrow vault. ${await describeRecipient(ix, escrow, "funder")}`;
    case "cancel_unfunded":
      return (
        "Cancels an escrow that missed its funding deadline and returns whatever reached the vault. " +
        (await describeRecipient(ix, escrow, "funder"))
      );
    case "activate_funding":
      return "No money moves. This marks the escrow as funded, once the vault holds the full amount.";
    case "create_escrow": {
      const args = ix.args as BonaInstructionArgs["create_escrow"];
      const [a, b] = args.amounts;
      const payee = (p: Address) =>
        p === DEFAULT_PUBKEY || p === args.contractor ? "the contractor" : short(p);
      return (
        `Creates an escrow for ${formatRand(a + b)}: ${formatRand(a)} for ${CHECK_NAMES[0]}, ` +
        `released to ${payee(args.payees[0])}, and ${formatRand(b)} for ${CHECK_NAMES[1]}, ` +
        `released to ${payee(args.payees[1])}. No money moves yet.`
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

/**
 * Names the token account the instruction actually pays and compares it with the
 * canonical token account of the escrow's payee for that check, or of the funder for the escrow's mint.
 */
async function describeRecipient(
  ix: DecodedInstruction,
  escrow: EscrowAccount | undefined,
  role: "payee" | "funder",
  index?: number,
): Promise<string> {
  const owner = account(ix, role);
  const tokenAccount = account(ix, `${role}Ata`);
  const mint = account(ix, "mint");
  const sentence =
    `The money goes to token account ${maybeShort(tokenAccount)}, ` +
    `listed as belonging to ${maybeShort(owner)}.`;
  if (!escrow) {
    return (
      `${sentence} The escrow data was not provided, so this could not be compared with ` +
      `the escrow's ${role}. The program checks the recipient against the escrow.`
    );
  }
  if (role === "payee" && index !== 0 && index !== 1) {
    return (
      `${sentence} The payment stage data was not provided, so this could not be compared ` +
      "with the payee fixed in the escrow. The program checks the recipient against the escrow."
    );
  }
  const expectedOwner = role === "payee" ? escrow.payees[index as 0 | 1] : escrow.funder;
  const expectedAccount = await findAssociatedTokenAddress(expectedOwner, escrow.mint);
  if (
    owner !== expectedOwner ||
    tokenAccount !== expectedAccount ||
    mint !== escrow.mint
  ) {
    return (
      `${sentence} WARNING: This sends money to an account that is NOT the ${role}'s ` +
      `(expected ${short(expectedAccount)}, owned by ${short(expectedOwner)}). Do not sign.`
    );
  }
  return (
    `${sentence} That is the ${role}'s own token account. ` +
    "The program checks the recipient against the escrow."
  );
}

function describeComputeBudget(ix: DecodedInstruction): string {
  const { unitPrices, unitLimits } = summarizeComputeBudget({
    instructions: [ix],
  } as DecodedTransaction);
  if (unitPrices.length === 1) {
    return `Sets a priority fee of ${unitPrices[0]} micro-lamports per compute unit. No tokens move.`;
  }
  if (unitLimits.length === 1) {
    return `Sets the compute limit to ${unitLimits[0]} units. No money moves.`;
  }
  return `Changes the fee budget in an unusual way (${ix.name ?? "unreadable"}).`;
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
