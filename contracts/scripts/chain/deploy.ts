// Deploys BonaChainFactory and records it in deployments/bonachain.<chainId>.json.
//
//   pnpm chain:deploy:local -> throwaway in-process network (smoke test)
//   pnpm chain:deploy       -> Avalanche Fuji; needs FUJI_DEPLOYER_PRIVATE_KEY with test AVAX
//
// Preflight: reads the gas price and the balance, and aborts before sending anything if the
// estimated cost is over 0.2 AVAX or over the balance. Refuses every chain except Fuji
// (43113) and the local test chain.
import { network } from "hardhat";
import {
  assertAffordable,
  assertSupportedChain,
  deployFactory,
  estimateDeployCost,
  FUJI_CHAIN_ID,
  MAX_DEPLOY_COST_WEI,
  readChainDeployment,
  writeChainDeployment,
} from "./lib/chain.js";

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
assertSupportedChain(chainId);

const [deployer] = await ethers.getSigners();
if (!deployer) {
  throw new Error(
    "No deployer account. Set FUJI_DEPLOYER_PRIVATE_KEY in contracts/.env.",
  );
}

const existing = readChainDeployment(chainId);
if (existing && chainId === FUJI_CHAIN_ID && process.env.BONA_REDEPLOY !== "1") {
  throw new Error(
    `BonaChainFactory is already deployed on Fuji at ${existing.factory} ` +
      "(contracts/deployments/bonachain.43113.json). Set BONA_REDEPLOY=1 to deploy a new " +
      "one on purpose. Nothing was sent.",
  );
}

const fmt = ethers.formatEther;
const factory = await ethers.getContractFactory("BonaChainFactory", deployer);
const estimate = await estimateDeployCost(factory, deployer.address, ethers.provider);
console.log(
  `Chain ${chainId} | deployer ${deployer.address} | ${fmt(estimate.balance)} AVAX`,
);
console.log(
  `Preflight: ${estimate.gas} gas at up to ${ethers.formatUnits(estimate.gasPrice, "gwei")} gwei ` +
    `= at most ${fmt(estimate.cost)} AVAX (limit ${fmt(MAX_DEPLOY_COST_WEI)} AVAX)`,
);
assertAffordable(estimate, MAX_DEPLOY_COST_WEI, "deploy BonaChainFactory");

const { deployment, gasUsed } = await deployFactory(factory, deployer, ethers.provider);
writeChainDeployment(deployment);
console.log(`Deployed with ${gasUsed} gas.`);
console.log(deployment);
console.log(`\nWrote contracts/deployments/bonachain.${chainId}.json`);
console.log(`LEDGER_FACTORY_ADDRESS=${deployment.factory}`);
