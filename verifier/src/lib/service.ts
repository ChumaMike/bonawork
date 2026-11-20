import { createChainReader } from "./chain";
import { loadVerifierConfig, type VerifierConfig } from "./config";
import { verify, type Source, type VerifyResult } from "./verify";

/**
 * Convenience wrapper used by the API route and the CLI: config from
 * `VERIFY_*` env (or an override), a real RPC reader, then `verify`.
 */
export async function verifyWithConfig(
  input: {
    receipt: unknown;
    source: Source;
    reportId?: string;
    workOrderId?: string;
    matchPassed?: boolean;
  },
  config: VerifierConfig = loadVerifierConfig(),
): Promise<VerifyResult> {
  return verify(input, {
    chain: createChainReader(config.rpcUrl),
    expectedChainId: config.chainId,
    expectedContractAddress: config.expectedContractAddress,
    expectedFactoryAddress: config.expectedFactoryAddress,
  });
}

/** Parse receipt JSON text; returns an error string instead of throwing. */
export function parseJsonText(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
