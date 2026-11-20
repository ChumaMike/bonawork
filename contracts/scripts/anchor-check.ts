// Decodes the BonaRegistry events in one transaction and prints them. Read-only.
//
//   BONA_TX_HASH=0x... pnpm anchor-check:fuji
//
// Needs no private key. If a deployment record exists for the chain, logs from any other
// contract are reported as foreign rather than decoded.
import { network } from "hardhat";
import { assertSupportedChain, FUJI_CHAIN_ID, readDeployment } from "./lib/setup.js";

const ENUMS: Record<string, readonly string[]> = {
  role: ["None", "Registrar", "SchoolAdmin", "Reviewer"],
  kind: ["Report", "Repair", "Review"],
};

const txHash = process.env.BONA_TX_HASH ?? "";
if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
  throw new Error("Set BONA_TX_HASH to a 0x-prefixed 32-byte transaction hash.");
}

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
assertSupportedChain(chainId);

let registryAddress: string | null = null;
try {
  registryAddress = ethers.getAddress(readDeployment(chainId).address);
} catch {
  console.log("(no deployment record for this chain: decoding logs from any address)");
}

const receipt = await ethers.provider.getTransactionReceipt(txHash);
if (!receipt) throw new Error(`Transaction ${txHash} not found on chain ${chainId}.`);
const block = await ethers.provider.getBlock(receipt.blockNumber);

console.log(`Transaction ${txHash}`);
console.log(`  chain     ${chainId}`);
console.log(`  status    ${receipt.status === 1 ? "success" : "REVERTED"}`);
console.log(`  block     ${receipt.blockNumber}`);
if (block) console.log(`  time      ${new Date(block.timestamp * 1000).toISOString()}`);
console.log(`  from      ${receipt.from}`);
console.log(`  to        ${receipt.to ?? "(contract creation)"}`);
if (registryAddress) console.log(`  registry  ${registryAddress}`);
if (chainId === FUJI_CHAIN_ID) {
  console.log(`  explorer  https://testnet.snowtrace.io/tx/${txHash}`);
}

const { interface: iface } = await ethers.getContractFactory("BonaRegistry");
let decoded = 0;
for (const log of receipt.logs) {
  if (registryAddress && ethers.getAddress(log.address) !== registryAddress) {
    console.log(`\nLog #${log.index}: from ${log.address} (not the registry, skipped)`);
    continue;
  }
  const parsed = iface.parseLog(log);
  if (!parsed) {
    console.log(`\nLog #${log.index}: not a BonaRegistry event`);
    continue;
  }
  decoded += 1;
  console.log(`\nLog #${log.index}: ${parsed.name}`);
  parsed.fragment.inputs.forEach((input, i) => {
    const value = parsed.args[i];
    const names = ENUMS[input.name];
    const shown =
      names && typeof value === "bigint"
        ? `${value} (${names[Number(value)] ?? "?"})`
        : input.name === "timestamp" && typeof value === "bigint"
          ? `${value} (${new Date(Number(value) * 1000).toISOString()})`
          : String(value);
    console.log(`  ${input.name.padEnd(16)} ${shown}`);
  });
}

console.log(`\n${decoded} BonaRegistry event(s) decoded.`);
if (decoded === 0) process.exitCode = 1;
