import { address, isAddress } from "@solana/kit";
import { MoneyQuestionSchema } from "@/features/agent/contracts";
import { agentAi } from "@/server/agent/deps";
import {
  SAMPLE_MONEY_STATE,
  answerWhereMoney,
  publicStateFromChain,
} from "@/server/agent/where-money";
import { HttpError, ok, parseJson, route } from "@/server/http";
import { createEscrowService, describeSolanaError, devnetConfig, getSolanaRpc } from "@/server/solana";

/**
 * `POST /api/agent/money` — "Where's the money?". `{ escrow, question }`:
 * `escrow` is the escrow's devnet address, or `sample` for the labelled demo
 * case. Code reads the public on-chain state; Bona AI only words the answer.
 */
export const POST = route(async (request) => {
  const body = await parseJson(request, MoneyQuestionSchema);
  let state = SAMPLE_MONEY_STATE;
  if (body.escrow !== "sample") {
    if (!isAddress(body.escrow)) throw new HttpError("invalid_input", "That is not an escrow address.");
    // Read-only: no signers.
    const service = createEscrowService({ rpc: getSolanaRpc(), network: devnetConfig(), signers: {} });
    try {
      state = publicStateFromChain(await service.getCaseOnChain(address(body.escrow)));
    } catch (error) {
      const { kind, message } = describeSolanaError(error);
      throw new HttpError(
        kind === "invalid_state" ? "not_found" : "ledger_unavailable",
        kind === "invalid_state" ? "There is no escrow at this address on devnet." : message,
      );
    }
  }
  return ok(await answerWhereMoney(agentAi(), state, body.question));
});
