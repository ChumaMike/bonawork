// Tops the buyer, supplier, receiver and payment-approver addresses up to
// BONA_FINANCE_TARGET_AVAX each (default 0.02) from the deployer. Addresses already at the
// target are skipped, so it is safe to re-run.  pnpm chain:fund
import { network } from "hardhat";
import {
  assertSupportedChain,
  financeAddresses,
  fundAddresses,
  readFinanceKeyFile,
} from "./lib/chain.js";

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
assertSupportedChain(chainId);

const targetText = process.env.BONA_FINANCE_TARGET_AVAX || "0.02";
const target = ethers.parseEther(targetText);
if (target <= 0n || target > ethers.parseEther("0.5")) {
  throw new Error("BONA_FINANCE_TARGET_AVAX must be greater than 0 and at most 0.5.");
}

const entries = financeAddresses(process.env, readFinanceKeyFile());
const [funder] = await ethers.getSigners();
if (!funder) {
  throw new Error("No signer. Set FUJI_DEPLOYER_PRIVATE_KEY in contracts/.env.");
}

const fmt = (wei: bigint) => ethers.formatEther(wei);
const funderBefore = await ethers.provider.getBalance(funder.address);
console.log(`Chain ${chainId} | funder ${funder.address} | ${fmt(funderBefore)} AVAX`);
console.log(`Target per finance address: ${targetText} AVAX\n`);

const rows = await fundAddresses(funder, ethers.provider, entries, target);
console.table(
  rows.map((r) => ({
    role: r.label,
    account: r.account,
    before: fmt(r.before),
    sent: r.sent === 0n ? "-" : fmt(r.sent),
    after: fmt(r.after),
    tx: r.txHash || "-",
  })),
);
const sent = rows.filter((r) => r.sent > 0n).length;
console.log(`${sent} top-up(s) sent, ${rows.length - sent} already funded.`);
console.log(
  `Funder balance after: ${fmt(await ethers.provider.getBalance(funder.address))} AVAX`,
);
