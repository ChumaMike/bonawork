// Rehearses the whole Fuji runbook against the throwaway in-process network, with the same
// code the real scripts run: deploy (with preflight) -> setup -> setup again (idempotent)
// -> fund -> export -> one full case up to the release instruction.
// Sends nothing to any real network and writes only to a temporary folder.
//   pnpm chain:dry-run
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { network } from "hardhat";
import {
  DEFAULT_INSTITUTION_IDS,
  deployFactory,
  fundAddresses,
  idToBytes32,
  LOCAL_CHAIN_ID,
  readChainDeployment,
  readInstitutions,
  revertName,
  setupChain,
  summariseSetup,
  writeChainDeployment,
} from "./lib/chain.js";

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
if (chainId !== LOCAL_CHAIN_ID) {
  throw new Error(
    "chain:dry-run only runs on the local test network (no --network flag).",
  );
}

const [owner, registrar, schoolAdmin, reviewer, buyer, supplier, receiver, approver] =
  await ethers.getSigners();
const digest = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));

// 1. deploy
const { deployment, estimate, gasUsed } = await deployFactory(
  await ethers.getContractFactory("BonaChainFactory", owner),
  owner,
  ethers.provider,
);
console.log(
  `1. deploy   factory ${deployment.factory} | estimated ${estimate.gas} gas, used ${gasUsed}`,
);
const factory = await ethers.getContractAt("BonaChainFactory", deployment.factory, owner);

// 2. setup, twice
const roles = {
  registrar: registrar.address,
  schoolAdmin: schoolAdmin.address,
  reviewer: reviewer.address,
  buyer: buyer.address,
  supplier: supplier.address,
  receiver: receiver.address,
  paymentApprover: approver.address,
};
const first = await setupChain(factory, DEFAULT_INSTITUTION_IDS, roles);
const setupGas = first.reduce((sum, r) => sum + r.gasUsed, 0n);
console.log(`2. setup    ${summariseSetup(first)} | ${setupGas} gas`);
const second = await setupChain(factory, DEFAULT_INSTITUTION_IDS, roles);
console.log(`   again    ${summariseSetup(second)}`);
if (second.some((r) => r.result === "sent")) throw new Error("Setup is not idempotent.");

// 3. fund four fresh finance addresses
const target = ethers.parseEther("0.02");
const fresh = ["buyer", "supplier", "receiver", "paymentApprover"].map((label) => ({
  label,
  account: ethers.Wallet.createRandom().address,
}));
const funded = await fundAddresses(owner, ethers.provider, fresh, target);
const refunded = await fundAddresses(owner, ethers.provider, fresh, target);
console.log(
  `3. fund     ${funded.filter((r) => r.sent > 0n).length} top-up(s) sent, then ` +
    `${refunded.filter((r) => r.sent > 0n).length} on the second run`,
);

// 4. export, to a temporary folder
const dir = pathToFileURL(join(mkdtempSync(join(tmpdir(), "bonachain-dry-run-")), "/"));
const institutions = await readInstitutions(factory);
writeChainDeployment({ ...deployment, institutions }, dir);
const exported = readChainDeployment(chainId, dir);
if (exported?.institutions.length !== DEFAULT_INSTITUTION_IDS.length) {
  throw new Error("Export did not list every institution.");
}
console.log(`4. export   ${exported.institutions.length} institution(s) written`);
console.table(
  exported.institutions.map((i) => ({
    institution: i.institutionId,
    operations: i.operations,
    finance: i.finance,
  })),
);

// 5. one full case on the demo institution
const demo = exported.institutions[0];
const operations = await ethers.getContractAt("InstitutionOperations", demo.operations);
const finance = await ethers.getContractAt("InstitutionFinance", demo.finance);
const report = idToBytes32("00000000-0000-4000-8000-030000000001");
const order = idToBytes32("00000000-0000-4000-8000-050000000001");

await (
  await operations.connect(registrar).registerReport(report, digest("report"))
).wait();
await (await operations.connect(schoolAdmin).acknowledgeReport(report)).wait();
await (
  await finance.connect(buyer).approveWorkOrder(order, report, digest("order"))
).wait();
await (await finance.connect(supplier).acknowledgeWorkOrder(order)).wait();
await (await finance.connect(supplier).submitInvoice(order, digest("invoice"))).wait();
await (
  await finance.connect(receiver).recordGoodsReceipt(order, digest("receipt"))
).wait();
await (
  await finance
    .connect(registrar)
    .recordMatchResult(order, digest("invoice"), true, digest("match"))
).wait();
await (await operations.connect(schoolAdmin).claimRepair(report, digest("claim"))).wait();

// The release is locked until an independent reviewer verifies the repair.
let lockedBy = "";
try {
  await finance.connect(approver).authoriseRelease.staticCall(order, digest("release"));
} catch (error) {
  lockedBy = revertName(finance.interface, error) ?? "unknown";
}
if (lockedBy !== "RepairNotVerified") {
  throw new Error(
    `Expected the release to be locked by RepairNotVerified, got ${lockedBy}.`,
  );
}
await (await operations.connect(reviewer).verifyRepair(report, digest("review"))).wait();
await (await finance.connect(approver).authoriseRelease(order, digest("release"))).wait();
const status = (await finance.getWorkOrder(order)).status;
if (status !== 3n) throw new Error("The release instruction was not recorded.");
console.log(
  "5. case     release locked by RepairNotVerified until the review, then authorised",
);

console.log("\nDRY RUN OK: nothing left the local test network.");
