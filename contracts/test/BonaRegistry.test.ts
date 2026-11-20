import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.getOrCreate();

// Mirrors of the Solidity enums.
const Role = { None: 0n, Registrar: 1n, SchoolAdmin: 2n, Reviewer: 3n } as const;
const Status = {
  None: 0n,
  Reported: 1n,
  Acknowledged: 2n,
  RepairClaimed: 3n,
  Verified: 4n,
  Disputed: 5n,
} as const;
const Kind = { Report: 0n, Repair: 1n, Review: 2n } as const;
const Outcome = { Pending: 0n, Verified: 1n, Disputed: 2n } as const;

/** SHA-256 digest of off-chain bytes, as the verifier package computes it. */
const digest = (label: string) => ethers.sha256(ethers.toUtf8Bytes(label));

/** Copy a returned evidence struct into a plain object so records can be deep-compared. */
const plainEvidence = (e: {
  digest: string;
  kind: bigint;
  submitter: string;
  registeredAt: bigint;
}) => ({
  digest: e.digest,
  kind: e.kind,
  submitter: e.submitter,
  registeredAt: e.registeredAt,
});

const SCHOOL = ethers.id("bona:school:demo-001");
const OTHER_SCHOOL = ethers.id("bona:school:demo-002");
const REPORT = ethers.id("report:7c1f");
const REPORT_COMMITMENT = digest("report-document-v1");
const REPORT_PHOTO = digest("photo-broken-toilet");
const REPAIR_PHOTO = digest("photo-repaired-toilet");
const REVIEW_PHOTO = digest("photo-reviewer-site-visit");
const CLAIM_1 = digest("repair-claim-1");
const CLAIM_2 = digest("repair-claim-2");
const REVIEW_1 = digest("review-1");
const REVIEW_2 = digest("review-2");

async function deployFixture() {
  // Separate development signing keys per party.
  const [owner, registrar, schoolAdmin, reviewer, outsider, otherAdmin] =
    await ethers.getSigners();
  const registry = await ethers.deployContract("BonaRegistry", [owner.address]);

  await registry.registerSchool(SCHOOL);
  await registry.registerSchool(OTHER_SCHOOL);
  await registry.grantRole(SCHOOL, registrar.address, Role.Registrar);
  await registry.grantRole(SCHOOL, schoolAdmin.address, Role.SchoolAdmin);
  await registry.grantRole(SCHOOL, reviewer.address, Role.Reviewer);
  await registry.grantRole(OTHER_SCHOOL, otherAdmin.address, Role.SchoolAdmin);

  return { registry, owner, registrar, schoolAdmin, reviewer, outsider, otherAdmin };
}

async function reportedFixture() {
  const ctx = await deployFixture();
  await ctx.registry
    .connect(ctx.registrar)
    .registerReport(REPORT, SCHOOL, REPORT_COMMITMENT);
  await ctx.registry
    .connect(ctx.registrar)
    .registerEvidence(REPORT, REPORT_PHOTO, Kind.Report);
  return ctx;
}

async function repairClaimedFixture() {
  const ctx = await reportedFixture();
  await ctx.registry.connect(ctx.schoolAdmin).acknowledgeReport(REPORT);
  await ctx.registry
    .connect(ctx.schoolAdmin)
    .registerEvidence(REPORT, REPAIR_PHOTO, Kind.Repair);
  await ctx.registry.connect(ctx.schoolAdmin).claimRepair(REPORT, CLAIM_1);
  return ctx;
}

