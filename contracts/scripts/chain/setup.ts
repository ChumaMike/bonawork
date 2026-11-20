// Creates every institution in BONA_INSTITUTION_IDS (default: the five seed institutions)
// and grants the seven roles for each, on the deployed factory. Idempotent: safe to re-run.
//   pnpm chain:setup
//
// Run as the factory owner (the deployer). Takes role ADDRESSES only:
//   BONA_{REGISTRAR,SCHOOL_ADMIN,REVIEWER,BUYER,SUPPLIER,RECEIVER,PAYMENT_APPROVER}_ADDRESS
// The four finance addresses are also read from contracts/.env.finance.local.
import { network } from "hardhat";
import {
  assertAffordable,
  assertSupportedChain,
  chainRoleAddresses,
  currentGasPrice,
  idToBytes32,
  parseInstitutionIds,
  planChainSetup,
  readFinanceKeyFile,
  requireChainDeployment,
  setupChain,
  summariseSetup,
} from "./lib/chain.js";

// Planning figure for one grantRole; a createInstitution is estimated against the chain.
const GRANT_ROLE_GAS = 60_000n;

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
assertSupportedChain(chainId);

const institutions = parseInstitutionIds(process.env.BONA_INSTITUTION_IDS);
const roles = chainRoleAddresses(process.env, readFinanceKeyFile());
const address =
  process.env.BONA_FACTORY_ADDRESS || requireChainDeployment(chainId).factory;

const [owner] = await ethers.getSigners();
if (!owner) {
  throw new Error("No signer. Set FUJI_DEPLOYER_PRIVATE_KEY in contracts/.env.");
}
if ((await ethers.provider.getCode(address)) === "0x") {
  throw new Error(`No contract at ${address} on chain ${chainId}.`);
}
const factory = await ethers.getContractAt("BonaChainFactory", address, owner);
const onChainOwner = await factory.owner();
if (onChainOwner !== owner.address) {
  throw new Error(`Signer ${owner.address} is not the factory owner (${onChainOwner}).`);
}

console.log(`Factory ${address} on chain ${chainId} | owner ${owner.address}`);
console.log(`${institutions.length} institution(s), 7 roles each\n`);

// Preflight: what is missing, and what it would cost at the current gas price.
const plan = await planChainSetup(factory, institutions, roles);
const missing = plan.filter((r) => r.result === "sent");
const creates = missing.filter((r) => r.action === "createInstitution");
if (missing.length > 0) {
  const createGas =
    creates.length > 0
      ? await factory.createInstitution.estimateGas(idToBytes32(creates[0].institution))
      : 0n;
  const gas =
    createGas * BigInt(creates.length) +
    GRANT_ROLE_GAS * BigInt(missing.length - creates.length);
  const gasPrice = await currentGasPrice(ethers.provider);
  const balance = await ethers.provider.getBalance(owner.address);
  const cap = ethers.parseEther(process.env.BONA_SETUP_MAX_AVAX || "0.5");
  console.log(
    `Preflight: ${missing.length} transaction(s), about ${gas} gas at up to ` +
      `${ethers.formatUnits(gasPrice, "gwei")} gwei = at most ` +
      `${ethers.formatEther(gas * gasPrice)} AVAX (wallet ${ethers.formatEther(balance)} AVAX, ` +
      `limit ${ethers.formatEther(cap)} AVAX)\n`,
  );
  assertAffordable(
    { gas, gasPrice, cost: gas * gasPrice, balance },
    cap,
    "run the setup",
  );
}

const rows = await setupChain(factory, institutions, roles);
console.table(
  rows.map((r) => ({
    institution: r.institution,
    action: r.action,
    account: r.account || "-",
    result: r.result,
    tx: r.txHash || "-",
  })),
);
console.log(`${summariseSetup(rows)}.`);
