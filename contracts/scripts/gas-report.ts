// Measures gas units for the BonaRegistry operations on a throwaway local network and
// writes contracts/exports/gas-report.md.  pnpm gas:report
//
// Gas UNITS depend only on the bytecode and the storage touched, so they carry over to
// Fuji. The AVAX cost is units x gas price; the price is an input, not something this
// script can measure locally. If the Fuji RPC is reachable it reads the current price
// (a read-only call, no key) and labels it as an observation.
import { mkdirSync, writeFileSync } from "node:fs";
import type { ContractTransactionResponse } from "ethers";
import { network } from "hardhat";
import { idToBytes32, LOCAL_CHAIN_ID, setupRegistry } from "./lib/setup.js";

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
if (chainId !== LOCAL_CHAIN_ID) {
  throw new Error("gas:report only runs on the local test network (no --network flag).");
}

const [owner, registrar, schoolAdmin, reviewer] = await ethers.getSigners();
const digest = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));
const gasOf = async (txPromise: Promise<ContractTransactionResponse>) => {
  const receipt = await (await txPromise).wait();
  if (!receipt) throw new Error("Missing receipt.");
  return receipt.gasUsed;
};

// --- per-operation measurements ------------------------------------------------------
const registry = await ethers.deployContract("BonaRegistry", [owner.address]);
const deployReceipt = await registry.deploymentTransaction()?.wait();
if (!deployReceipt) throw new Error("Missing deployment receipt.");

const SCHOOL = idToBytes32("00000000-0000-4000-8000-010000000001");
const R1 = idToBytes32("00000000-0000-4000-8000-030000000001");
const R2 = idToBytes32("00000000-0000-4000-8000-030000000002");
const Role = { Registrar: 1, SchoolAdmin: 2, Reviewer: 3 } as const;
const Kind = { Report: 0, Repair: 1, Review: 2 } as const;

const rows: { operation: string; signer: string; gas: bigint; note: string }[] = [];
const add = (operation: string, signer: string, gas: bigint, note = "") =>
  rows.push({ operation, signer, gas, note });

add("deploy BonaRegistry", "owner", deployReceipt.gasUsed, "once");
add(
  "registerSchool",
  "owner",
  await gasOf(registry.registerSchool(SCHOOL)),
  "per school",
);
add(
  "grantRole",
  "owner",
  await gasOf(registry.grantRole(SCHOOL, registrar.address, Role.Registrar)),
  "3 per school",
);
await registry.grantRole(SCHOOL, schoolAdmin.address, Role.SchoolAdmin);
await registry.grantRole(SCHOOL, reviewer.address, Role.Reviewer);

const asRegistrar = registry.connect(registrar);
const asAdmin = registry.connect(schoolAdmin);
const asReviewer = registry.connect(reviewer);

add(
  "registerReport",
  "registrar",
  await gasOf(asRegistrar.registerReport(R1, SCHOOL, digest("report-1"))),
  "per case",
);
add(
  "registerEvidence",
  "registrar",
  await gasOf(asRegistrar.registerEvidence(R1, digest("photo-1"), Kind.Report)),
  "first item on a case",
);
add(
  "registerEvidence",
  "registrar",
  await gasOf(asRegistrar.registerEvidence(R1, digest("photo-2"), Kind.Report)),
  "each further item",
);
add("acknowledgeReport", "school admin", await gasOf(asAdmin.acknowledgeReport(R1)));
add(
  "recordInterimProtection",
  "school admin",
  await gasOf(asAdmin.recordInterimProtection(R1, digest("protection-1"))),
);
add(
  "claimRepair",
  "school admin",
  await gasOf(asAdmin.claimRepair(R1, digest("claim-1"))),
  "first claim on a case",
);
add(
  "disputeRepair",
  "reviewer",
  await gasOf(asReviewer.disputeRepair(R1, digest("review-1"))),
);
add(
  "claimRepair",
  "school admin",
  await gasOf(asAdmin.claimRepair(R1, digest("claim-2"))),
  "re-claim after a dispute",
);
add(
  "verifyRepair",
  "reviewer",
  await gasOf(asReviewer.verifyRepair(R1, digest("review-2"))),
  "closes the case",
);

