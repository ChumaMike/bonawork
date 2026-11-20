// Creates four TESTNET-ONLY signing keys (buyer, supplier, receiver, payment approver) in
// the git-ignored contracts/.env.finance.local and prints the ADDRESSES only.
// Refuses to overwrite an existing file.  pnpm chain:keys
import { FINANCE_KEY_FILE, FINANCE_KEYS, generateFinanceKeys } from "./lib/chain.js";

const addresses = generateFinanceKeys(FINANCE_KEY_FILE);

console.log("Wrote contracts/.env.finance.local (git-ignored). Testnet only.");
console.log("Addresses (safe to share; the keys were NOT printed):\n");
for (const { key, prefix } of FINANCE_KEYS) {
  console.log(`${prefix}_ADDRESS=${addresses[key]}`);
}
console.log(
  "\nNext: pnpm chain:setup grants these addresses their roles, pnpm chain:fund gives them gas.",
);
