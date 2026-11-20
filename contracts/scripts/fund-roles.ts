// Tops up the registrar, school-admin and reviewer addresses with gas money from the
// deployer, up to BONA_ROLE_TARGET_AVAX each (default 0.05). Idempotent.  pnpm fund:fuji
import { network } from "hardhat";
import { assertSupportedChain, fundRoles, roleAddressesFromEnv } from "./lib/setup.js";

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
assertSupportedChain(chainId);

const targetText = process.env.BONA_ROLE_TARGET_AVAX || "0.05";
const target = ethers.parseEther(targetText);
if (target <= 0n || target > ethers.parseEther("1")) {
  throw new Error("BONA_ROLE_TARGET_AVAX must be greater than 0 and at most 1.");
}

const roles = roleAddressesFromEnv();
const [funder] = await ethers.getSigners();
if (!funder) {
  throw new Error("No signer. Set FUJI_DEPLOYER_PRIVATE_KEY in contracts/.env.");
}

const fmt = (wei: bigint) => ethers.formatEther(wei);
const funderBefore = await ethers.provider.getBalance(funder.address);
console.log(`Chain ${chainId} | funder ${funder.address} | ${fmt(funderBefore)} AVAX`);
console.log(`Target per role address: ${targetText} AVAX\n`);

const rows = await fundRoles(funder, ethers.provider, roles, target);
console.table(
  rows.map((r) => ({
    role: r.role,
    account: r.account,
    before: fmt(r.before),
    sent: r.sent === 0n ? "-" : fmt(r.sent),
    after: fmt(r.after),
    tx: r.txHash || "-",
  })),
);
const funderAfter = await ethers.provider.getBalance(funder.address);
console.log(`Funder balance after: ${fmt(funderAfter)} AVAX`);
