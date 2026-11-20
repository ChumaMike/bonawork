import { createPublicClient, http, TransactionReceiptNotFoundError } from "viem";
import type { ChainReader, TxReceiptLike } from "./verify";

/**
 * The verifier's only window onto the world: a plain JSON-RPC connection to an
 * Avalanche node chosen by whoever runs the verifier. Nothing here knows the
 * BonaBlock application exists.
 */
export function createChainReader(rpcUrl: string): ChainReader {
  const client = createPublicClient({ transport: http(rpcUrl, { retryCount: 1 }) });
  return {
    getChainId: () => client.getChainId(),
    async getTransactionReceipt(hash): Promise<TxReceiptLike | null> {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return {
          status: receipt.status,
          to: receipt.to,
          blockNumber: receipt.blockNumber,
          logs: receipt.logs.map((log) => ({
            address: log.address,
            data: log.data,
            topics: log.topics,
          })),
        };
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return null;
        throw error;
      }
    },
  };
}
