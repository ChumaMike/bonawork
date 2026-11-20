import { isAddress } from "viem";

export const DEFAULT_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc";
export const DEFAULT_CHAIN_ID = 43113;

export interface VerifierConfig {
  rpcUrl: string;
  chainId: number;
  /** When set, receipts naming any other contract are rejected. */
  expectedContractAddress?: `0x${string}`;
  /**
   * The BonaChainFactory. When set, a receipt is accepted only if this factory
   * created the contract it names, as the kind of contract that records the
   * receipt's event. A receipt naming `expectedContractAddress` (the earlier
   * BonaRegistry) keeps verifying next to it.
   */
  expectedFactoryAddress?: `0x${string}`;
}

/**
 * Read the verifier's own settings. Only `VERIFY_*` variables are consulted:
 * the verifier never shares configuration with the BonaBlock application.
 */
export function loadVerifierConfig(
  env: Record<string, string | undefined> = process.env,
): VerifierConfig {
  const rpcUrl = (env.VERIFY_RPC_URL ?? "").trim() || DEFAULT_RPC_URL;
  const chainRaw = (env.VERIFY_CHAIN_ID ?? "").trim();
  const chainId = chainRaw ? Number.parseInt(chainRaw, 10) : DEFAULT_CHAIN_ID;
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`VERIFY_CHAIN_ID must be a positive integer, got "${chainRaw}"`);
  }
  const contractRaw = (env.VERIFY_CONTRACT_ADDRESS ?? "").trim();
  let expectedContractAddress: `0x${string}` | undefined;
  if (contractRaw) {
    if (!isAddress(contractRaw, { strict: false })) {
      throw new Error(`VERIFY_CONTRACT_ADDRESS is not an EVM address: "${contractRaw}"`);
    }
    expectedContractAddress = contractRaw.toLowerCase() as `0x${string}`;
  }
  const factoryRaw = (env.VERIFY_FACTORY_ADDRESS ?? "").trim();
  let expectedFactoryAddress: `0x${string}` | undefined;
  if (factoryRaw) {
    if (!isAddress(factoryRaw, { strict: false })) {
      throw new Error(`VERIFY_FACTORY_ADDRESS is not an EVM address: "${factoryRaw}"`);
    }
    expectedFactoryAddress = factoryRaw.toLowerCase() as `0x${string}`;
  }
  return { rpcUrl, chainId, expectedContractAddress, expectedFactoryAddress };
}

/** Whose receipts this verifier accepts, in words, or null when nothing is pinned. */
export function trustedContracts(
  config: Pick<VerifierConfig, "expectedContractAddress" | "expectedFactoryAddress">,
): string | null {
  const { expectedContractAddress: contract, expectedFactoryAddress: factory } = config;
  if (factory && contract) {
    return `contracts created by the Bona Chain factory ${factory}, and the earlier registry ${contract}`;
  }
  if (factory) return `contracts created by the Bona Chain factory ${factory}`;
  return contract ?? null;
}

/** Block-explorer transaction URL for the chains we know; undefined otherwise. */
export function explorerTxUrl(chainId: number, txHash: string): string | undefined {
  if (chainId === 43113) return `https://testnet.snowtrace.io/tx/${txHash}`;
  if (chainId === 43114) return `https://snowtrace.io/tx/${txHash}`;
  return undefined;
}
