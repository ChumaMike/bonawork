/**
 * Who signs verify_tranche for the reviewer.
 *
 * The reviewer is meant to sign in their own wallet. Until an embedded wallet
 * is wired in, the platform uses a server-held DEMO reviewer key on devnet and
 * says so on screen. Anything that implements `ReviewerSigner` (for example an
 * embedded wallet that returns a signed transaction from the browser) can take
 * its place without touching the routes.
 */
import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";

import { loadSigners } from "@/server/solana";

export type ReviewerSignerKind = "demo_key";

export interface ReviewerSigner {
  readonly kind: ReviewerSignerKind;
  /** What the screen shows next to the sign button. */
  readonly label: string;
  readonly address: Address;
  /** Adds the reviewer's signature to a base64 wire transaction. */
  sign(transaction: string): Promise<string>;
}

export const DEMO_REVIEWER_LABEL = "Demo reviewer key (devnet)";

export function demoKeyReviewerSigner(key: KeyPairSigner): ReviewerSigner {
  return {
    kind: "demo_key",
    label: DEMO_REVIEWER_LABEL,
    address: key.address,
    async sign(transaction) {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
      const signed = await partiallySignTransaction([key.keyPair], tx);
      return getBase64EncodedWireTransaction(signed);
    },
  };
}

let cached: Promise<ReviewerSigner | null> | null = null;

/** The reviewer signer the app uses now, or null when no demo reviewer key is configured. */
export function getReviewerSigner(): Promise<ReviewerSigner | null> {
  cached ??= loadSigners(["demoReviewer"]).then((s) =>
    s.demoReviewer ? demoKeyReviewerSigner(s.demoReviewer) : null,
  );
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