describe("BonaRegistry", () => {
  describe("1. report registration", () => {
    it("registers a report commitment and emits ReportRegistered", async () => {
      const { registry, registrar } = await networkHelpers.loadFixture(deployFixture);

      const tx = registry
        .connect(registrar)
        .registerReport(REPORT, SCHOOL, REPORT_COMMITMENT);
      await expect(tx).to.emit(registry, "ReportRegistered");

      const report = await registry.getReport(REPORT);
      expect(report.schoolId).to.equal(SCHOOL);
      expect(report.commitment).to.equal(REPORT_COMMITMENT);
      expect(report.registrar).to.equal(registrar.address);
      expect(report.status).to.equal(Status.Reported);
      expect(report.registeredAt).to.equal(BigInt(await networkHelpers.time.latest()));
      expect(await registry.reportIdByCommitment(REPORT_COMMITMENT)).to.equal(REPORT);
    });

    it("registers an evidence commitment against the report", async () => {
      const { registry, registrar } = await networkHelpers.loadFixture(deployFixture);
      await registry.connect(registrar).registerReport(REPORT, SCHOOL, REPORT_COMMITMENT);

      await expect(
        registry.connect(registrar).registerEvidence(REPORT, REPORT_PHOTO, Kind.Report),
      )
        .to.emit(registry, "EvidenceRegistered")
        .withArgs(
          REPORT,
          REPORT_PHOTO,
          Kind.Report,
          0n,
          registrar.address,
          (ts: bigint) => ts > 0n,
        );

      expect(await registry.evidenceCount(REPORT)).to.equal(1n);
      expect(await registry.isEvidenceRegistered(REPORT, REPORT_PHOTO)).to.equal(true);
      const evidence = await registry.getEvidence(REPORT, 0);
      expect(evidence.digest).to.equal(REPORT_PHOTO);
      expect(evidence.submitter).to.equal(registrar.address);
    });

    it("rejects registration by accounts without the registrar role for that school", async () => {
      const { registry, outsider, schoolAdmin } =
        await networkHelpers.loadFixture(deployFixture);
      for (const signer of [outsider, schoolAdmin]) {
        await expect(
          registry.connect(signer).registerReport(REPORT, SCHOOL, REPORT_COMMITMENT),
        )
          .to.be.revertedWithCustomError(registry, "Unauthorized")
          .withArgs(signer.address, SCHOOL, Role.Registrar);
      }
    });

    it("scopes roles to the school they were granted for", async () => {
      const { registry, registrar } = await networkHelpers.loadFixture(deployFixture);
      await expect(
        registry
          .connect(registrar)
          .registerReport(REPORT, OTHER_SCHOOL, REPORT_COMMITMENT),
      )
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(registrar.address, OTHER_SCHOOL, Role.Registrar);
    });

    it("rejects duplicate report ids, duplicate commitments and unknown schools", async () => {
      const { registry, registrar } = await networkHelpers.loadFixture(reportedFixture);
      const asRegistrar = registry.connect(registrar);

      await expect(asRegistrar.registerReport(REPORT, SCHOOL, digest("other")))
        .to.be.revertedWithCustomError(registry, "ReportAlreadyRegistered")
        .withArgs(REPORT);
      await expect(
        asRegistrar.registerReport(ethers.id("report:new"), SCHOOL, REPORT_COMMITMENT),
      )
        .to.be.revertedWithCustomError(registry, "DuplicateCommitment")
        .withArgs(REPORT_COMMITMENT, REPORT);
      await expect(
        asRegistrar.registerReport(
          ethers.id("report:new"),
          ethers.id("nope"),
          digest("x"),
        ),
      ).to.be.revertedWithCustomError(registry, "SchoolNotRegistered");
      await expect(
        asRegistrar.registerReport(ethers.ZeroHash, SCHOOL, digest("x")),
      ).to.be.revertedWithCustomError(registry, "ZeroValue");
    });

    it("rejects duplicate evidence and evidence of a kind the caller's role may not submit", async () => {
      const { registry, registrar, schoolAdmin } =
        await networkHelpers.loadFixture(reportedFixture);

      await expect(
        registry.connect(registrar).registerEvidence(REPORT, REPORT_PHOTO, Kind.Report),
      )
        .to.be.revertedWithCustomError(registry, "DuplicateEvidence")
        .withArgs(REPORT, REPORT_PHOTO);
      // A school admin cannot plant "independent review" evidence.
      await expect(
        registry.connect(schoolAdmin).registerEvidence(REPORT, REVIEW_PHOTO, Kind.Review),
      )
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(schoolAdmin.address, SCHOOL, Role.Reviewer);
      await expect(
        registry
          .connect(registrar)
          .registerEvidence(ethers.id("missing"), REPORT_PHOTO, Kind.Report),
      ).to.be.revertedWithCustomError(registry, "ReportNotFound");
    });
  });

  describe("2. acknowledgement and repair claim", () => {
    it("lets the school administrator acknowledge a report exactly once", async () => {
      const { registry, schoolAdmin, reviewer, otherAdmin } =
        await networkHelpers.loadFixture(reportedFixture);

      await expect(registry.connect(reviewer).acknowledgeReport(REPORT))
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(reviewer.address, SCHOOL, Role.SchoolAdmin);
      // An administrator of a different school has no authority here.
      await expect(registry.connect(otherAdmin).acknowledgeReport(REPORT))
        .to.be.revertedWithCustomError(registry, "Unauthorized")
        .withArgs(otherAdmin.address, SCHOOL, Role.SchoolAdmin);

      await expect(registry.connect(schoolAdmin).acknowledgeReport(REPORT))
        .to.emit(registry, "ReportAcknowledged")
        .withArgs(REPORT, SCHOOL, schoolAdmin.address, (ts: bigint) => ts > 0n);
      expect(await registry.statusOf(REPORT)).to.equal(Status.Acknowledged);

      await expect(registry.connect(schoolAdmin).acknowledgeReport(REPORT))
        .to.be.revertedWithCustomError(registry, "InvalidState")
        .withArgs(REPORT, Status.Acknowledged);
    });

    it("records a repair completion claim from the school administrator", async () => {
      const { registry, schoolAdmin } = await networkHelpers.loadFixture(reportedFixture);
      const asAdmin = registry.connect(schoolAdmin);
      await asAdmin.acknowledgeReport(REPORT);

      await expect(asAdmin.claimRepair(REPORT, CLAIM_1))
        .to.emit(registry, "RepairClaimed")
        .withArgs(REPORT, 0n, CLAIM_1, schoolAdmin.address, (ts: bigint) => ts > 0n);

      // A claim is only a claim: the report is not closed.
      expect(await registry.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      const claim = await registry.getClaim(REPORT, 0);
      expect(claim.commitment).to.equal(CLAIM_1);
      expect(claim.claimant).to.equal(schoolAdmin.address);
      expect(claim.outcome).to.equal(Outcome.Pending);
      expect(claim.reviewer).to.equal(ethers.ZeroAddress);
    });

    it("rejects repair claims out of order, duplicated, or from the wrong role", async () => {
      const { registry, schoolAdmin, reviewer, registrar } =
        await networkHelpers.loadFixture(reportedFixture);
      const asAdmin = registry.connect(schoolAdmin);

      // Not yet acknowledged.
      await expect(asAdmin.claimRepair(REPORT, CLAIM_1))
        .to.be.revertedWithCustomError(registry, "InvalidState")
        .withArgs(REPORT, Status.Reported);

      await asAdmin.acknowledgeReport(REPORT);
      for (const signer of [reviewer, registrar]) {
        await expect(
          registry.connect(signer).claimRepair(REPORT, CLAIM_1),
        ).to.be.revertedWithCustomError(registry, "Unauthorized");
      }

      await asAdmin.claimRepair(REPORT, CLAIM_1);
      // A second claim while one is pending review is a duplicate event.
      await expect(asAdmin.claimRepair(REPORT, CLAIM_2))
        .to.be.revertedWithCustomError(registry, "InvalidState")
        .withArgs(REPORT, Status.RepairClaimed);
    });
  });

  describe("interim protection records", () => {
    const PROTECTION_1 = digest("protection-area-closed-off");
    const PROTECTION_2 = digest("protection-temporary-toilets");

    it("records interim protection without changing the report status", async () => {
      const { registry, schoolAdmin } = await networkHelpers.loadFixture(reportedFixture);
      const asAdmin = registry.connect(schoolAdmin);
      await asAdmin.acknowledgeReport(REPORT);

      await expect(asAdmin.recordInterimProtection(REPORT, PROTECTION_1))
        .to.emit(registry, "InterimProtectionRecorded")
        .withArgs(REPORT, 0n, PROTECTION_1, schoolAdmin.address, (ts: bigint) => ts > 0n);

      // Protection is not a repair: the report is still only acknowledged.
      expect(await registry.statusOf(REPORT)).to.equal(Status.Acknowledged);
      const record = await registry.getProtection(REPORT, 0);
      expect(record.commitment).to.equal(PROTECTION_1);
      expect(record.recordedBy).to.equal(schoolAdmin.address);

      // Further measures append; they can also follow a repair claim.
      await asAdmin.claimRepair(REPORT, CLAIM_1);
      await asAdmin.recordInterimProtection(REPORT, PROTECTION_2);
      expect(await registry.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      expect(await registry.protectionCount(REPORT)).to.equal(2n);
      const all = await registry.getAllProtections(REPORT);
      expect(all.map((p) => p.commitment)).to.deep.equal([PROTECTION_1, PROTECTION_2]);
    });

    it("rejects protection records that are unauthorised, duplicated or out of order", async () => {
      const { registry, schoolAdmin, reviewer, registrar, otherAdmin } =
        await networkHelpers.loadFixture(reportedFixture);
      const asAdmin = registry.connect(schoolAdmin);

      // Before acknowledgement.
      await expect(asAdmin.recordInterimProtection(REPORT, PROTECTION_1))
        .to.be.revertedWithCustomError(registry, "InvalidState")
        .withArgs(REPORT, Status.Reported);

      await asAdmin.acknowledgeReport(REPORT);
      for (const signer of [reviewer, registrar, otherAdmin]) {
        await expect(
          registry.connect(signer).recordInterimProtection(REPORT, PROTECTION_1),
        )
          .to.be.revertedWithCustomError(registry, "Unauthorized")
          .withArgs(signer.address, SCHOOL, Role.SchoolAdmin);
      }

      await asAdmin.recordInterimProtection(REPORT, PROTECTION_1);
      await expect(asAdmin.recordInterimProtection(REPORT, PROTECTION_1))
        .to.be.revertedWithCustomError(registry, "DuplicateProtection")
        .withArgs(REPORT, PROTECTION_1);

      // After independent verification the record is closed.
      await asAdmin.claimRepair(REPORT, CLAIM_1);
      await registry.connect(reviewer).verifyRepair(REPORT, REVIEW_1);
      await expect(asAdmin.recordInterimProtection(REPORT, PROTECTION_2))
        .to.be.revertedWithCustomError(registry, "InvalidState")
        .withArgs(REPORT, Status.Verified);
    });

    it("bars an account that only acknowledged or recorded protection from reviewing later", async () => {
      const { registry, schoolAdmin, outsider } =
        await networkHelpers.loadFixture(reportedFixture);
      // schoolAdmin acknowledges and records protection, then is replaced by a new admin.
      await registry.connect(schoolAdmin).acknowledgeReport(REPORT);
      await registry.connect(schoolAdmin).recordInterimProtection(REPORT, PROTECTION_1);
      await registry.revokeRole(SCHOOL, schoolAdmin.address);
      await registry.grantRole(SCHOOL, outsider.address, Role.SchoolAdmin);
      await registry.connect(outsider).claimRepair(REPORT, CLAIM_1);

      // The first admin never claimed the repair, but still acted for the school.
      await registry.grantRole(SCHOOL, schoolAdmin.address, Role.Reviewer);
      await expect(registry.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(registry, "SchoolAdminCannotVerify")
        .withArgs(schoolAdmin.address, REPORT);
    });
  });

  describe("3. unauthorised closure is rejected", () => {
    it("rejects a school administrator verifying their own repair", async () => {
      const { registry, schoolAdmin } =
        await networkHelpers.loadFixture(repairClaimedFixture);

      await expect(registry.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(registry, "SchoolAdminCannotVerify")
        .withArgs(schoolAdmin.address, REPORT);

      // Nothing changed: still awaiting independent review.
      expect(await registry.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      expect((await registry.getClaim(REPORT, 0)).outcome).to.equal(Outcome.Pending);
    });

    it("rejects a school administrator disputing (i.e. reviewing) their own repair", async () => {
      const { registry, schoolAdmin } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await expect(registry.connect(schoolAdmin).disputeRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(registry, "SchoolAdminCannotVerify")
        .withArgs(schoolAdmin.address, REPORT);
    });

    it("rejects closure by outsiders, the registrar and the contract owner", async () => {
      const { registry, outsider, registrar, owner } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      for (const signer of [outsider, registrar, owner]) {
        await expect(registry.connect(signer).verifyRepair(REPORT, REVIEW_1))
          .to.be.revertedWithCustomError(registry, "Unauthorized")
          .withArgs(signer.address, SCHOOL, Role.Reviewer);
      }
    });

    it("refuses to make a school administrator a reviewer of the same school", async () => {
      const { registry, schoolAdmin } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await expect(registry.grantRole(SCHOOL, schoolAdmin.address, Role.Reviewer))
        .to.be.revertedWithCustomError(registry, "RoleConflict")
        .withArgs(SCHOOL, schoolAdmin.address, Role.SchoolAdmin);
    });

    it("still rejects a former administrator who is re-granted the reviewer role", async () => {
      const { registry, schoolAdmin } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await registry.revokeRole(SCHOOL, schoolAdmin.address);
      await registry.grantRole(SCHOOL, schoolAdmin.address, Role.Reviewer);

      await expect(registry.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(registry, "SchoolAdminCannotVerify")
        .withArgs(schoolAdmin.address, REPORT);
    });

    describe("cross-school isolation", () => {
      const OTHER_REPORT = ethers.id("report:other-school");

      // schoolAdmin administers SCHOOL and is, legitimately, a reviewer for OTHER_SCHOOL.
      async function dualRoleFixture() {
        const ctx = await repairClaimedFixture();
        const { registry, registrar, schoolAdmin, otherAdmin } = ctx;
        await registry.grantRole(OTHER_SCHOOL, schoolAdmin.address, Role.Reviewer);
        await registry.grantRole(OTHER_SCHOOL, registrar.address, Role.Registrar);
        await registry
          .connect(registrar)
          .registerReport(OTHER_REPORT, OTHER_SCHOOL, digest("other-school-report"));
        await registry.connect(otherAdmin).acknowledgeReport(OTHER_REPORT);
        await registry
          .connect(otherAdmin)
          .claimRepair(OTHER_REPORT, digest("other-claim"));
        return ctx;
      }

      it("a reviewer role on another school does not let an admin verify their own school's repair", async () => {
        const { registry, schoolAdmin } =
          await networkHelpers.loadFixture(dualRoleFixture);
        expect(await registry.roleOf(OTHER_SCHOOL, schoolAdmin.address)).to.equal(
          Role.Reviewer,
        );

        for (const attempt of [
          registry.connect(schoolAdmin).verifyRepair(REPORT, REVIEW_1),
          registry.connect(schoolAdmin).disputeRepair(REPORT, REVIEW_1),
        ]) {
          await expect(attempt)
            .to.be.revertedWithCustomError(registry, "SchoolAdminCannotVerify")
            .withArgs(schoolAdmin.address, REPORT);
        }
        // Nor can they plant review evidence on their own school's report.
        await expect(
          registry
            .connect(schoolAdmin)
            .registerEvidence(REPORT, REVIEW_PHOTO, Kind.Review),
        )
          .to.be.revertedWithCustomError(registry, "Unauthorized")
          .withArgs(schoolAdmin.address, SCHOOL, Role.Reviewer);
        expect(await registry.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      });

      it("the same account can still review the other school, where it is independent", async () => {
        const { registry, schoolAdmin } =
          await networkHelpers.loadFixture(dualRoleFixture);

        await expect(registry.connect(schoolAdmin).verifyRepair(OTHER_REPORT, REVIEW_2))
          .to.emit(registry, "RepairVerified")
          .withArgs(
            OTHER_REPORT,
            0n,
            REVIEW_2,
            schoolAdmin.address,
            (ts: bigint) => ts > 0n,
          );
        expect(await registry.statusOf(OTHER_REPORT)).to.equal(Status.Verified);
        // The first school's report is untouched.
        expect(await registry.statusOf(REPORT)).to.equal(Status.RepairClaimed);
      });

      it("a reviewer of one school has no authority over another school's report", async () => {
        const { registry, reviewer, otherAdmin } =
          await networkHelpers.loadFixture(dualRoleFixture);
        // `reviewer` reviews SCHOOL only.
        await expect(registry.connect(reviewer).verifyRepair(OTHER_REPORT, REVIEW_1))
          .to.be.revertedWithCustomError(registry, "Unauthorized")
          .withArgs(reviewer.address, OTHER_SCHOOL, Role.Reviewer);
        // `otherAdmin` administers OTHER_SCHOOL only: no role at all on SCHOOL.
        await expect(registry.connect(otherAdmin).verifyRepair(REPORT, REVIEW_1))
          .to.be.revertedWithCustomError(registry, "Unauthorized")
          .withArgs(otherAdmin.address, SCHOOL, Role.Reviewer);
      });
    });

    it("only lets the owner manage schools and roles", async () => {
      const { registry, schoolAdmin } = await networkHelpers.loadFixture(deployFixture);
      const asAdmin = registry.connect(schoolAdmin);
      await expect(
        asAdmin.grantRole(SCHOOL, schoolAdmin.address, Role.Reviewer),
      ).to.be.revertedWithCustomError(registry, "NotOwner");
      await expect(
        asAdmin.revokeRole(SCHOOL, schoolAdmin.address),
      ).to.be.revertedWithCustomError(registry, "NotOwner");
      await expect(asAdmin.registerSchool(ethers.id("s"))).to.be.revertedWithCustomError(
        registry,
        "NotOwner",
      );
    });
  });

  describe("4. independent verification", () => {
    it("lets the independent reviewer verify and close the report", async () => {
      const { registry, reviewer } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      const asReviewer = registry.connect(reviewer);
      await asReviewer.registerEvidence(REPORT, REVIEW_PHOTO, Kind.Review);

      await expect(asReviewer.verifyRepair(REPORT, REVIEW_1))
        .to.emit(registry, "RepairVerified")
        .withArgs(REPORT, 0n, REVIEW_1, reviewer.address, (ts: bigint) => ts > 0n);

      expect(await registry.statusOf(REPORT)).to.equal(Status.Verified);
      const claim = await registry.getClaim(REPORT, 0);
      expect(claim.outcome).to.equal(Outcome.Verified);
      expect(claim.reviewer).to.equal(reviewer.address);
      expect(claim.reviewCommitment).to.equal(REVIEW_1);
    });

    it("cannot verify before a repair has been claimed", async () => {
      const { registry, reviewer } = await networkHelpers.loadFixture(reportedFixture);
      await expect(registry.connect(reviewer).verifyRepair(REPORT, REVIEW_1))
        .to.be.revertedWithCustomError(registry, "InvalidState")
        .withArgs(REPORT, Status.Reported);
    });

    it("treats Verified as terminal: no re-verify, dispute, new claim or new evidence", async () => {
      const { registry, reviewer, schoolAdmin, registrar } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await registry.connect(reviewer).verifyRepair(REPORT, REVIEW_1);

      const attempts = [
        registry.connect(reviewer).verifyRepair(REPORT, REVIEW_2),
        registry.connect(reviewer).disputeRepair(REPORT, REVIEW_2),
        registry.connect(schoolAdmin).claimRepair(REPORT, CLAIM_2),
        registry.connect(registrar).registerEvidence(REPORT, digest("late"), Kind.Report),
      ];
      for (const attempt of attempts) {
        await expect(attempt)
          .to.be.revertedWithCustomError(registry, "InvalidState")
          .withArgs(REPORT, Status.Verified);
      }
    });
  });

  describe("5. dispute", () => {
    it("lets the independent reviewer dispute a repair claim", async () => {
      const { registry, reviewer } =
        await networkHelpers.loadFixture(repairClaimedFixture);

      await expect(registry.connect(reviewer).disputeRepair(REPORT, REVIEW_1))
        .to.emit(registry, "RepairDisputed")
        .withArgs(REPORT, 0n, REVIEW_1, reviewer.address, (ts: bigint) => ts > 0n);

      expect(await registry.statusOf(REPORT)).to.equal(Status.Disputed);
      const claim = await registry.getClaim(REPORT, 0);
      expect(claim.outcome).to.equal(Outcome.Disputed);
      expect(claim.reviewer).to.equal(reviewer.address);
    });

    it("rejects a second review of the same claim", async () => {
      const { registry, reviewer } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      await registry.connect(reviewer).disputeRepair(REPORT, REVIEW_1);
      for (const attempt of [
        registry.connect(reviewer).disputeRepair(REPORT, REVIEW_2),
        registry.connect(reviewer).verifyRepair(REPORT, REVIEW_2),
      ]) {
        await expect(attempt)
          .to.be.revertedWithCustomError(registry, "InvalidState")
          .withArgs(REPORT, Status.Disputed);
      }
    });
  });

  describe("6. historical records are preserved", () => {
    it("keeps every evidence record, claim and event through dispute, re-claim and verification", async () => {
      const { registry, registrar, schoolAdmin, reviewer } =
        await networkHelpers.loadFixture(repairClaimedFixture);
      const asAdmin = registry.connect(schoolAdmin);
      const asReviewer = registry.connect(reviewer);

      const evidenceBefore = (await registry.getAllEvidence(REPORT)).map(plainEvidence);
      const firstClaimBefore = await registry.getClaim(REPORT, 0);

      // First claim is disputed; the school repairs again with new evidence; then verified.
      await asReviewer.registerEvidence(REPORT, REVIEW_PHOTO, Kind.Review);
      await asReviewer.disputeRepair(REPORT, REVIEW_1);
      const secondRepairPhoto = digest("photo-repaired-toilet-second-attempt");
      await asAdmin.registerEvidence(REPORT, secondRepairPhoto, Kind.Repair);
      await asAdmin.claimRepair(REPORT, CLAIM_2);
      await asReviewer.verifyRepair(REPORT, REVIEW_2);

      // Earlier evidence records are byte-for-byte what they were, at the same indexes.
      const evidenceAfter = (await registry.getAllEvidence(REPORT)).map(plainEvidence);
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
      expect(await registry.claimCount(REPORT)).to.equal(2n);
      const first = await registry.getClaim(REPORT, 0);
      expect(first.commitment).to.equal(firstClaimBefore.commitment);
      expect(first.claimant).to.equal(firstClaimBefore.claimant);
      expect(first.claimedAt).to.equal(firstClaimBefore.claimedAt);
      expect(first.outcome).to.equal(Outcome.Disputed);
      expect(first.reviewCommitment).to.equal(REVIEW_1);
      const second = await registry.getClaim(REPORT, 1);
      expect(second.commitment).to.equal(CLAIM_2);
      expect(second.outcome).to.equal(Outcome.Verified);

      // The original report commitment is untouched.
      const report = await registry.getReport(REPORT);
      expect(report.commitment).to.equal(REPORT_COMMITMENT);
      expect(report.status).to.equal(Status.Verified);

      // The full event trail can be replayed from the chain, in order.
      const logs = await ethers.provider.getLogs({
        address: await registry.getAddress(),
        fromBlock: 0,
        toBlock: "latest",
      });
      const trail = logs
        .map((log) => registry.interface.parseLog(log))
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
      const { registry } = await networkHelpers.loadFixture(deployFixture);
      const mutating = registry.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => ethers.FunctionFragment.from(f))
        .filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.name)
        .sort();
      expect(mutating).to.deep.equal([
        "acceptOwnership",
        "acknowledgeReport",
        "claimRepair",
        "disputeRepair",
        "grantRole",
        "recordInterimProtection",
        "registerEvidence",
        "registerReport",
        "registerSchool",
        "revokeRole",
        "transferOwnership",
        "verifyRepair",
      ]);
    });
  });

  describe("ownership", () => {
    it("transfers ownership in two steps", async () => {
      const { registry, owner, outsider } =
        await networkHelpers.loadFixture(deployFixture);
      await registry.transferOwnership(outsider.address);
      expect(await registry.owner()).to.equal(owner.address);
      await expect(registry.acceptOwnership()).to.be.revertedWithCustomError(
        registry,
        "NotPendingOwner",
      );
      await registry.connect(outsider).acceptOwnership();
      expect(await registry.owner()).to.equal(outsider.address);
    });
  });
});