// A second case verified first time, for the straight-through path.
await asRegistrar.registerReport(R2, SCHOOL, digest("report-2"));
await asAdmin.acknowledgeReport(R2);
await asAdmin.claimRepair(R2, digest("claim-3"));
add(
  "verifyRepair",
  "reviewer",
  await gasOf(asReviewer.verifyRepair(R2, digest("review-3"))),
  "no prior dispute",
);

const transferTx = await owner.sendTransaction({
  to: ethers.Wallet.createRandom().address,
  value: 1n,
});
const transferGas = (await transferTx.wait())?.gasUsed ?? 21000n;
add("AVAX transfer", "owner", transferGas, "fund:fuji, 3 per run");

// --- whole-setup measurement: the exact code path of `pnpm setup:fuji` ---------------
const SEED_SCHOOLS = [1, 2, 3, 4, 5].map(
  (n) => `00000000-0000-4000-8000-01${String(n).padStart(10, "0")}`,
);
const fresh = await ethers.deployContract("BonaRegistry", [owner.address]);
const freshDeployGas = (await fresh.deploymentTransaction()?.wait())?.gasUsed ?? 0n;
const setupRows = await setupRegistry(fresh, SEED_SCHOOLS, {
  registrar: registrar.address,
  schoolAdmin: schoolAdmin.address,
  reviewer: reviewer.address,
});
let setupGas = 0n;
for (const row of setupRows) {
  const receipt = await ethers.provider.getTransactionReceipt(row.txHash);
  if (!receipt) throw new Error("Missing setup receipt.");
  setupGas += receipt.gasUsed;
}
const fundGas = transferGas * 3n;
const ownerTotal = freshDeployGas + setupGas + fundGas;

