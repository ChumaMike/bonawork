// The BonaRegistry suite, ported to the per-institution shape: one InstitutionOperations
// per institution, roles read from the factory.
import { expect } from "chai";
import { network } from "hardhat";
import {
  anyTime,
  CLAIM_1,
  CLAIM_2,
  deployFixture,
  digest,
  INSTITUTION,
  Kind,
  OTHER_INSTITUTION,
  Outcome,
  REPAIR_PHOTO,
  repairClaimedFixture,
  REPORT,
  REPORT_COMMITMENT,
  REPORT_PHOTO,
  reportedFixture,
  REVIEW_1,
  REVIEW_2,
  REVIEW_PHOTO,
  Role,
  Status,
} from "./helpers.js";

const { ethers, networkHelpers } = await network.getOrCreate();

describe("InstitutionOperations", () => {
  describe("1. report registration", () => {
    it("registers a report commitment and emits ReportRegistered with the institution id", async () => {
      const { operations, registrar } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        operations.connect(registrar).registerReport(REPORT, REPORT_COMMITMENT),
      )
        .to.emit(operations, "ReportRegistered")
        .withArgs(REPORT, INSTITUTION, REPORT_COMMITMENT, registrar.address, anyTime);

      const report = await operations.getReport(REPORT);
      expect(report.schoolId).to.equal(INSTITUTION);
      expect(report.commitment).to.equal(REPORT_COMMITMENT);
      expect(report.registrar).to.equal(registrar.address);
      expect(report.status).to.equal(Status.Reported);
      expect(report.registeredAt).to.equal(BigInt(await networkHelpers.time.latest()));
      expect(await operations.reportIdByCommitment(REPORT_COMMITMENT)).to.equal(REPORT);
    });

    it("registers an evidence commitment against the report", async () => {
      const { operations, registrar } = await networkHelpers.loadFixture(deployFixture);
      await operations.connect(registrar).registerReport(REPORT, REPORT_COMMITMENT);

      await expect(
        operations.connect(registrar).registerEvidence(REPORT, REPORT_PHOTO, Kind.Report),
      )
        .to.emit(operations, "EvidenceRegistered")
        .withArgs(REPORT, REPORT_PHOTO, Kind.Report, 0n, registrar.address, anyTime);

      expect(await operations.evidenceCount(REPORT)).to.equal(1n);
      expect(await operations.isEvidenceRegistered(REPORT, REPORT_PHOTO)).to.equal(true);
      const evidence = await operations.getEvidence(REPORT, 0);
      expect(evidence.digest).to.equal(REPORT_PHOTO);
      expect(evidence.submitter).to.equal(registrar.address);
    });

    it("rejects registration by accounts without the registrar role", async () => {
      const { operations, outsider, schoolAdmin, buyer, owner } =
        await networkHelpers.loadFixture(deployFixture);
      for (const signer of [outsider, schoolAdmin, buyer, owner]) {
        await expect(operations.connect(signer).registerReport(REPORT, REPORT_COMMITMENT))
          .to.be.revertedWithCustomError(operations, "Unauthorized")
          .withArgs(signer.address, Role.Registrar);
      }
    });

    it("rejects duplicate report ids, duplicate commitments and zero values", async () => {
      const { operations, registrar } = await networkHelpers.loadFixture(reportedFixture);
      const asRegistrar = operations.connect(registrar);

      await expect(asRegistrar.registerReport(REPORT, digest("other")))
        .to.be.revertedWithCustomError(operations, "ReportAlreadyRegistered")
        .withArgs(REPORT);
      await expect(asRegistrar.registerReport(ethers.id("report:new"), REPORT_COMMITMENT))
        .to.be.revertedWithCustomError(operations, "DuplicateCommitment")
        .withArgs(REPORT_COMMITMENT, REPORT);
      await expect(
        asRegistrar.registerReport(ethers.ZeroHash, digest("x")),
      ).to.be.revertedWithCustomError(operations, "ZeroValue");
      await expect(
        asRegistrar.registerReport(ethers.id("report:new"), ethers.ZeroHash),
      ).to.be.revertedWithCustomError(operations, "ZeroValue");
    });

    it("rejects duplicate evidence and evidence of a kind the caller may not submit", async () => {
      const { operations, registrar, schoolAdmin } =
        await networkHelpers.loadFixture(reportedFixture);

      await expect(
        operations.connect(registrar).registerEvidence(REPORT, REPORT_PHOTO, Kind.Report),
      )
        .to.be.revertedWithCustomError(operations, "DuplicateEvidence")
        .withArgs(REPORT, REPORT_PHOTO);
      // A school admin cannot plant "independent review" evidence.
      await expect(
        operations
          .connect(schoolAdmin)
          .registerEvidence(REPORT, REVIEW_PHOTO, Kind.Review),
      )
        .to.be.revertedWithCustomError(operations, "Unauthorized")
        .withArgs(schoolAdmin.address, Role.Reviewer);
      await expect(
        operations
          .connect(registrar)
          .registerEvidence(ethers.id("missing"), REPORT_PHOTO, Kind.Report),
      )
        .to.be.revertedWithCustomError(operations, "ReportNotFound")
        .withArgs(ethers.id("missing"));
      await expect(
        operations
          .connect(registrar)
          .registerEvidence(REPORT, ethers.ZeroHash, Kind.Report),
      ).to.be.revertedWithCustomError(operations, "ZeroValue");
    });
  });

  describe("2. acknowledgement and repair claim", () => {
    it("lets the school administrator acknowledge a report exactly once", async () => {
      const { operations, schoolAdmin, reviewer, otherAdmin } =
        await networkHelpers.loadFixture(reportedFixture);

      // The reviewer, and an administrator of a different institution, have no authority.
      for (const signer of [reviewer, otherAdmin]) {
        await expect(operations.connect(signer).acknowledgeReport(REPORT))
          .to.be.revertedWithCustomError(operations, "Unauthorized")
          .withArgs(signer.address, Role.SchoolAdmin);
      }

      await expect(operations.connect(schoolAdmin).acknowledgeReport(REPORT))
        .to.emit(operations, "ReportAcknowledged")
        .withArgs(REPORT, INSTITUTION, schoolAdmin.address, anyTime);
      expect(await operations.statusOf(REPORT)).to.equal(Status.Acknowledged);
      const report = await operations.getReport(REPORT);
      expect(report.acknowledgedBy).to.equal(schoolAdmin.address);
      expect(await operations.hasActedForSchool(REPORT, schoolAdmin.address)).to.equal(
        true,
      );

      await expect(operations.connect(schoolAdmin).acknowledgeReport(REPORT))
        .to.be.revertedWithCustomError(operations, "InvalidState")
        .withArgs(REPORT, Status.Acknowledged);
    });

    it("records a repair completion claim from the school administrator", async () => {
      const { operations, schoolAdmin } =
        await networkHelpers.loadFixture(reportedFixture);
      const asAdmin = operations.connect(schoolAdmin);
      await asAdmin.acknowledgeReport(REPORT);

      await expect(asAdmin.claimRepair(REPORT, CLAIM_1))
        .to.emit(operations, "RepairClaimed")
        .withArgs(REPORT, 0n, CLAIM_1, schoolAdmin.address, anyTime);

      // A claim is only a claim: the report is not closed.
      expect(await operations.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      const claim = await operations.getClaim(REPORT, 0);
      expect(claim.commitment).to.equal(CLAIM_1);
      expect(claim.claimant).to.equal(schoolAdmin.address);
      expect(claim.outcome).to.equal(Outcome.Pending);
      expect(claim.reviewer).to.equal(ethers.ZeroAddress);
    });

    it("rejects repair claims out of order, duplicated, or from the wrong role", async () => {
      const { operations, schoolAdmin, reviewer, registrar, supplier } =
        await networkHelpers.loadFixture(reportedFixture);
      const asAdmin = operations.connect(schoolAdmin);

      // Not yet acknowledged.
      await expect(asAdmin.claimRepair(REPORT, CLAIM_1))
        .to.be.revertedWithCustomError(operations, "InvalidState")
        .withArgs(REPORT, Status.Reported);

      await asAdmin.acknowledgeReport(REPORT);
      // Not even the supplier who did the work can claim the repair for the school.
      for (const signer of [reviewer, registrar, supplier]) {
        await expect(operations.connect(signer).claimRepair(REPORT, CLAIM_1))
          .to.be.revertedWithCustomError(operations, "Unauthorized")
          .withArgs(signer.address, Role.SchoolAdmin);
      }

      await asAdmin.claimRepair(REPORT, CLAIM_1);
      // A second claim while one is pending review is refused.
      await expect(asAdmin.claimRepair(REPORT, CLAIM_2))
        .to.be.revertedWithCustomError(operations, "InvalidState")
        .withArgs(REPORT, Status.RepairClaimed);
    });
  });

  describe("interim protection records", () => {
    const PROTECTION_1 = digest("protection-area-closed-off");
    const PROTECTION_2 = digest("protection-temporary-toilets");

    it("records interim protection without changing the report status", async () => {
      const { operations, schoolAdmin } =
        await networkHelpers.loadFixture(reportedFixture);
      const asAdmin = operations.connect(schoolAdmin);
      await asAdmin.acknowledgeReport(REPORT);

      await expect(asAdmin.recordInterimProtection(REPORT, PROTECTION_1))
        .to.emit(operations, "InterimProtectionRecorded")
        .withArgs(REPORT, 0n, PROTECTION_1, schoolAdmin.address, anyTime);

      // Protection is not a repair: the report is still only acknowledged.
      expect(await operations.statusOf(REPORT)).to.equal(Status.Acknowledged);
      const record = await operations.getProtection(REPORT, 0);
      expect(record.commitment).to.equal(PROTECTION_1);
      expect(record.recordedBy).to.equal(schoolAdmin.address);

      // Further measures append; they can also follow a repair claim.
      await asAdmin.claimRepair(REPORT, CLAIM_1);
      await asAdmin.recordInterimProtection(REPORT, PROTECTION_2);
      expect(await operations.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      expect(await operations.protectionCount(REPORT)).to.equal(2n);
      expect((await operations.getProtection(REPORT, 1)).commitment).to.equal(
        PROTECTION_2,
      );
    });

    it("rejects protection records that are unauthorised, duplicated or out of order", async () => {
      const { operations, schoolAdmin, reviewer, registrar, otherAdmin } =
        await networkHelpers.loadFixture(reportedFixture);
      const asAdmin = operations.connect(schoolAdmin);

      // Before acknowledgement.
      await expect(asAdmin.recordInterimProtection(REPORT, PROTECTION_1))
        .to.be.revertedWithCustomError(operations, "InvalidState")
        .withArgs(REPORT, Status.Reported);

      await asAdmin.acknowledgeReport(REPORT);
      for (const signer of [reviewer, registrar, otherAdmin]) {
        await expect(
          operations.connect(signer).recordInterimProtection(REPORT, PROTECTION_1),
        )
          .to.be.revertedWithCustomError(operations, "Unauthorized")
          .withArgs(signer.address, Role.SchoolAdmin);
      }

      await asAdmin.recordInterimProtection(REPORT, PROTECTION_1);
      await expect(asAdmin.recordInterimProtection(REPORT, PROTECTION_1))
        .to.be.revertedWithCustomError(operations, "DuplicateProtection")
        .withArgs(REPORT, PROTECTION_1);

      // After independent verification the record is closed.
      await asAdmin.claimRepair(REPORT, CLAIM_1);
      await operations.connect(reviewer).verifyRepair(REPORT, REVIEW_1);
      await expect(asAdmin.recordInterimProtection(REPORT, PROTECTION_2))
        .to.be.revertedWithCustomError(operations, "InvalidState")
        .withArgs(REPORT, Status.Verified);
    });

    it("bars an account that only acknowledged or recorded protection from reviewing later", async () => {
      const { factory, operations, schoolAdmin, outsider } =
        await networkHelpers.loadFixture(reportedFixture);
      // schoolAdmin acknowledges and records protection, then is replaced by a new admin.
      await operations.connect(schoolAdmin).acknowledgeReport(REPORT);
      await operations.connect(schoolAdmin).recordInterimProtection(REPORT, PROTECTION_1);
      await factory.revokeRole(INSTITUTION, schoolAdmin.address);
      await factory.grantRole(INSTITUTION, outsider.address, Role.SchoolAdmin);
      await operations.connect(outsider).claimRepair(REPORT, CLAIM_1);

      // The first admin never claimed the repair, but still acted for the school.
      await factory.grantRole(INSTITUTION, schoolAdmin.address, Role.Reviewer);
      await expect(operations.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(operations, "SchoolAdminCannotVerify")
        .withArgs(schoolAdmin.address, REPORT);
    });
  });

  describe("3. unauthorised closure is rejected", () => {
    it("rejects a school administrator verifying their own repair", async () => {
      const { operations, schoolAdmin } =
        await networkHelpers.loadFixture(repairClaimedFixture);

      await expect(operations.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(operations, "SchoolAdminCannotVerify")
        .withArgs(schoolAdmin.address, REPORT);

      // Nothing changed: still awaiting independent review.
      expect(await operations.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      expect((await operations.getClaim(REPORT, 0)).outcome).to.equal(Outcome.Pending);
    });

    it("rejects a school administrator disputing (i.e. reviewing) their own repair", async () => {
      const { operations, schoolAdmin } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await expect(operations.connect(schoolAdmin).disputeRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(operations, "SchoolAdminCannotVerify")
        .withArgs(schoolAdmin.address, REPORT);
    });

    it("checks the conflict of interest before the role, so the administrator gets the specific refusal", async () => {
      const { operations, schoolAdmin } =
        await networkHelpers.loadFixture(reportedFixture);
      // A school administrator who has not acted on this report yet, and a report that
      // is not even in a reviewable state: the refusal is still the specific one.
      expect(await operations.hasActedForSchool(REPORT, schoolAdmin.address)).to.equal(
        false,
      );
      await expect(operations.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(operations, "SchoolAdminCannotVerify")
        .withArgs(schoolAdmin.address, REPORT);
    });

    it("rejects closure by outsiders, the registrar, the factory owner and every finance role", async () => {
      const {
        operations,
        outsider,
        registrar,
        owner,
        buyer,
        supplier,
        receiver,
        approver,
      } = await networkHelpers.loadFixture(repairClaimedFixture);
      for (const signer of [
        outsider,
        registrar,
        owner,
        buyer,
        supplier,
        receiver,
        approver,
      ]) {
        for (const attempt of [
          operations.connect(signer).verifyRepair(REPORT, REVIEW_1),
          operations.connect(signer).disputeRepair(REPORT, REVIEW_1),
        ]) {
          await expect(attempt)
            .to.be.revertedWithCustomError(operations, "Unauthorized")
            .withArgs(signer.address, Role.Reviewer);
        }
      }
    });

    it("refuses to make a school administrator a reviewer of the same institution", async () => {
      const { factory, schoolAdmin } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await expect(factory.grantRole(INSTITUTION, schoolAdmin.address, Role.Reviewer))
        .to.be.revertedWithCustomError(factory, "RoleConflict")
        .withArgs(INSTITUTION, schoolAdmin.address, Role.SchoolAdmin);
    });

    it("still rejects a former administrator who is re-granted the reviewer role", async () => {
      const { factory, operations, schoolAdmin } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await factory.revokeRole(INSTITUTION, schoolAdmin.address);
      await factory.grantRole(INSTITUTION, schoolAdmin.address, Role.Reviewer);

      for (const attempt of [
        operations.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1),
        operations.connect(schoolAdmin).disputeRepair(REPORT, REVIEW_1),
      ]) {
        await expect(attempt)
          .to.be.revertedWithCustomError(operations, "SchoolAdminCannotVerify")
          .withArgs(schoolAdmin.address, REPORT);
      }
    });
  });

  describe("cross-institution isolation", () => {
    const OTHER_REPORT = ethers.id("report:other-institution");

    // schoolAdmin administers INSTITUTION and is, legitimately, a reviewer for
    // OTHER_INSTITUTION. Both institutions have a repair claim waiting for review.
    async function dualRoleFixture() {
      const ctx = await repairClaimedFixture();
      const { factory, otherOperations, registrar, schoolAdmin, otherAdmin } = ctx;
      await factory.grantRole(OTHER_INSTITUTION, schoolAdmin.address, Role.Reviewer);
      await factory.grantRole(OTHER_INSTITUTION, registrar.address, Role.Registrar);
      await otherOperations
        .connect(registrar)
        .registerReport(OTHER_REPORT, digest("other-institution-report"));
      await otherOperations.connect(otherAdmin).acknowledgeReport(OTHER_REPORT);
      await otherOperations
        .connect(otherAdmin)
        .claimRepair(OTHER_REPORT, digest("other-claim"));
      return ctx;
    }

    it("keeps each institution's reports in its own contract", async () => {
      const { operations, otherOperations } =
        await networkHelpers.loadFixture(dualRoleFixture);

      expect(await operations.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      expect(await otherOperations.statusOf(REPORT)).to.equal(Status.None);
      expect(await otherOperations.statusOf(OTHER_REPORT)).to.equal(Status.RepairClaimed);
      expect(await operations.statusOf(OTHER_REPORT)).to.equal(Status.None);
      expect((await otherOperations.getReport(OTHER_REPORT)).schoolId).to.equal(
        OTHER_INSTITUTION,
      );
      expect(await otherOperations.reportIdByCommitment(REPORT_COMMITMENT)).to.equal(
        ethers.ZeroHash,
      );
    });

    it("allows the same report id and commitment in two institutions without interference", async () => {
      const { factory, operations, otherOperations, registrar } =
        await networkHelpers.loadFixture(reportedFixture);
      await factory.grantRole(OTHER_INSTITUTION, registrar.address, Role.Registrar);

      await expect(
        otherOperations.connect(registrar).registerReport(REPORT, REPORT_COMMITMENT),
      )
        .to.emit(otherOperations, "ReportRegistered")
        .withArgs(
          REPORT,
          OTHER_INSTITUTION,
          REPORT_COMMITMENT,
          registrar.address,
          anyTime,
        );
      expect(await operations.evidenceCount(REPORT)).to.equal(1n);
      expect(await otherOperations.evidenceCount(REPORT)).to.equal(0n);
    });

    it("a role at one institution gives no authority at another", async () => {
      const {
        operations,
        otherOperations,
        registrar,
        reviewer,
        otherAdmin,
        owner,
        factory,
      } = await networkHelpers.loadFixture(dualRoleFixture);

      // `reviewer` reviews INSTITUTION only.
      await expect(otherOperations.connect(reviewer).verifyRepair(OTHER_REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(otherOperations, "Unauthorized")
        .withArgs(reviewer.address, Role.Reviewer);
      // `otherAdmin` administers OTHER_INSTITUTION only: no role at all on INSTITUTION.
      await expect(operations.connect(otherAdmin).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(operations, "Unauthorized")
        .withArgs(otherAdmin.address, Role.Reviewer);
      await expect(operations.connect(otherAdmin).acknowledgeReport(REPORT))
        .to.be.revertedWithCustomError(operations, "Unauthorized")
        .withArgs(otherAdmin.address, Role.SchoolAdmin);
      // A registrar loses access to one institution without losing the other.
      await factory.connect(owner).revokeRole(OTHER_INSTITUTION, registrar.address);
      await expect(
        otherOperations.connect(registrar).registerReport(ethers.id("r2"), digest("r2")),
      )
        .to.be.revertedWithCustomError(otherOperations, "Unauthorized")
        .withArgs(registrar.address, Role.Registrar);
      await operations.connect(registrar).registerReport(ethers.id("r2"), digest("r2"));
    });

    it("a reviewer role elsewhere does not let an administrator verify their own institution's repair", async () => {
      const { factory, operations, schoolAdmin } =
        await networkHelpers.loadFixture(dualRoleFixture);
      expect(await factory.roleOf(OTHER_INSTITUTION, schoolAdmin.address)).to.equal(
        Role.Reviewer,
      );

      for (const attempt of [
        operations.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1),
        operations.connect(schoolAdmin).disputeRepair(REPORT, REVIEW_1),
      ]) {
        await expect(attempt)
          .to.be.revertedWithCustomError(operations, "SchoolAdminCannotVerify")
          .withArgs(schoolAdmin.address, REPORT);
      }
      // Nor can they plant review evidence on their own institution's report.
      await expect(
        operations
          .connect(schoolAdmin)
          .registerEvidence(REPORT, REVIEW_PHOTO, Kind.Review),
      )
        .to.be.revertedWithCustomError(operations, "Unauthorized")
        .withArgs(schoolAdmin.address, Role.Reviewer);
      expect(await operations.statusOf(REPORT)).to.equal(Status.RepairClaimed);
    });

    it("the same account can still review the other institution, where it is independent", async () => {
      const { operations, otherOperations, schoolAdmin } =
        await networkHelpers.loadFixture(dualRoleFixture);

      await expect(
        otherOperations.connect(schoolAdmin).verifyRepair(OTHER_REPORT, REVIEW_2),
      )
        .to.emit(otherOperations, "RepairVerified")
        .withArgs(OTHER_REPORT, 0n, REVIEW_2, schoolAdmin.address, anyTime);
      expect(await otherOperations.statusOf(OTHER_REPORT)).to.equal(Status.Verified);
      // The first institution's report is untouched.
      expect(await operations.statusOf(REPORT)).to.equal(Status.RepairClaimed);
    });
  });

  describe("4. independent verification", () => {
    it("lets the independent reviewer verify and close the report", async () => {
      const { operations, reviewer } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      const asReviewer = operations.connect(reviewer);
      await asReviewer.registerEvidence(REPORT, REVIEW_PHOTO, Kind.Review);

      await expect(asReviewer.verifyRepair(REPORT, REVIEW_1))
        .to.emit(operations, "RepairVerified")
        .withArgs(REPORT, 0n, REVIEW_1, reviewer.address, anyTime);

      expect(await operations.statusOf(REPORT)).to.equal(Status.Verified);
      const claim = await operations.getClaim(REPORT, 0);
      expect(claim.outcome).to.equal(Outcome.Verified);
      expect(claim.reviewer).to.equal(reviewer.address);
      expect(claim.reviewCommitment).to.equal(REVIEW_1);
      expect(await operations.hasReviewed(REPORT, reviewer.address)).to.equal(true);
    });

    it("cannot verify before a repair has been claimed", async () => {
      const { operations, reviewer } = await networkHelpers.loadFixture(reportedFixture);
      await expect(operations.connect(reviewer).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(operations, "InvalidState")
        .withArgs(REPORT, Status.Reported);
      await expect(
        operations.connect(reviewer).verifyRepair(REPORT, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(operations, "ZeroValue");
      await expect(
        operations.connect(reviewer).verifyRepair(ethers.id("missing"), REVIEW_1),
      )
        .to.be.revertedWithCustomError(operations, "ReportNotFound")
        .withArgs(ethers.id("missing"));
    });

    it("treats Verified as final: no re-verify, dispute, new claim or new evidence", async () => {
      const { operations, reviewer, schoolAdmin, registrar } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await operations.connect(reviewer).verifyRepair(REPORT, REVIEW_1);

      const attempts = [
        operations.connect(reviewer).verifyRepair(REPORT, REVIEW_2),
        operations.connect(reviewer).disputeRepair(REPORT, REVIEW_2),
        operations.connect(schoolAdmin).claimRepair(REPORT, CLAIM_2),
        operations
          .connect(registrar)
          .registerEvidence(REPORT, digest("late"), Kind.Report),
      ];
      for (const attempt of attempts) {
        await expect(attempt)
          .to.be.revertedWithCustomError(operations, "InvalidState")
          .withArgs(REPORT, Status.Verified);
      }
    });
  });

  describe("5. dispute", () => {
    it("lets the independent reviewer dispute a repair claim", async () => {
      const { operations, reviewer } =
        await networkHelpers.loadFixture(repairClaimedFixture);

      await expect(operations.connect(reviewer).disputeRepair(REPORT, REVIEW_1))
        .to.emit(operations, "RepairDisputed")
        .withArgs(REPORT, 0n, REVIEW_1, reviewer.address, anyTime);

      expect(await operations.statusOf(REPORT)).to.equal(Status.Disputed);
      const claim = await operations.getClaim(REPORT, 0);
      expect(claim.outcome).to.equal(Outcome.Disputed);
      expect(claim.reviewer).to.equal(reviewer.address);
      expect(await operations.hasReviewed(REPORT, reviewer.address)).to.equal(true);
    });

    it("rejects a second review of the same claim", async () => {
      const { operations, reviewer } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await operations.connect(reviewer).disputeRepair(REPORT, REVIEW_1);
      for (const attempt of [
        operations.connect(reviewer).disputeRepair(REPORT, REVIEW_2),
        operations.connect(reviewer).verifyRepair(REPORT, REVIEW_2),
      ]) {
        await expect(attempt)
          .to.be.revertedWithCustomError(operations, "InvalidState")
          .withArgs(REPORT, Status.Disputed);
      }
    });
  });

  describe("6. historical records are preserved", () => {
    it("keeps every evidence record, claim and event through dispute, re-claim and verification", async () => {
      const { operations, registrar, schoolAdmin, reviewer } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      const asAdmin = operations.connect(schoolAdmin);
      const asReviewer = operations.connect(reviewer);

      const readEvidence = async () => {
        const count = Number(await operations.evidenceCount(REPORT));
        const list = [];
        for (let i = 0; i < count; i++) {
          const e = await operations.getEvidence(REPORT, i);
          list.push({
            digest: e.digest,
            kind: e.kind,
            submitter: e.submitter,
            registeredAt: e.registeredAt,
          });
        }
        return list;
      };
      const evidenceBefore = await readEvidence();
      const firstClaimBefore = await operations.getClaim(REPORT, 0);

      // First claim is disputed; the school repairs again with new evidence; then verified.
      await asReviewer.registerEvidence(REPORT, REVIEW_PHOTO, Kind.Review);
      await asReviewer.disputeRepair(REPORT, REVIEW_1);
      const secondRepairPhoto = digest("photo-repaired-toilet-second-attempt");
      await asAdmin.registerEvidence(REPORT, secondRepairPhoto, Kind.Repair);
      await asAdmin.claimRepair(REPORT, CLAIM_2);
      await asReviewer.verifyRepair(REPORT, REVIEW_2);

      // Earlier evidence records are byte-for-byte what they were, at the same indexes.
      const evidenceAfter = await readEvidence();
      expect(evidenceAfter).to.have.lengthOf(4);
      expect(evidenceAfter.slice(0, evidenceBefore.length)).to.deep.equal(evidenceBefore);
      expect(evidenceAfter.map((e) => e.digest)).to.deep.equal([
        REPORT_PHOTO,
        REPAIR_PHOTO,
        REVIEW_PHOTO,
        secondRepairPhoto,
      ]);
      expect(evidenceAfter.map((e) => e.kind)).to.deep.equal([
        Kind.Report,
        Kind.Repair,
        Kind.Review,
        Kind.Repair,
      ]);
      expect(evidenceAfter[0].submitter).to.equal(registrar.address);

      // The disputed claim is still on record next to the verified one.
      expect(await operations.claimCount(REPORT)).to.equal(2n);
      const first = await operations.getClaim(REPORT, 0);
      expect(first.commitment).to.equal(firstClaimBefore.commitment);
      expect(first.claimant).to.equal(firstClaimBefore.claimant);
      expect(first.claimedAt).to.equal(firstClaimBefore.claimedAt);
      expect(first.outcome).to.equal(Outcome.Disputed);
      expect(first.reviewCommitment).to.equal(REVIEW_1);
      const second = await operations.getClaim(REPORT, 1);
      expect(second.commitment).to.equal(CLAIM_2);
      expect(second.outcome).to.equal(Outcome.Verified);

      // The original report commitment is untouched.
      const report = await operations.getReport(REPORT);
      expect(report.commitment).to.equal(REPORT_COMMITMENT);
      expect(report.status).to.equal(Status.Verified);

      // The full event trail can be replayed from the chain, in order.
      const logs = await ethers.provider.getLogs({
        address: await operations.getAddress(),
        fromBlock: 0,
        toBlock: "latest",
      });
      const trail = logs
        .map((log) => operations.interface.parseLog(log))
        .filter((parsed) => parsed !== null && parsed.args[0] === REPORT)
        .map((parsed) => parsed!.name);
      expect(trail).to.deep.equal([
        "ReportRegistered",
        "EvidenceRegistered",
        "ReportAcknowledged",
        "EvidenceRegistered",
        "RepairClaimed",
        "EvidenceRegistered",
        "RepairDisputed",
        "EvidenceRegistered",
        "RepairClaimed",
        "RepairVerified",
      ]);
    });

    it("exposes no function that edits or deletes a report, evidence record or claim", async () => {
      const { operations } = await networkHelpers.loadFixture(deployFixture);
      const mutating = operations.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => ethers.FunctionFragment.from(f))
        .filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.name)
        .sort();
      // No ownership and no role management here: those live in the factory.
      expect(mutating).to.deep.equal([
        "acknowledgeReport",
        "claimRepair",
        "disputeRepair",
        "recordInterimProtection",
        "registerEvidence",
        "registerReport",
        "verifyRepair",
      ]);
    });
  });
});
