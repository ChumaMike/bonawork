// Demonstration: a school administrator cannot close their own repair.
// Runs on a throwaway in-process network:  pnpm demo:unauthorised-closure
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();
const [owner, registrar, schoolAdmin, reviewer] = await ethers.getSigners();
const registry = await ethers.deployContract("BonaRegistry", [owner.address]);

const Role = { Registrar: 1, SchoolAdmin: 2, Reviewer: 3 } as const;
const STATUS = [
  "None",
  "Reported",
  "Acknowledged",
  "RepairClaimed",
  "Verified",
  "Disputed",
];
const digest = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));
const status = async () => STATUS[Number(await registry.statusOf(reportId))];

const schoolId = ethers.id("bona:school:demo-001");
const reportId = ethers.id("report:demo");

console.log("Signing keys (all different):");
console.log(`  school admin : ${schoolAdmin.address}`);
console.log(`  reviewer     : ${reviewer.address}\n`);

await registry.registerSchool(schoolId);
await registry.grantRole(schoolId, registrar.address, Role.Registrar);
await registry.grantRole(schoolId, schoolAdmin.address, Role.SchoolAdmin);
await registry.grantRole(schoolId, reviewer.address, Role.Reviewer);

await registry.connect(registrar).registerReport(reportId, schoolId, digest("report"));
await registry.connect(schoolAdmin).acknowledgeReport(reportId);
await registry.connect(schoolAdmin).claimRepair(reportId, digest("repair claim"));
console.log(
  `1. School admin claims the repair is complete   -> status: ${await status()}`,
);

console.log("2. School admin tries to verify their own repair...");
try {
  await registry.connect(schoolAdmin).verifyRepair(reportId, digest("self review"));
  throw new Error("BUG: self-verification was accepted");
} catch (error) {
  const data = (error as { data?: string }).data;
  const parsed = data ? registry.interface.parseError(data) : null;
  if (!parsed) throw error;
  console.log(`   REVERTED with ${parsed.name}(account=${parsed.args[0]})`);
}
console.log(
  `   Report is still open                         -> status: ${await status()}`,
);

await registry.connect(reviewer).verifyRepair(reportId, digest("independent review"));
console.log(
  `3. Independent reviewer verifies                -> status: ${await status()}`,
);
