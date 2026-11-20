// Shared fixtures and enum mirrors for the Bona Chain test suites.
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

// Mirrors of the Solidity enums.
export const Role = {
  None: 0n,
  Registrar: 1n,
  SchoolAdmin: 2n,
  Reviewer: 3n,
  Buyer: 4n,
  Supplier: 5n,
  Receiver: 6n,
  PaymentApprover: 7n,
} as const;
export const ContractKind = { None: 0n, Operations: 1n, Finance: 2n } as const;
export const OrderStatus = {
  None: 0n,
  Approved: 1n,
  Acknowledged: 2n,
  ReleaseAuthorised: 3n,
} as const;
export const Status = {
  None: 0n,
  Reported: 1n,
  Acknowledged: 2n,
  RepairClaimed: 3n,
  Verified: 4n,
  Disputed: 5n,
} as const;
export const Kind = { Report: 0n, Repair: 1n, Review: 2n } as const;
export const Outcome = { Pending: 0n, Verified: 1n, Disputed: 2n } as const;

/** SHA-256 digest of off-chain bytes, as the verifier package computes it. */
export const digest = (label: string) => ethers.sha256(ethers.toUtf8Bytes(label));

/** Matches any positive block timestamp in an event. */
export const anyTime = (ts: bigint) => ts > 0n;

export const INSTITUTION = ethers.id("bona:institution:demo-001");
export const OTHER_INSTITUTION = ethers.id("bona:institution:demo-002");
export const REPORT = ethers.id("report:7c1f");
export const REPORT_COMMITMENT = digest("report-document-v1");
export const REPORT_PHOTO = digest("photo-broken-toilet");
export const REPAIR_PHOTO = digest("photo-repaired-toilet");
export const REVIEW_PHOTO = digest("photo-reviewer-site-visit");
export const CLAIM_1 = digest("repair-claim-1");
export const CLAIM_2 = digest("repair-claim-2");
export const REVIEW_1 = digest("review-1");
export const REVIEW_2 = digest("review-2");

export const ORDER = ethers.id("work-order:0001");
export const ORDER_COMMITMENT = digest("work-order-document-v1");
export const INVOICE_1 = digest("invoice-1");
export const INVOICE_2 = digest("invoice-2");
export const RECEIPT_1 = digest("goods-receipt-1");
export const RECEIPT_2 = digest("goods-receipt-2");
export const MATCH_1 = digest("match-result-1");
export const MATCH_2 = digest("match-result-2");
export const RELEASE_1 = digest("release-decision-1");

/**
 * A factory with two institutions. Every party has its own development signing key.
 * The seven roles are granted for INSTITUTION; OTHER_INSTITUTION has only an administrator.
 */
export async function deployFixture() {
  const [
    owner,
    registrar,
    schoolAdmin,
    reviewer,
    buyer,
    supplier,
    receiver,
    approver,
    outsider,
    otherAdmin,
    floater,
  ] = await ethers.getSigners();
  const factory = await ethers.deployContract("BonaChainFactory", [owner.address]);

  await factory.createInstitution(INSTITUTION);
  await factory.createInstitution(OTHER_INSTITUTION);
  const [operationsAddress, financeAddress] = await factory.institutionOf(INSTITUTION);
  const [otherOperationsAddress, otherFinanceAddress] =
    await factory.institutionOf(OTHER_INSTITUTION);
  const operations = await ethers.getContractAt(
    "InstitutionOperations",
    operationsAddress,
  );
  const finance = await ethers.getContractAt("InstitutionFinance", financeAddress);
  const otherOperations = await ethers.getContractAt(
    "InstitutionOperations",
    otherOperationsAddress,
  );
  const otherFinance = await ethers.getContractAt(
    "InstitutionFinance",
    otherFinanceAddress,
  );

  await factory.grantRole(INSTITUTION, registrar.address, Role.Registrar);
  await factory.grantRole(INSTITUTION, schoolAdmin.address, Role.SchoolAdmin);
  await factory.grantRole(INSTITUTION, reviewer.address, Role.Reviewer);
  await factory.grantRole(INSTITUTION, buyer.address, Role.Buyer);
  await factory.grantRole(INSTITUTION, supplier.address, Role.Supplier);
  await factory.grantRole(INSTITUTION, receiver.address, Role.Receiver);
  await factory.grantRole(INSTITUTION, approver.address, Role.PaymentApprover);
  await factory.grantRole(OTHER_INSTITUTION, otherAdmin.address, Role.SchoolAdmin);

  return {
    factory,
    operations,
    finance,
    otherOperations,
    otherFinance,
    owner,
    registrar,
    schoolAdmin,
    reviewer,
    buyer,
    supplier,
    receiver,
    approver,
    outsider,
    otherAdmin,
    floater,
  };
}

/** A report with one photo, registered by the platform. */
export async function reportedFixture() {
  const ctx = await deployFixture();
  await ctx.operations.connect(ctx.registrar).registerReport(REPORT, REPORT_COMMITMENT);
  await ctx.operations
    .connect(ctx.registrar)
    .registerEvidence(REPORT, REPORT_PHOTO, Kind.Report);
  return ctx;
}

/** The school acknowledged the report and claims the repair is done. Not verified. */
export async function repairClaimedFixture() {
  const ctx = await reportedFixture();
  await ctx.operations.connect(ctx.schoolAdmin).acknowledgeReport(REPORT);
  await ctx.operations
    .connect(ctx.schoolAdmin)
    .registerEvidence(REPORT, REPAIR_PHOTO, Kind.Repair);
  await ctx.operations.connect(ctx.schoolAdmin).claimRepair(REPORT, CLAIM_1);
  return ctx;
}

/** A buyer approved a work order for the report. */
export async function orderApprovedFixture() {
  const ctx = await repairClaimedFixture();
  await ctx.finance.connect(ctx.buyer).approveWorkOrder(ORDER, REPORT, ORDER_COMMITMENT);
  return ctx;
}

/** The supplier accepted the order. No invoice, no goods receipt yet. */
export async function orderAcknowledgedFixture() {
  const ctx = await orderApprovedFixture();
  await ctx.finance.connect(ctx.supplier).acknowledgeWorkOrder(ORDER);
  return ctx;
}

/** Invoice, goods receipt and a passing match are on record. The repair is NOT verified. */
export async function matchedFixture() {
  const ctx = await orderAcknowledgedFixture();
  await ctx.finance.connect(ctx.supplier).submitInvoice(ORDER, INVOICE_1);
  await ctx.finance.connect(ctx.receiver).recordGoodsReceipt(ORDER, RECEIPT_1);
  await ctx.finance
    .connect(ctx.registrar)
    .recordMatchResult(ORDER, INVOICE_1, true, MATCH_1);
  return ctx;
}

/** Everything is in place for the payment approver: matched and independently verified. */
export async function readyFixture() {
  const ctx = await matchedFixture();
  await ctx.operations.connect(ctx.reviewer).verifyRepair(REPORT, REVIEW_1);
  return ctx;
}
