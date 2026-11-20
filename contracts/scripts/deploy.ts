// Deploys BonaRegistry and records the deployment in deployments/<chainId>.json.
//
//   pnpm deploy:local   -> throwaway in-process network (smoke test)
//   pnpm deploy:fuji    -> Avalanche Fuji; needs FUJI_DEPLOYER_PRIVATE_KEY with test AVAX
import { mkdirSync, writeFileSync } from "node:fs";
import { network } from "hardhat";

const FUJI_CHAIN_ID = 43113n;
const LOCAL_CHAIN_ID = 31337n;

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();

if (chainId !== FUJI_CHAIN_ID && chainId !== LOCAL_CHAIN_ID) {
  throw new Error(
    `Refusing to deploy: chain ${chainId} is neither Fuji (43113) nor local.`,
  );
}

const [deployer] = await ethers.getSigners();
if (!deployer) {
  throw new Error(
    "No deployer account. Set FUJI_DEPLOYER_PRIVATE_KEY in contracts/.env.",
  );
}
const balance = await ethers.provider.getBalance(deployer.address);
console.log(
  `Chain ${chainId} | deployer ${deployer.address} | ${ethers.formatEther(balance)} AVAX`,
);
if (balance === 0n) {
  throw new Error(
    "Deployer wallet is unfunded. Get test AVAX from the Fuji faucet first.",
  );
}

const registry = await ethers.deployContract("BonaRegistry", [deployer.address]);
const tx = registry.deploymentTransaction();
if (!tx) throw new Error("Deployment transaction missing.");
const receipt = await tx.wait();
if (!receipt) throw new Error("Deployment receipt missing.");
const address = await registry.getAddress();

const record = {
  contract: "BonaRegistry",
  chainId: Number(chainId),
  address,
  owner: deployer.address,
  deployTxHash: tx.hash,
  deployBlock: receipt.blockNumber,
};
mkdirSync(new URL("../deployments/", import.meta.url), { recursive: true });
writeFileSync(
  new URL(`../deployments/${chainId}.json`, import.meta.url),
  `${JSON.stringify(record, null, 2)}\n`,
);
console.log(record);
