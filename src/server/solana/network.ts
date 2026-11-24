/**
 * Public BonaWork devnet addresses, written by scripts/solana/bootstrap-devnet.ts
 * into config/solana-devnet.json. Public keys only; no secrets live there.
 */
import { address, type Address } from "@solana/kit";

import devnet from "../../../config/solana-devnet.json";

export type BonaNetwork = {
  cluster: "devnet";
  chainId: "solana:devnet";
  explorerBase: string;
  programId: Address;
  mint: Address;
  mintDecimals: number;
  admin: Address;
  match: Address;
  dispute: Address;
  feepayer: Address;
  treasury: Address;
  keeper: Address;
  demoReviewer: Address;
};

export function parseNetworkConfig(raw: Record<string, unknown>): BonaNetwork {
  const a = (key: string) => address(String(raw[key]));
  if (raw.cluster !== "devnet") throw new Error("Only Solana devnet is supported.");
  return {
    cluster: "devnet",
    chainId: "solana:devnet",
    explorerBase: String(raw.explorerBase),
    programId: a("programId"),
    mint: a("mint"),
    mintDecimals: Number(raw.mintDecimals),
    admin: a("admin"),
    match: a("match"),
    dispute: a("dispute"),
    feepayer: a("feepayer"),
    treasury: a("treasury"),
    keeper: a("keeper"),
    demoReviewer: a("demoReviewer"),
  };
}

let cached: BonaNetwork | null = null;

export function devnetConfig(): BonaNetwork {
  cached ??= parseNetworkConfig(devnet as Record<string, unknown>);
  return cached;
}

export function explorerTx(signature: string, base = devnetConfig().explorerBase) {
  return `${base}/tx/${signature}?cluster=devnet`;
}

export function explorerAddress(a: string, base = devnetConfig().explorerBase) {
  return `${base}/address/${a}?cluster=devnet`;
}
