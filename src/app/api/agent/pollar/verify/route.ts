import { address } from "@solana/kit";
import { FundingCheckRequestSchema } from "@/features/agent/contracts";
import { jsonRpcFundingRpc, verifyPollarFunding } from "@/server/agent/pollar-funding";
import { HttpError, ok, parseJson, route } from "@/server/http";
import { createEscrowService, describeSolanaError, devnetConfig, getSolanaRpc } from "@/server/solana";

/**
 * `POST /api/agent/pollar/verify` — checks a funder's Pollar transfer on
 * Solana devnet: `{ signature, funderWallet, escrow, amountCents }`. The
 * amount and the funder that count are the escrow's own, read from the chain;
 * the browser's `amountCents` must agree with them. This route only checks.
 * Activating the escrow stays with the fund route, which calls
 * `verifyPollarFunding` itself before `activateFunding`.
 */
export const POST = route(async (request) => {
  const body = await parseJson(request, FundingCheckRequestSchema);
  const network = devnetConfig();
  const service = createEscrowService({ rpc: getSolanaRpc(), network, signers: {} });

  let total: bigint;
  let funder: string;
  try {
    const onChain = await service.getCaseOnChain(address(body.escrow));
    total = onChain.account.totalAmount;
    funder = onChain.account.funder;
  } catch (error) {
    const { kind, message } = describeSolanaError(error);
    throw new HttpError(
      kind === "invalid_state" ? "not_found" : "ledger_unavailable",
      kind === "invalid_state" ? "There is no escrow at this address on devnet." : message,
    );
  }
  if (funder !== body.funderWallet) {
    throw new HttpError("forbidden", "This wallet is not the funder of this escrow.");
  }
  if (BigInt(body.amountCents) !== total) {
    throw new HttpError("invalid_input", "The amount is not this escrow's full amount.");
  }

  const check = await verifyPollarFunding(jsonRpcFundingRpc(), {
    signature: body.signature,
    funderWallet: body.funderWallet,
    escrow: body.escrow,
    mint: network.mint,
    amount: total,
  });
  return ok(check);
});
