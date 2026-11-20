import { getContext } from "@/server/context";
import { ok, route } from "@/server/http";

/** `GET /api/ledger` — which ledger this deployment writes to. */
export const GET = route(async () => {
  const ctx = await getContext();
  const info = ctx.ledger.info();
  const sample = info.explorerTxUrl(`0x${"0".repeat(64)}`);
  return ok({
    chainId: info.chainId,
    contractAddress: info.contractAddress,
    networkName: info.networkName,
    live: info.live,
    explorerTxUrlBase: sample ? sample.replace(/0x0{64}$/, "") : null,
  });
});
