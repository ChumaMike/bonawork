import { expect } from "chai";
import { network } from "hardhat";
import {
  anyTime,
  CLAIM_2,
  deployFixture,
  digest,
  INSTITUTION,
  INVOICE_1,
  INVOICE_2,
  MATCH_1,
  MATCH_2,
  matchedFixture,
  ORDER,
  ORDER_COMMITMENT,
  orderAcknowledgedFixture,
  orderApprovedFixture,
  OrderStatus,
  OTHER_INSTITUTION,
  readyFixture,
  RECEIPT_1,
  RECEIPT_2,
  RELEASE_1,
  repairClaimedFixture,
  REPORT,
  reportedFixture,
  REVIEW_1,
  REVIEW_2,
  Role,
  Status,
} from "./helpers.js";

const { ethers, networkHelpers } = await network.getOrCreate();

type Ctx = Awaited<ReturnType<typeof deployFixture>>;
type Signer = Ctx["owner"];

const DISPUTE_1 = digest("payment-dispute-1");
const DISPUTE_CLOSE_1 = digest("payment-dispute-1-closed");

describe("InstitutionFinance", () => {
  describe("1. the happy path", () => {
    it("runs order -> acknowledgement -> invoice -> receipt -> match -> verification -> release", async () => {
      const {
        finance,
        operations,
        buyer,
        supplier,
        receiver,
        registrar,
        reviewer,
        approver,
      } = await networkHelpers.loadFixture(repairClaimedFixture);

      await expect(
        finance.connect(buyer).approveWorkOrder(ORDER, REPORT, ORDER_COMMITMENT),
      )
        .to.emit(finance, "WorkOrderApproved")
        .withArgs(ORDER, REPORT, ORDER_COMMITMENT, buyer.address, anyTime);
      await expect(finance.connect(supplier).acknowledgeWorkOrder(ORDER))
        .to.emit(finance, "WorkOrderAcknowledged")
        .withArgs(ORDER, REPORT, supplier.address, anyTime);
      await expect(finance.connect(supplier).submitInvoice(ORDER, INVOICE_1))
        .to.emit(finance, "InvoiceSubmitted")
        .withArgs(ORDER, REPORT, 0n, INVOICE_1, supplier.address, anyTime);
      await expect(finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_1))
        .to.emit(finance, "GoodsReceiptRecorded")
        .withArgs(ORDER, REPORT, 0n, RECEIPT_1, receiver.address, anyTime);
      await expect(
        finance.connect(registrar).recordMatchResult(ORDER, INVOICE_1, true, MATCH_1),
      )
        .to.emit(finance, "MatchRecorded")
        .withArgs(ORDER, REPORT, INVOICE_1, true, MATCH_1, registrar.address, anyTime);

      // Matched, but the repair is only claimed: the release stays locked.
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "RepairNotVerified")
        .withArgs(REPORT, Status.RepairClaimed);

      await operations.connect(reviewer).verifyRepair(REPORT, REVIEW_1);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.emit(finance, "ReleaseAuthorised")
        .withArgs(ORDER, REPORT, RELEASE_1, approver.address, anyTime);

      const order = await finance.getWorkOrder(ORDER);
      expect(order.reportId).to.equal(REPORT);
      expect(order.commitment).to.equal(ORDER_COMMITMENT);
      expect(order.status).to.equal(OrderStatus.ReleaseAuthorised);
      expect(order.buyer).to.equal(buyer.address);
      expect(order.supplier).to.equal(supplier.address);
      expect(order.invoiceCount).to.equal(1n);
      expect(order.receiptCount).to.equal(1n);
      expect(order.latestInvoice).to.equal(INVOICE_1);
      expect(order.latestReceipt).to.equal(RECEIPT_1);
      expect(order.currentMatch).to.equal(MATCH_1);
      expect(order.matchPassed).to.equal(true);
      expect(order.disputeOpen).to.equal(false);
      expect(order.releasedBy).to.equal(approver.address);
      expect(order.releaseCommitment).to.equal(RELEASE_1);
      expect(order.releasedAt).to.equal(BigInt(await networkHelpers.time.latest()));

      expect(await finance.actedAs(ORDER, buyer.address)).to.equal(Role.Buyer);
      expect(await finance.actedAs(ORDER, supplier.address)).to.equal(Role.Supplier);
      expect(await finance.actedAs(ORDER, receiver.address)).to.equal(Role.Receiver);
      expect(await finance.actedAs(ORDER, registrar.address)).to.equal(Role.Registrar);
      expect(await finance.actedAs(ORDER, approver.address)).to.equal(
        Role.PaymentApprover,
      );
      expect(await finance.actedAs(ORDER, reviewer.address)).to.equal(Role.None);
    });

    it("never changes the report status: finance steps are not repair steps", async () => {
      const { finance, operations, approver, reviewer } =
        await networkHelpers.loadFixture(matchedFixture);
      // Order approved, acknowledged, invoiced, received and matched: still only claimed.
      expect(await operations.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      expect(await operations.claimCount(REPORT)).to.equal(1n);

      await operations.connect(reviewer).verifyRepair(REPORT, REVIEW_1);
      const claimBefore = await operations.getClaim(REPORT, 0);
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);
      // The release instruction leaves the report exactly as the reviewer left it.
      expect(await operations.statusOf(REPORT)).to.equal(Status.Verified);
      expect(await operations.getClaim(REPORT, 0)).to.deep.equal(claimBefore);
    });

    it("replays the whole money trail from events, in order", async () => {
      const { finance, approver } = await networkHelpers.loadFixture(readyFixture);
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);

      const logs = await ethers.provider.getLogs({
        address: await finance.getAddress(),
        fromBlock: 0,
        toBlock: "latest",
      });
      const trail = logs.map((log) => finance.interface.parseLog(log)!);
      expect(trail.map((e) => e.name)).to.deep.equal([
        "WorkOrderApproved",
        "WorkOrderAcknowledged",
        "InvoiceSubmitted",
        "GoodsReceiptRecorded",
        "MatchRecorded",
        "ReleaseAuthorised",
      ]);
      // Every event names the work order and the report in its first two indexed slots.
      for (const event of trail) {
        expect(event.args[0]).to.equal(ORDER);
        expect(event.args[1]).to.equal(REPORT);
      }
    });

    it("returns an all-zero record for an unknown work order", async () => {
      const { finance } = await networkHelpers.loadFixture(deployFixture);
      const order = await finance.getWorkOrder(ORDER);
      expect(order.status).to.equal(OrderStatus.None);
      expect(order.reportId).to.equal(ethers.ZeroHash);
      expect(order.buyer).to.equal(ethers.ZeroAddress);
    });
  });

  describe("2. approving a work order", () => {
    it("needs the buyer role", async () => {
      const {
        finance,
        supplier,
        receiver,
        approver,
        registrar,
        schoolAdmin,
        owner,
        outsider,
      } = await networkHelpers.loadFixture(repairClaimedFixture);
      for (const signer of [
        supplier,
        receiver,
        approver,
        registrar,
        schoolAdmin,
        owner,
        outsider,
      ]) {
        await expect(
          finance.connect(signer).approveWorkOrder(ORDER, REPORT, ORDER_COMMITMENT),
        )
          .to.be.revertedWithCustomError(finance, "Unauthorized")
          .withArgs(signer.address, Role.Buyer);
      }
    });

    it("needs a report that exists in this institution's operations contract", async () => {
      const { factory, finance, otherFinance, otherOperations, buyer, registrar } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      const missing = ethers.id("report:missing");
      await expect(
        finance.connect(buyer).approveWorkOrder(ORDER, missing, ORDER_COMMITMENT),
      )
        .to.be.revertedWithCustomError(finance, "ReportNotFound")
        .withArgs(missing);

      // A report of another institution does not count, and REPORT does not exist there.
      await factory.grantRole(OTHER_INSTITUTION, registrar.address, Role.Registrar);
      await factory.grantRole(OTHER_INSTITUTION, buyer.address, Role.Buyer);
      const otherReport = ethers.id("report:other-institution");
      await otherOperations.connect(registrar).registerReport(otherReport, digest("o"));
      await expect(
        finance.connect(buyer).approveWorkOrder(ORDER, otherReport, ORDER_COMMITMENT),
      )
        .to.be.revertedWithCustomError(finance, "ReportNotFound")
        .withArgs(otherReport);
      await expect(
        otherFinance.connect(buyer).approveWorkOrder(ORDER, REPORT, ORDER_COMMITMENT),
      )
        .to.be.revertedWithCustomError(otherFinance, "ReportNotFound")
        .withArgs(REPORT);
    });

    it("refuses a second order with the same id, a reused commitment and zero values", async () => {
      const { finance, buyer } = await networkHelpers.loadFixture(orderApprovedFixture);
      const asBuyer = finance.connect(buyer);

      await expect(asBuyer.approveWorkOrder(ORDER, REPORT, digest("v2")))
        .to.be.revertedWithCustomError(finance, "WorkOrderAlreadyExists")
        .withArgs(ORDER);
      await expect(
        asBuyer.approveWorkOrder(ethers.id("order:2"), REPORT, ORDER_COMMITMENT),
      )
        .to.be.revertedWithCustomError(finance, "DuplicateCommitment")
        .withArgs(ORDER_COMMITMENT);
      for (const args of [
        [ethers.ZeroHash, REPORT, digest("x")],
        [ethers.id("order:2"), ethers.ZeroHash, digest("x")],
        [ethers.id("order:2"), REPORT, ethers.ZeroHash],
      ] as const) {
        await expect(asBuyer.approveWorkOrder(...args)).to.be.revertedWithCustomError(
          finance,
          "ZeroValue",
        );
      }
    });

    it("allows a second order for the same report under a new id", async () => {
      const { finance, buyer } = await networkHelpers.loadFixture(orderApprovedFixture);
      await finance
        .connect(buyer)
        .approveWorkOrder(ethers.id("order:2"), REPORT, digest("order-2"));
      expect((await finance.getWorkOrder(ethers.id("order:2"))).status).to.equal(
        OrderStatus.Approved,
      );
    });
  });

  describe("3. supplier binding", () => {
    it("binds the order to the supplier who acknowledges it, once", async () => {
      const { finance, supplier, buyer, outsider } =
        await networkHelpers.loadFixture(orderApprovedFixture);

      for (const signer of [buyer, outsider]) {
        const attempt = finance.connect(signer).acknowledgeWorkOrder(ORDER);
        if (signer === buyer) {
          // The buyer already acted on this order as buyer.
          await expect(attempt)
            .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
            .withArgs(buyer.address, ORDER);
        } else {
          await expect(attempt)
            .to.be.revertedWithCustomError(finance, "Unauthorized")
            .withArgs(signer.address, Role.Supplier);
        }
      }
      await expect(finance.connect(supplier).acknowledgeWorkOrder(ethers.id("nope")))
        .to.be.revertedWithCustomError(finance, "WorkOrderNotFound")
        .withArgs(ethers.id("nope"));

      await finance.connect(supplier).acknowledgeWorkOrder(ORDER);
      const order = await finance.getWorkOrder(ORDER);
      expect(order.status).to.equal(OrderStatus.Acknowledged);
      expect(order.supplier).to.equal(supplier.address);
      expect(order.acknowledgedAt).to.equal(BigInt(await networkHelpers.time.latest()));

      await expect(finance.connect(supplier).acknowledgeWorkOrder(ORDER))
        .to.be.revertedWithCustomError(finance, "InvalidOrderState")
        .withArgs(ORDER, OrderStatus.Acknowledged);
    });

    it("refuses an invoice before the order is acknowledged", async () => {
      const { finance, supplier } =
        await networkHelpers.loadFixture(orderApprovedFixture);
      await expect(finance.connect(supplier).submitInvoice(ORDER, INVOICE_1))
        .to.be.revertedWithCustomError(finance, "InvalidOrderState")
        .withArgs(ORDER, OrderStatus.Approved);
    });

    it("only lets the bound supplier invoice: a second supplier of the institution is refused", async () => {
      const { factory, finance, supplier, floater } = await networkHelpers.loadFixture(
        orderAcknowledgedFixture,
      );
      await factory.grantRole(INSTITUTION, floater.address, Role.Supplier);

      await expect(finance.connect(floater).submitInvoice(ORDER, INVOICE_1))
        .to.be.revertedWithCustomError(finance, "Unauthorized")
        .withArgs(floater.address, Role.Supplier);
      // The other supplier cannot take over the order either.
      await expect(finance.connect(floater).acknowledgeWorkOrder(ORDER))
        .to.be.revertedWithCustomError(finance, "InvalidOrderState")
        .withArgs(ORDER, OrderStatus.Acknowledged);
      // The refused attempts left no trace.
      expect(await finance.actedAs(ORDER, floater.address)).to.equal(Role.None);
      expect((await finance.getWorkOrder(ORDER)).invoiceCount).to.equal(0n);

      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_1);
      expect((await finance.getWorkOrder(ORDER)).latestInvoice).to.equal(INVOICE_1);
    });

    it("stops the bound supplier invoicing once its role is revoked", async () => {
      const { factory, finance, supplier } = await networkHelpers.loadFixture(
        orderAcknowledgedFixture,
      );
      await factory.revokeRole(INSTITUTION, supplier.address);
      await expect(finance.connect(supplier).submitInvoice(ORDER, INVOICE_1))
        .to.be.revertedWithCustomError(finance, "Unauthorized")
        .withArgs(supplier.address, Role.Supplier);
    });

    it("numbers invoices and refuses reused or zero commitments", async () => {
      const { finance, supplier } = await networkHelpers.loadFixture(
        orderAcknowledgedFixture,
      );
      const asSupplier = finance.connect(supplier);
      await asSupplier.submitInvoice(ORDER, INVOICE_1);
      await expect(asSupplier.submitInvoice(ORDER, INVOICE_2))
        .to.emit(finance, "InvoiceSubmitted")
        .withArgs(ORDER, REPORT, 1n, INVOICE_2, supplier.address, anyTime);

      await expect(asSupplier.submitInvoice(ORDER, INVOICE_1))
        .to.be.revertedWithCustomError(finance, "DuplicateCommitment")
        .withArgs(INVOICE_1);
      // The order document cannot be passed off as an invoice.
      await expect(asSupplier.submitInvoice(ORDER, ORDER_COMMITMENT))
        .to.be.revertedWithCustomError(finance, "DuplicateCommitment")
        .withArgs(ORDER_COMMITMENT);
      await expect(
        asSupplier.submitInvoice(ORDER, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(finance, "ZeroValue");
      expect((await finance.getWorkOrder(ORDER)).invoiceCount).to.equal(2n);
    });
  });

  describe("4. goods receipts and match results", () => {
    it("only lets the receiver record a goods receipt", async () => {
      const { finance, receiver, supplier, buyer, outsider } =
        await networkHelpers.loadFixture(orderAcknowledgedFixture);

      // The supplier cannot confirm delivery of its own goods; nor can the buyer.
      for (const signer of [supplier, buyer]) {
        await expect(finance.connect(signer).recordGoodsReceipt(ORDER, RECEIPT_1))
          .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
          .withArgs(signer.address, ORDER);
      }
      await expect(finance.connect(outsider).recordGoodsReceipt(ORDER, RECEIPT_1))
        .to.be.revertedWithCustomError(finance, "Unauthorized")
        .withArgs(outsider.address, Role.Receiver);

      await finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_1);
      await expect(finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_2))
        .to.emit(finance, "GoodsReceiptRecorded")
        .withArgs(ORDER, REPORT, 1n, RECEIPT_2, receiver.address, anyTime);
      await expect(finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_1))
        .to.be.revertedWithCustomError(finance, "DuplicateCommitment")
        .withArgs(RECEIPT_1);
      await expect(
        finance.connect(receiver).recordGoodsReceipt(ORDER, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(finance, "ZeroValue");
    });

    it("accepts a goods receipt before the supplier has acknowledged", async () => {
      const { finance, receiver } =
        await networkHelpers.loadFixture(orderApprovedFixture);
      await finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_1);
      expect((await finance.getWorkOrder(ORDER)).receiptCount).to.equal(1n);
    });

    it("only lets the platform relayer record a match, and only for the latest invoice", async () => {
      const { finance, registrar, supplier, buyer, approver, outsider } =
        await networkHelpers.loadFixture(orderAcknowledgedFixture);
      const asRegistrar = finance.connect(registrar);

      await expect(asRegistrar.recordMatchResult(ORDER, INVOICE_1, true, MATCH_1))
        .to.be.revertedWithCustomError(finance, "NoInvoice")
        .withArgs(ORDER);

      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_1);
      // Nobody with a stake in the outcome can record the match.
      for (const signer of [supplier, buyer]) {
        await expect(
          finance.connect(signer).recordMatchResult(ORDER, INVOICE_1, true, MATCH_1),
        )
          .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
          .withArgs(signer.address, ORDER);
      }
      for (const signer of [approver, outsider]) {
        await expect(
          finance.connect(signer).recordMatchResult(ORDER, INVOICE_1, true, MATCH_1),
        )
          .to.be.revertedWithCustomError(finance, "Unauthorized")
          .withArgs(signer.address, Role.Registrar);
      }

      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_2);
      await expect(asRegistrar.recordMatchResult(ORDER, INVOICE_1, true, MATCH_1))
        .to.be.revertedWithCustomError(finance, "StaleInvoice")
        .withArgs(INVOICE_1);
      await expect(
        asRegistrar.recordMatchResult(ORDER, digest("never-submitted"), true, MATCH_1),
      )
        .to.be.revertedWithCustomError(finance, "StaleInvoice")
        .withArgs(digest("never-submitted"));
      await expect(
        asRegistrar.recordMatchResult(ORDER, INVOICE_2, true, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(finance, "ZeroValue");

      await asRegistrar.recordMatchResult(ORDER, INVOICE_2, false, MATCH_1);
      let order = await finance.getWorkOrder(ORDER);
      expect(order.currentMatch).to.equal(MATCH_1);
      expect(order.matchPassed).to.equal(false);

      await expect(asRegistrar.recordMatchResult(ORDER, INVOICE_2, true, MATCH_1))
        .to.be.revertedWithCustomError(finance, "DuplicateCommitment")
        .withArgs(MATCH_1);
      // A later match for the same invoice replaces the earlier one.
      await asRegistrar.recordMatchResult(ORDER, INVOICE_2, true, MATCH_2);
      order = await finance.getWorkOrder(ORDER);
      expect(order.currentMatch).to.equal(MATCH_2);
      expect(order.matchPassed).to.equal(true);
    });

    it("refuses a match before the order is acknowledged", async () => {
      const { finance, registrar } =
        await networkHelpers.loadFixture(orderApprovedFixture);
      await expect(
        finance.connect(registrar).recordMatchResult(ORDER, INVOICE_1, true, MATCH_1),
      )
        .to.be.revertedWithCustomError(finance, "InvalidOrderState")
        .withArgs(ORDER, OrderStatus.Approved);
    });
  });

  describe("5. a match is only current for the latest invoice and receipt", () => {
    it("a new invoice voids a passing match", async () => {
      const { finance, supplier, registrar, approver } =
        await networkHelpers.loadFixture(readyFixture);
      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_2);

      const order = await finance.getWorkOrder(ORDER);
      expect(order.currentMatch).to.equal(ethers.ZeroHash);
      expect(order.matchPassed).to.equal(false);
      expect(order.latestInvoice).to.equal(INVOICE_2);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "MatchNotPassing")
        .withArgs(ORDER);

      // The old invoice cannot be matched again; the new one can.
      await expect(
        finance.connect(registrar).recordMatchResult(ORDER, INVOICE_1, true, MATCH_2),
      )
        .to.be.revertedWithCustomError(finance, "StaleInvoice")
        .withArgs(INVOICE_1);
      await finance.connect(registrar).recordMatchResult(ORDER, INVOICE_2, true, MATCH_2);
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);
    });

    it("a later goods receipt voids a passing match", async () => {
      const { finance, receiver, registrar, approver } =
        await networkHelpers.loadFixture(readyFixture);
      await finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_2);

      const order = await finance.getWorkOrder(ORDER);
      expect(order.currentMatch).to.equal(ethers.ZeroHash);
      expect(order.matchPassed).to.equal(false);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "MatchNotPassing")
        .withArgs(ORDER);

      // The same invoice is matched again, this time against both receipts.
      await finance.connect(registrar).recordMatchResult(ORDER, INVOICE_1, true, MATCH_2);
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);
    });

    it("a failed match after a passing one blocks the release", async () => {
      const { finance, registrar, approver } =
        await networkHelpers.loadFixture(readyFixture);
      await finance
        .connect(registrar)
        .recordMatchResult(ORDER, INVOICE_1, false, MATCH_2);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "MatchNotPassing")
        .withArgs(ORDER);
    });
  });

  describe("6. authoriseRelease refuses in a fixed order", () => {
    // Each test builds a state in which every LATER check would fail too, so it proves
    // which refusal comes first.

    it("0. a zero commitment is refused before anything else", async () => {
      const { finance, outsider } = await networkHelpers.loadFixture(deployFixture);
      await expect(
        finance.connect(outsider).authoriseRelease(ethers.id("nope"), ethers.ZeroHash),
      ).to.be.revertedWithCustomError(finance, "ZeroValue");
    });

    it("1. WorkOrderNotFound", async () => {
      const { finance, outsider, approver } =
        await networkHelpers.loadFixture(deployFixture);
      for (const signer of [outsider, approver]) {
        await expect(
          finance.connect(signer).authoriseRelease(ethers.id("nope"), RELEASE_1),
        )
          .to.be.revertedWithCustomError(finance, "WorkOrderNotFound")
          .withArgs(ethers.id("nope"));
      }
    });

    it("2. SeparationOfDuties, before the role is even looked at", async () => {
      const { finance, buyer } = await networkHelpers.loadFixture(orderApprovedFixture);
      // The buyer does not hold the approver role either, and the order is nowhere near
      // ready: the refusal is still the separation of duties.
      await expect(finance.connect(buyer).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
        .withArgs(buyer.address, ORDER);
    });

    it("3. Unauthorized", async () => {
      const { finance, outsider, reviewer, registrar, owner } =
        await networkHelpers.loadFixture(orderApprovedFixture);
      for (const signer of [outsider, reviewer, registrar, owner]) {
        await expect(finance.connect(signer).authoriseRelease(ORDER, RELEASE_1))
          .to.be.revertedWithCustomError(finance, "Unauthorized")
          .withArgs(signer.address, Role.PaymentApprover);
      }
    });

    it("4. InvalidOrderState", async () => {
      const { finance, approver } =
        await networkHelpers.loadFixture(orderApprovedFixture);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "InvalidOrderState")
        .withArgs(ORDER, OrderStatus.Approved);
    });

    it("5. NoInvoice", async () => {
      const { finance, approver, buyer } = await networkHelpers.loadFixture(
        orderAcknowledgedFixture,
      );
      await finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "NoInvoice")
        .withArgs(ORDER);
    });

    it("6. NoGoodsReceipt", async () => {
      const { finance, approver, buyer, supplier, registrar } =
        await networkHelpers.loadFixture(orderAcknowledgedFixture);
      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_1);
      await finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "NoGoodsReceipt")
        .withArgs(ORDER);

      // Even a match recorded as passing does not stand in for a goods receipt.
      await finance.connect(registrar).recordMatchResult(ORDER, INVOICE_1, true, MATCH_1);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "NoGoodsReceipt")
        .withArgs(ORDER);
    });

    it("7. MatchNotPassing (no match yet, then a failed match)", async () => {
      const { finance, approver, buyer, supplier, receiver, registrar } =
        await networkHelpers.loadFixture(orderAcknowledgedFixture);
      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_1);
      await finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_1);
      await finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1);

      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "MatchNotPassing")
        .withArgs(ORDER);
      await finance
        .connect(registrar)
        .recordMatchResult(ORDER, INVOICE_1, false, MATCH_1);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "MatchNotPassing")
        .withArgs(ORDER);
    });

    it("8. DisputeOpen", async () => {
      const { finance, approver, buyer } =
        await networkHelpers.loadFixture(matchedFixture);
      await finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1);
      // The repair is not verified either; the open dispute is reported first.
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "DisputeOpen")
        .withArgs(ORDER);
    });

    it("9. RepairNotVerified, with the report status as a number", async () => {
      const { finance, operations, approver, reviewer, schoolAdmin } =
        await networkHelpers.loadFixture(matchedFixture);

      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "RepairNotVerified")
        .withArgs(REPORT, 3n); // RepairClaimed

      await operations.connect(reviewer).disputeRepair(REPORT, REVIEW_1);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "RepairNotVerified")
        .withArgs(REPORT, 5n); // Disputed

      await operations.connect(schoolAdmin).claimRepair(REPORT, CLAIM_2);
      await operations.connect(reviewer).verifyRepair(REPORT, REVIEW_2);
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);
    });

    it("9b. RepairNotVerified for a report that was only reported or acknowledged", async () => {
      const {
        finance,
        operations,
        buyer,
        supplier,
        receiver,
        registrar,
        approver,
        schoolAdmin,
      } = await networkHelpers.loadFixture(reportedFixture);
      await finance.connect(buyer).approveWorkOrder(ORDER, REPORT, ORDER_COMMITMENT);
      await finance.connect(supplier).acknowledgeWorkOrder(ORDER);
      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_1);
      await finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_1);
      await finance.connect(registrar).recordMatchResult(ORDER, INVOICE_1, true, MATCH_1);

      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "RepairNotVerified")
        .withArgs(REPORT, 1n); // Reported
      await operations.connect(schoolAdmin).acknowledgeReport(REPORT);
      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "RepairNotVerified")
        .withArgs(REPORT, 2n); // Acknowledged
    });

    it("10. a reused commitment is refused last", async () => {
      const { finance, approver } = await networkHelpers.loadFixture(readyFixture);
      await expect(finance.connect(approver).authoriseRelease(ORDER, MATCH_1))
        .to.be.revertedWithCustomError(finance, "DuplicateCommitment")
        .withArgs(MATCH_1);
      // In a blocked state the blocker wins over the reused commitment.
      const blocked = await networkHelpers.loadFixture(matchedFixture);
      await expect(
        blocked.finance.connect(blocked.approver).authoriseRelease(ORDER, MATCH_1),
      ).to.be.revertedWithCustomError(blocked.finance, "RepairNotVerified");
    });

    it("can be probed with a read-only call from the approver address", async () => {
      const blocked = await networkHelpers.loadFixture(matchedFixture);
      await expect(
        blocked.finance
          .connect(blocked.approver)
          .authoriseRelease.staticCall(ORDER, RELEASE_1),
      ).to.be.revertedWithCustomError(blocked.finance, "RepairNotVerified");

      const ready = await networkHelpers.loadFixture(readyFixture);
      await ready.finance
        .connect(ready.approver)
        .authoriseRelease.staticCall(ORDER, RELEASE_1);
      // The probe wrote nothing.
      expect((await ready.finance.getWorkOrder(ORDER)).status).to.equal(
        OrderStatus.Acknowledged,
      );
    });
  });

  describe("7. a release is authorised once", () => {
    it("refuses a second release", async () => {
      const { factory, finance, approver, floater } =
        await networkHelpers.loadFixture(readyFixture);
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);

      await expect(finance.connect(approver).authoriseRelease(ORDER, digest("release-2")))
        .to.be.revertedWithCustomError(finance, "InvalidOrderState")
        .withArgs(ORDER, OrderStatus.ReleaseAuthorised);
      // A second payment approver cannot authorise it again either.
      await factory.grantRole(INSTITUTION, floater.address, Role.PaymentApprover);
      await expect(finance.connect(floater).authoriseRelease(ORDER, digest("release-2")))
        .to.be.revertedWithCustomError(finance, "InvalidOrderState")
        .withArgs(ORDER, OrderStatus.ReleaseAuthorised);

      const order = await finance.getWorkOrder(ORDER);
      expect(order.releasedBy).to.equal(approver.address);
      expect(order.releaseCommitment).to.equal(RELEASE_1);
    });

    it("closes the order to every further record", async () => {
      const { finance, approver, buyer, supplier, receiver, registrar } =
        await networkHelpers.loadFixture(readyFixture);
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);
      const before = await finance.getWorkOrder(ORDER);

      for (const attempt of [
        finance.connect(supplier).acknowledgeWorkOrder(ORDER),
        finance.connect(supplier).submitInvoice(ORDER, INVOICE_2),
        finance.connect(receiver).recordGoodsReceipt(ORDER, RECEIPT_2),
        finance.connect(registrar).recordMatchResult(ORDER, INVOICE_1, false, MATCH_2),
        finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1),
        finance.connect(receiver).openPaymentDispute(ORDER, DISPUTE_1),
      ]) {
        await expect(attempt)
          .to.be.revertedWithCustomError(finance, "InvalidOrderState")
          .withArgs(ORDER, OrderStatus.ReleaseAuthorised);
      }
      await expect(finance.connect(buyer).closePaymentDispute(ORDER, DISPUTE_CLOSE_1))
        .to.be.revertedWithCustomError(finance, "NoOpenDispute")
        .withArgs(ORDER);
      await expect(
        finance.connect(buyer).approveWorkOrder(ORDER, REPORT, digest("again")),
      )
        .to.be.revertedWithCustomError(finance, "WorkOrderAlreadyExists")
        .withArgs(ORDER);
      expect(await finance.getWorkOrder(ORDER)).to.deep.equal(before);
    });

    it("exposes no function that edits, deletes or reverses a record", async () => {
      const { finance } = await networkHelpers.loadFixture(deployFixture);
      const mutating = finance.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => ethers.FunctionFragment.from(f))
        .filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.name)
        .sort();
      expect(mutating).to.deep.equal([
        "acknowledgeWorkOrder",
        "approveWorkOrder",
        "authoriseRelease",
        "closePaymentDispute",
        "openPaymentDispute",
        "recordGoodsReceipt",
        "recordMatchResult",
        "submitInvoice",
      ]);
      // Nothing is payable: the contract cannot hold or move money.
      expect(
        finance.interface.fragments.filter(
          (f) => f.type === "function" && ethers.FunctionFragment.from(f).payable,
        ),
      ).to.have.lengthOf(0);
    });
  });

  describe("8. separation of duties per work order (actedAs)", () => {
    const ROLE_NAMES = [
      "Buyer",
      "Supplier",
      "Receiver",
      "Registrar",
      "PaymentApprover",
    ] as const;
    type RoleName = (typeof ROLE_NAMES)[number];
    type Cast = Record<RoleName, Signer>;

    const fresh = (label: string) => digest(`sod:${label}`);

    /** Plays the standard case with `cast`, stopping once `stopAfter` has acted. */
    async function playUntil(ctx: Ctx, cast: Cast, stopAfter: RoleName) {
      const { finance, operations, reviewer } = ctx;
      await finance.connect(cast.Buyer).approveWorkOrder(ORDER, REPORT, ORDER_COMMITMENT);
      if (stopAfter === "Buyer") return;
      await finance.connect(cast.Supplier).acknowledgeWorkOrder(ORDER);
      await finance.connect(cast.Supplier).submitInvoice(ORDER, INVOICE_1);
      if (stopAfter === "Supplier") return;
      await finance.connect(cast.Receiver).recordGoodsReceipt(ORDER, RECEIPT_1);
      if (stopAfter === "Receiver") return;
      await finance
        .connect(cast.Registrar)
        .recordMatchResult(ORDER, INVOICE_1, true, MATCH_1);
      if (stopAfter === "Registrar") return;
      await operations.connect(reviewer).verifyRepair(REPORT, REVIEW_1);
      await finance.connect(cast.PaymentApprover).authoriseRelease(ORDER, RELEASE_1);
    }

    /** Every finance action that needs `role`, attempted by `signer` on the order. */
    function attemptsAs(ctx: Ctx, role: RoleName, signer: Signer) {
      const finance = ctx.finance.connect(signer);
      switch (role) {
        case "Buyer":
          return [finance.openPaymentDispute(ORDER, fresh("dispute"))];
        case "Supplier":
          return [
            finance.acknowledgeWorkOrder(ORDER),
            finance.submitInvoice(ORDER, fresh("invoice")),
          ];
        case "Receiver":
          return [
            finance.recordGoodsReceipt(ORDER, fresh("receipt")),
            finance.openPaymentDispute(ORDER, fresh("dispute")),
          ];
        case "Registrar":
          return [finance.recordMatchResult(ORDER, INVOICE_1, true, fresh("match"))];
        case "PaymentApprover":
          return [finance.authoriseRelease(ORDER, fresh("release"))];
      }
    }

    // 5 x 4 = 20 pairings: act under one role, be re-assigned, try every other role.
    for (const first of ROLE_NAMES) {
      for (const second of ROLE_NAMES) {
        if (first === second) continue;
        it(`an account that acted as ${first} can never act as ${second} on the same order`, async () => {
          const ctx = await networkHelpers.loadFixture(repairClaimedFixture);
          const { factory, finance, floater } = ctx;
          const cast: Cast = {
            Buyer: ctx.buyer,
            Supplier: ctx.supplier,
            Receiver: ctx.receiver,
            Registrar: ctx.registrar,
            PaymentApprover: ctx.approver,
          };
          cast[first] = floater;

          await factory.grantRole(INSTITUTION, floater.address, Role[first]);
          await playUntil(ctx, cast, first);
          expect(await finance.actedAs(ORDER, floater.address)).to.equal(Role[first]);

          // The owner deliberately re-assigns the account to another role.
          await factory.revokeRole(INSTITUTION, floater.address);
          await factory.grantRole(INSTITUTION, floater.address, Role[second]);

          for (const attempt of attemptsAs(ctx, second, floater)) {
            await expect(attempt)
              .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
              .withArgs(floater.address, ORDER);
          }
          // The memory of the first role is permanent.
          expect(await finance.actedAs(ORDER, floater.address)).to.equal(Role[first]);
        });
      }
    }

    it("is about what the account did on THIS order: a fresh order is open to the new role", async () => {
      const ctx = await networkHelpers.loadFixture(orderAcknowledgedFixture);
      const { factory, finance, operations, supplier, buyer, registrar } = ctx;
      // The supplier of ORDER becomes a receiver.
      await factory.revokeRole(INSTITUTION, supplier.address);
      await factory.grantRole(INSTITUTION, supplier.address, Role.Receiver);

      await expect(finance.connect(supplier).recordGoodsReceipt(ORDER, RECEIPT_1))
        .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
        .withArgs(supplier.address, ORDER);

      // On an order it never supplied, it may receive.
      const report2 = ethers.id("report:second");
      const order2 = ethers.id("work-order:second");
      await operations.connect(registrar).registerReport(report2, digest("report-2"));
      await finance.connect(buyer).approveWorkOrder(order2, report2, digest("order-2"));
      await finance.connect(supplier).recordGoodsReceipt(order2, RECEIPT_1);
      expect(await finance.actedAs(order2, supplier.address)).to.equal(Role.Receiver);
    });

    it("lets an account keep acting under the same role, also after a revoke and re-grant", async () => {
      const { factory, finance, supplier } = await networkHelpers.loadFixture(
        orderAcknowledgedFixture,
      );
      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_1);
      await factory.revokeRole(INSTITUTION, supplier.address);
      await factory.grantRole(INSTITUTION, supplier.address, Role.Supplier);
      await finance.connect(supplier).submitInvoice(ORDER, INVOICE_2);
      expect(await finance.actedAs(ORDER, supplier.address)).to.equal(Role.Supplier);
    });

    it("leaves no mark when an attempt is refused", async () => {
      const { finance, outsider, approver } =
        await networkHelpers.loadFixture(orderApprovedFixture);
      await expect(
        finance.connect(outsider).acknowledgeWorkOrder(ORDER),
      ).to.be.revertedWithCustomError(finance, "Unauthorized");
      // The approver holds the right role but the order is not ready.
      await expect(
        finance.connect(approver).authoriseRelease(ORDER, RELEASE_1),
      ).to.be.revertedWithCustomError(finance, "InvalidOrderState");
      expect(await finance.actedAs(ORDER, outsider.address)).to.equal(Role.None);
      expect(await finance.actedAs(ORDER, approver.address)).to.equal(Role.None);
    });

    it("bars the reviewer of the repair from authorising the release, even after a role change", async () => {
      const { factory, finance, reviewer } =
        await networkHelpers.loadFixture(readyFixture);
      // While still a reviewer the refusal is the separation of duties, not the role.
      await expect(finance.connect(reviewer).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
        .withArgs(reviewer.address, ORDER);

      await factory.revokeRole(INSTITUTION, reviewer.address);
      await factory.grantRole(INSTITUTION, reviewer.address, Role.PaymentApprover);
      await expect(finance.connect(reviewer).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
        .withArgs(reviewer.address, ORDER);
    });

    it("bars a reviewer who only disputed an earlier claim from authorising the release", async () => {
      const ctx = await networkHelpers.loadFixture(matchedFixture);
      const { factory, finance, operations, reviewer, schoolAdmin, floater } = ctx;
      await operations.connect(reviewer).disputeRepair(REPORT, REVIEW_1);
      await operations.connect(schoolAdmin).claimRepair(REPORT, CLAIM_2);
      // A second reviewer verifies; the first one is re-assigned to payments.
      await factory.grantRole(INSTITUTION, floater.address, Role.Reviewer);
      await operations.connect(floater).verifyRepair(REPORT, REVIEW_2);
      await factory.revokeRole(INSTITUTION, reviewer.address);
      await factory.grantRole(INSTITUTION, reviewer.address, Role.PaymentApprover);

      await expect(finance.connect(reviewer).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
        .withArgs(reviewer.address, ORDER);
    });

    it("bars an account that acted for the school on the report from authorising the release", async () => {
      const { factory, finance, schoolAdmin } =
        await networkHelpers.loadFixture(readyFixture);
      await factory.revokeRole(INSTITUTION, schoolAdmin.address);
      await factory.grantRole(INSTITUTION, schoolAdmin.address, Role.PaymentApprover);

      await expect(finance.connect(schoolAdmin).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
        .withArgs(schoolAdmin.address, ORDER);
    });
  });

  describe("9. payment disputes", () => {
    it("lets the buyer open a dispute, which blocks the release until the buyer closes it", async () => {
      const { finance, buyer, approver } = await networkHelpers.loadFixture(readyFixture);

      await expect(finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1))
        .to.emit(finance, "PaymentDisputeOpened")
        .withArgs(ORDER, REPORT, DISPUTE_1, buyer.address, anyTime);
      let order = await finance.getWorkOrder(ORDER);
      expect(order.disputeOpen).to.equal(true);
      expect(order.disputeOpener).to.equal(buyer.address);
      // Opening a dispute does not void the match.
      expect(order.matchPassed).to.equal(true);

      await expect(finance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(finance, "DisputeOpen")
        .withArgs(ORDER);

      await expect(finance.connect(buyer).closePaymentDispute(ORDER, DISPUTE_CLOSE_1))
        .to.emit(finance, "PaymentDisputeClosed")
        .withArgs(ORDER, REPORT, DISPUTE_CLOSE_1, buyer.address, anyTime);
      order = await finance.getWorkOrder(ORDER);
      expect(order.disputeOpen).to.equal(false);
      expect(order.disputeOpener).to.equal(ethers.ZeroAddress);

      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);
    });

    it("lets the receiving officer open and close a dispute", async () => {
      const { finance, receiver, approver } =
        await networkHelpers.loadFixture(readyFixture);
      await expect(finance.connect(receiver).openPaymentDispute(ORDER, DISPUTE_1))
        .to.emit(finance, "PaymentDisputeOpened")
        .withArgs(ORDER, REPORT, DISPUTE_1, receiver.address, anyTime);
      await expect(
        finance.connect(approver).authoriseRelease(ORDER, RELEASE_1),
      ).to.be.revertedWithCustomError(finance, "DisputeOpen");
      await finance.connect(receiver).closePaymentDispute(ORDER, DISPUTE_CLOSE_1);
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);
    });

    it("lets a receiver who has not acted on the order yet open a dispute", async () => {
      const { finance, receiver } =
        await networkHelpers.loadFixture(orderApprovedFixture);
      await finance.connect(receiver).openPaymentDispute(ORDER, DISPUTE_1);
      expect(await finance.actedAs(ORDER, receiver.address)).to.equal(Role.Receiver);
    });

    it("refuses a dispute from anyone who is not the buyer or the receiver", async () => {
      const { finance, supplier, registrar, approver, reviewer, outsider, owner } =
        await networkHelpers.loadFixture(matchedFixture);
      // The supplier and the platform relayer already acted on this order in their own role.
      for (const signer of [supplier, registrar]) {
        await expect(finance.connect(signer).openPaymentDispute(ORDER, DISPUTE_1))
          .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
          .withArgs(signer.address, ORDER);
      }
      for (const signer of [approver, reviewer, outsider, owner]) {
        await expect(finance.connect(signer).openPaymentDispute(ORDER, DISPUTE_1))
          .to.be.revertedWithCustomError(finance, "Unauthorized")
          .withArgs(signer.address, Role.Buyer);
      }
    });

    it("refuses a second dispute while one is open, zero and reused commitments, unknown orders", async () => {
      const { finance, buyer, receiver } =
        await networkHelpers.loadFixture(matchedFixture);
      await expect(
        finance.connect(buyer).openPaymentDispute(ORDER, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(finance, "ZeroValue");
      await expect(
        finance.connect(buyer).openPaymentDispute(ethers.id("nope"), DISPUTE_1),
      )
        .to.be.revertedWithCustomError(finance, "WorkOrderNotFound")
        .withArgs(ethers.id("nope"));
      await expect(finance.connect(buyer).openPaymentDispute(ORDER, INVOICE_1))
        .to.be.revertedWithCustomError(finance, "DuplicateCommitment")
        .withArgs(INVOICE_1);

      await finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1);
      for (const signer of [buyer, receiver]) {
        await expect(finance.connect(signer).openPaymentDispute(ORDER, digest("d2")))
          .to.be.revertedWithCustomError(finance, "DisputeOpen")
          .withArgs(ORDER);
      }
    });

    it("only lets the opener close the dispute", async () => {
      const { factory, finance, buyer, receiver, supplier, approver, outsider, floater } =
        await networkHelpers.loadFixture(matchedFixture);
      await expect(finance.connect(buyer).closePaymentDispute(ORDER, DISPUTE_CLOSE_1))
        .to.be.revertedWithCustomError(finance, "NoOpenDispute")
        .withArgs(ORDER);

      await finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1);
      // A second buyer of the institution is not the opener.
      await factory.grantRole(INSTITUTION, floater.address, Role.Buyer);
      for (const signer of [floater, approver, outsider]) {
        await expect(finance.connect(signer).closePaymentDispute(ORDER, DISPUTE_CLOSE_1))
          .to.be.revertedWithCustomError(finance, "Unauthorized")
          .withArgs(signer.address, Role.Buyer);
      }
      // The receiver and the supplier already acted on this order in another role.
      for (const signer of [receiver, supplier]) {
        await expect(finance.connect(signer).closePaymentDispute(ORDER, DISPUTE_CLOSE_1))
          .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
          .withArgs(signer.address, ORDER);
      }
      await expect(
        finance.connect(buyer).closePaymentDispute(ORDER, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(finance, "ZeroValue");
      await expect(finance.connect(buyer).closePaymentDispute(ORDER, DISPUTE_1))
        .to.be.revertedWithCustomError(finance, "DuplicateCommitment")
        .withArgs(DISPUTE_1);
      expect((await finance.getWorkOrder(ORDER)).disputeOpen).to.equal(true);

      await finance.connect(buyer).closePaymentDispute(ORDER, DISPUTE_CLOSE_1);
      // A new dispute can be opened afterwards, by the other party too.
      await finance.connect(receiver).openPaymentDispute(ORDER, digest("d2"));
      await expect(finance.connect(buyer).closePaymentDispute(ORDER, digest("d2-close")))
        .to.be.revertedWithCustomError(finance, "SeparationOfDuties")
        .withArgs(buyer.address, ORDER);
      await finance.connect(receiver).closePaymentDispute(ORDER, digest("d2-close"));
    });

    it("an opener whose role was revoked cannot close until the role is restored", async () => {
      const { factory, finance, buyer } =
        await networkHelpers.loadFixture(matchedFixture);
      await finance.connect(buyer).openPaymentDispute(ORDER, DISPUTE_1);
      await factory.revokeRole(INSTITUTION, buyer.address);
      await expect(finance.connect(buyer).closePaymentDispute(ORDER, DISPUTE_CLOSE_1))
        .to.be.revertedWithCustomError(finance, "Unauthorized")
        .withArgs(buyer.address, Role.Buyer);
      await factory.grantRole(INSTITUTION, buyer.address, Role.Buyer);
      await finance.connect(buyer).closePaymentDispute(ORDER, DISPUTE_CLOSE_1);
    });
  });

  describe("10. cross-institution isolation", () => {
    it("keeps work orders and roles of one institution out of another", async () => {
      const ctx = await networkHelpers.loadFixture(readyFixture);
      const {
        factory,
        finance,
        otherFinance,
        otherOperations,
        buyer,
        approver,
        registrar,
      } = ctx;

      // The order does not exist in the other institution's finance contract.
      expect((await otherFinance.getWorkOrder(ORDER)).status).to.equal(OrderStatus.None);
      await factory.grantRole(OTHER_INSTITUTION, approver.address, Role.PaymentApprover);
      await expect(otherFinance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(otherFinance, "WorkOrderNotFound")
        .withArgs(ORDER);

      // A buyer of INSTITUTION is nobody at OTHER_INSTITUTION.
      await factory.grantRole(OTHER_INSTITUTION, registrar.address, Role.Registrar);
      const otherReport = ethers.id("report:other-institution");
      await otherOperations.connect(registrar).registerReport(otherReport, digest("o"));
      await expect(
        otherFinance.connect(buyer).approveWorkOrder(ORDER, otherReport, digest("oo")),
      )
        .to.be.revertedWithCustomError(otherFinance, "Unauthorized")
        .withArgs(buyer.address, Role.Buyer);

      // The same order id and commitments can be used there without touching this one.
      await factory.grantRole(OTHER_INSTITUTION, buyer.address, Role.Buyer);
      await otherFinance
        .connect(buyer)
        .approveWorkOrder(ORDER, otherReport, ORDER_COMMITMENT);
      expect((await otherFinance.getWorkOrder(ORDER)).status).to.equal(
        OrderStatus.Approved,
      );
      expect((await finance.getWorkOrder(ORDER)).status).to.equal(
        OrderStatus.Acknowledged,
      );
      expect(await otherFinance.actedAs(ORDER, approver.address)).to.equal(Role.None);

      // A verified repair here does not unlock a release there.
      await finance.connect(approver).authoriseRelease(ORDER, RELEASE_1);
      await expect(otherFinance.connect(approver).authoriseRelease(ORDER, RELEASE_1))
        .to.be.revertedWithCustomError(otherFinance, "InvalidOrderState")
        .withArgs(ORDER, OrderStatus.Approved);
    });
  });
});
