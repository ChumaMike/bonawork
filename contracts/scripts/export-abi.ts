// Writes one self-contained file for the web app and BonaBlock Verify:
//   contracts/exports/BonaRegistry.43113.json  = ABI + deployed address for Fuji.
// Run via `pnpm export:abi` (after `pnpm deploy:fuji`, and again after any contract change).
//
// Works before deployment too: `address` is then null and `deployed` is false, so a
// consumer can tell "not deployed yet" apart from a real address.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { artifacts } from "hardhat";

const CHAIN_ID = 43113;

interface DeploymentRecord {
  address: string;
  owner: string;
  deployTxHash: string;
  deployBlock: number;
}

const { abi } = await artifacts.readArtifact("BonaRegistry");

const deploymentUrl = new URL(`../deployments/${CHAIN_ID}.json`, import.meta.url);
const deployment = existsSync(deploymentUrl)
  ? (JSON.parse(readFileSync(deploymentUrl, "utf8")) as DeploymentRecord)
  : null;

const output = {
  contract: "BonaRegistry",
  chainId: CHAIN_ID,
  network: "avalanche-fuji",
  deployed: deployment !== null,
  address: deployment?.address ?? null,
  owner: deployment?.owner ?? null,
  deployTxHash: deployment?.deployTxHash ?? null,
  deployBlock: deployment?.deployBlock ?? null,
  abi,
};

const outDir = new URL("../exports/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL(`BonaRegistry.${CHAIN_ID}.json`, outDir),
  `${JSON.stringify(output, null, 2)}\n`,
);

console.log(
  `Wrote contracts/exports/BonaRegistry.${CHAIN_ID}.json (${abi.length} ABI entries)`,
);
console.log(
  deployment
    ? `Address ${deployment.address} (deployed in block ${deployment.deployBlock})`
    : "No deployments/43113.json yet: address is null. Re-run after deploy:fuji.",
);
