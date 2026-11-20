// Reads the deployed factory and rewrites contracts/deployments/bonachain.<chainId>.json
// with the factory address, its deploy block and the operations and finance address of
// every institution. Read-only: needs no key and sends nothing.  pnpm chain:export
import { network } from "hardhat";
import {
  assertSupportedChain,
  readInstitutions,
  requireChainDeployment,
  writeChainDeployment,
} from "./lib/chain.js";

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
assertSupportedChain(chainId);

const deployment = requireChainDeployment(chainId);
if ((await ethers.provider.getCode(deployment.factory)) === "0x") {
  throw new Error(`No contract at ${deployment.factory} on chain ${chainId}.`);
}
const factory = await ethers.getContractAt("BonaChainFactory", deployment.factory);

const institutions = await readInstitutions(factory);
for (const institution of institutions) {
  // Every listed address must be one the factory itself created.
  const genuine =
    (await factory.isGenuine(institution.operations)) &&
    (await factory.isGenuine(institution.finance));
  if (!genuine) {
    throw new Error(
      `Institution ${institution.institutionIdBytes32} failed the isGenuine check.`,
    );
  }
}

writeChainDeployment({ ...deployment, owner: await factory.owner(), institutions });
console.log(
  `Factory ${deployment.factory} (deployed in block ${deployment.deployBlock}), ` +
    `${institutions.length} institution(s)`,
);
console.table(
  institutions.map((i) => ({
    institution: i.institutionId ?? i.institutionIdBytes32,
    operations: i.operations,
    finance: i.finance,
  })),
);
console.log(`Wrote contracts/deployments/bonachain.${chainId}.json`);
