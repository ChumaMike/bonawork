/** Links to the public Solana Explorer on devnet. */
const EXPLORER = "https://explorer.solana.com";

/** The explorer page of one devnet transaction, by its signature. */
export function solanaTxUrl(signature: string): string {
  return `${EXPLORER}/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

/** The explorer page of one devnet account or program. */
export function solanaAddressUrl(address: string): string {
  return `${EXPLORER}/address/${encodeURIComponent(address)}?cluster=devnet`;
}