// --- optional: current Fuji gas price (read-only) -------------------------------------
// `wei` = base fee of the latest block + the node's suggested priority fee: what a
// transaction sent now would pay per gas unit.
let observed: { baseFee: bigint; tip: bigint; wei: bigint; block: number } | null = null;
try {
  const fuji = new ethers.JsonRpcProvider(
    process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc",
    43113,
    { staticNetwork: true },
  );
  const read = Promise.all([
    fuji.getBlock("latest"),
    fuji.send("eth_maxPriorityFeePerGas", []) as Promise<string>,
  ]);
  const result = await Promise.race([
    read,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);
  fuji.destroy();
  if (result) {
    const [block, tipHex] = result;
    const baseFee = block?.baseFeePerGas;
    if (block && baseFee !== null && baseFee !== undefined) {
      const tip = BigInt(tipHex);
      observed = { baseFee, tip, wei: baseFee + tip, block: block.number };
    }
  }
} catch {
  // offline: the report simply omits the observation
}

// --- write the report -----------------------------------------------------------------
const n = (value: bigint) => value.toLocaleString("en-US");
const gwei = (value: number) => ethers.parseUnits(String(value), "gwei");
const TOPUP = ethers.parseEther("0.15");

const lines: string[] = [
  "# BonaRegistry gas report",
  "",
  "Generated by `pnpm gas:report` (`contracts/scripts/gas-report.ts`). Do not edit by hand.",
  "",
  "Measured on Hardhat's local network with the same compiler settings used for Fuji",
  "(solc 0.8.28, optimizer 200 runs, EVM `cancun`). Gas **units** carry over to Fuji; the",
  "AVAX cost is `units x gas price`, and the gas price is not something a local run can know.",
  "",
  "## Gas units per operation",
  "",
  "| Operation | Signer | Gas units | Note |",
  "| --- | --- | ---: | --- |",
  ...rows.map((r) => `| \`${r.operation}\` | ${r.signer} | ${n(r.gas)} | ${r.note} |`),
  "",
  "Units vary slightly with storage state: the first write to a fresh storage slot costs",
  "more than later writes, which is why some operations appear twice.",
  "",
  "## Deployer budget for the Fuji runbook",
  "",
  "Measured by running the real `setup:fuji` code path for the five seed schools.",
  "",
  "| Step | Transactions | Gas units |",
  "| --- | ---: | ---: |",
  `| \`deploy:fuji\` | 1 | ${n(freshDeployGas)} |`,
  `| \`setup:fuji\` (5 schools) | ${setupRows.length} | ${n(setupGas)} |`,
  `| \`fund:fuji\` (3 transfers) | 3 | ${n(fundGas)} |`,
  `| **Total gas** | ${setupRows.length + 4} | **${n(ownerTotal)}** |`,
  "",
  "On top of gas, `fund:fuji` moves 0.15 AVAX (3 x 0.05) from the deployer to the role",
  "addresses. That is a transfer of value, not a fee.",
  "",
];

if (observed) {
  const cost = ownerTotal * observed.wei;
  lines.push(
    "### Observed Fuji gas price",
    "",
    `Read from the public Fuji RPC on ${new Date().toISOString().slice(0, 10)} at block ` +
      `${observed.block} (read-only, no transaction sent):`,
    "",
    `- base fee: **${n(observed.baseFee)} wei** per gas unit`,
    `- suggested priority fee: **${n(observed.tip)} wei** per gas unit`,
    `- total: **${n(observed.wei)} wei** per gas unit (1 nAVAX = 1,000,000,000 wei)`,
    "",
    `At that price the deployer's whole gas bill is **${n(cost)} wei** ` +
      `(${ethers.formatEther(cost)} AVAX). Gas is negligible: the deployer's real ` +
      "requirement is the **0.15 AVAX** of top-ups plus the 0.01 AVAX margin `fund:fuji` " +
      "insists on, so **0.16 AVAX** in the deployer is enough at this price.",
    "",
    "This is a single observation. The base fee rises when the network is busy.",
    "",
  );
} else {
  lines.push(
    "The Fuji RPC was not reachable when this report was generated, so no live gas",
    "price is quoted.",
    "",
  );
}

lines.push(
  "### If the gas price were higher",
  "",
  "| Assumed gas price | Gas cost (AVAX) | Gas + 0.15 AVAX top-ups |",
  "| ---: | ---: | ---: |",
  ...[1, 2, 25, 50].map((price) => {
    const cost = ownerTotal * gwei(price);
    return `| ${price} nAVAX | ${ethers.formatEther(cost)} | ${ethers.formatEther(cost + TOPUP)} |`;
  }),
  "",
  "These prices are assumptions for headroom, not measurements. Even at 50 nAVAX a single",
  "0.5 AVAX faucet drip covers the whole run.",
  "",
);

const perCase = rows
  .filter((r) =>
    ["registerReport", "acknowledgeReport", "recordInterimProtection"].includes(
      r.operation,
    ),
  )
  .reduce((sum, r) => sum + r.gas, 0n);
const evidenceFirst = rows.find((r) => r.note === "first item on a case")?.gas ?? 0n;
const claimFirst = rows.find((r) => r.note === "first claim on a case")?.gas ?? 0n;
const verifyClean = rows.find((r) => r.note === "no prior dispute")?.gas ?? 0n;
const caseTotal = perCase + evidenceFirst + claimFirst + verifyClean;
lines.push(
  "## One case, start to finish",
  "",
  "Register, one evidence item, acknowledge, one interim protection record, claim, verify:",
  `**${n(caseTotal)} gas units** across the three role keys` +
    (observed
      ? ` (${n(caseTotal * observed.wei)} wei at the observed Fuji price).`
      : "."),
  "",
);

mkdirSync(new URL("../exports/", import.meta.url), { recursive: true });
writeFileSync(new URL("../exports/gas-report.md", import.meta.url), lines.join("\n"));

console.table(rows.map((r) => ({ ...r, gas: Number(r.gas) })));
console.log(
  `Deployer total: ${n(ownerTotal)} gas units over ${setupRows.length + 4} transactions`,
);
console.log(
  observed
    ? `Fuji gas price observed: ${n(observed.wei)} wei per gas unit`
    : "Fuji gas price: not reachable",
);
console.log("Wrote contracts/exports/gas-report.md");
