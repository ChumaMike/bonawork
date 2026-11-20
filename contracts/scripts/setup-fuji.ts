// Registers every school in BONA_SCHOOL_IDS and grants Registrar / SchoolAdmin / Reviewer
// for each, on the deployed registry. Idempotent: safe to re-run.  pnpm setup:fuji
//
// Run as the registry owner (the deployer). Takes role ADDRESSES only.
import { network } from "hardhat";
import {
  assertSupportedChain,
  parseSchoolIds,
  readDeployment,
  requireEnv,
  roleAddressesFromEnv,
  setupRegistry,
} from "./lib/setup.js";

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
assertSupportedChain(chainId);

const schools = parseSchoolIds(requireEnv("BONA_SCHOOL_IDS"));
const roles = roleAddressesFromEnv();
const { address } = readDeployment(chainId);

const [owner] = await ethers.getSigners();
if (!owner) {
  throw new Error("No signer. Set FUJI_DEPLOYER_PRIVATE_KEY in contracts/.env.");
}
const registry = await ethers.getContractAt("BonaRegistry", address, owner);
const onChainOwner = await registry.owner();
if (onChainOwner !== owner.address) {
  throw new Error(`Signer ${owner.address} is not the registry owner (${onChainOwner}).`);
}

console.log(`Registry ${address} on chain ${chainId} | owner ${owner.address}`);
console.log(`${schools.length} school(s), 3 roles each\n`);

const rows = await setupRegistry(registry, schools, roles);
console.table(
  rows.map((r) => ({
    school: r.school,
    action: r.action,
    account: r.account || "-",
    result: r.result,
    tx: r.txHash || "-",
  })),
);
const sent = rows.filter((r) => r.result === "sent").length;
console.log(
  `${sent} transaction(s) sent, ${rows.length - sent} step(s) already in place.`,
);
