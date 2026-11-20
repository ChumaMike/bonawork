import { expect } from "chai";
import { network } from "hardhat";
import {
  assertSupportedChain,
  fundRoles,
  idToBytes32,
  parseSchoolIds,
  Role,
  setupRegistry,
} from "../scripts/lib/setup.js";

const { ethers, networkHelpers } = await network.getOrCreate();

// The app's seed schools: demo school plus uid(1, 2..5).
const SCHOOLS = [1, 2, 3, 4, 5].map(
  (n) => `00000000-0000-4000-8000-01${String(n).padStart(10, "0")}`,
);

async function deployFixture() {
  const [owner, registrar, schoolAdmin, reviewer, outsider] = await ethers.getSigners();
  const registry = await ethers.deployContract("BonaRegistry", [owner.address]);
  const roles = {
    registrar: registrar.address,
    schoolAdmin: schoolAdmin.address,
    reviewer: reviewer.address,
  };
  return { registry, owner, registrar, schoolAdmin, reviewer, outsider, roles };
}

describe("setup scripts", () => {
  describe("idToBytes32 / parseSchoolIds", () => {
    it("left-pads the UUID bytes to 32 bytes, as the web app does", () => {
      expect(idToBytes32("3F2B8C1E-9a4d-4e7b-8c2a-5d6e7f8091a2")).to.equal(
        "0x000000000000000000000000000000003f2b8c1e9a4d4e7b8c2a5d6e7f8091a2",
      );
      expect(() => idToBytes32("not-a-uuid")).to.throw("Not a UUID");
    });

    it("parses a comma-separated list and rejects empties, bad ids and duplicates", () => {
      expect(parseSchoolIds(` ${SCHOOLS[0]} , ${SCHOOLS[1]},`)).to.deep.equal([
        SCHOOLS[0],
        SCHOOLS[1],
      ]);
      expect(() => parseSchoolIds(" , ")).to.throw("no school ids");
      expect(() => parseSchoolIds("abc")).to.throw("Not a UUID");
      expect(() => parseSchoolIds(`${SCHOOLS[0]},${SCHOOLS[0].toUpperCase()}`)).to.throw(
        "duplicate",
      );
    });

    it("only accepts Fuji and the local chain", () => {
      assertSupportedChain(43113n);
      assertSupportedChain(31337n);
      expect(() => assertSupportedChain(43114n)).to.throw("Refusing to run");
      expect(() => assertSupportedChain(1n)).to.throw("Refusing to run");
    });
  });

  describe("setupRegistry", () => {
    it("registers every school and grants all three roles", async () => {
      const { registry, roles } = await networkHelpers.loadFixture(deployFixture);

      const rows = await setupRegistry(registry, SCHOOLS, roles);

      // 5 schools x (1 registration + 3 grants), every step a real transaction.
      expect(rows).to.have.lengthOf(20);
      expect(
        rows.every((r) => r.result === "sent" && /^0x[0-9a-f]{64}$/.test(r.txHash)),
      ).to.equal(true);
      for (const school of SCHOOLS) {
        const id = idToBytes32(school);
        expect(await registry.isSchoolRegistered(id)).to.equal(true);
        expect(await registry.roleOf(id, roles.registrar)).to.equal(
          BigInt(Role.Registrar),
        );
        expect(await registry.roleOf(id, roles.schoolAdmin)).to.equal(
          BigInt(Role.SchoolAdmin),
        );
        expect(await registry.roleOf(id, roles.reviewer)).to.equal(BigInt(Role.Reviewer));
      }
    });

    it("is idempotent: a second run sends no transactions and changes nothing", async () => {
      const { registry, owner, roles } = await networkHelpers.loadFixture(deployFixture);
      await setupRegistry(registry, SCHOOLS, roles);

      const blockBefore = await ethers.provider.getBlockNumber();
      const nonceBefore = await ethers.provider.getTransactionCount(owner.address);

      const second = await setupRegistry(registry, SCHOOLS, roles);

      expect(second).to.have.lengthOf(20);
      expect(second.every((r) => r.result === "skipped" && r.txHash === "")).to.equal(
        true,
      );
      expect(await ethers.provider.getBlockNumber()).to.equal(blockBefore);
      expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
        nonceBefore,
      );
    });

    it("resumes a partial setup, sending only what is missing", async () => {
      const { registry, roles } = await networkHelpers.loadFixture(deployFixture);
      // Simulate an interrupted first run: one school registered, one role granted.
      await registry.registerSchool(idToBytes32(SCHOOLS[0]));
      await registry.grantRole(idToBytes32(SCHOOLS[0]), roles.registrar, Role.Registrar);

      const rows = await setupRegistry(registry, SCHOOLS.slice(0, 2), roles);

      expect(rows.map((r) => r.result)).to.deep.equal([
        "skipped", // school 1 already registered
        "skipped", // registrar already granted
        "sent",
        "sent",
        "sent", // school 2 registration
        "sent",
        "sent",
        "sent",
      ]);
      // Adding a school later only touches the new school.
      const third = await setupRegistry(registry, SCHOOLS.slice(0, 3), roles);
      expect(third.filter((r) => r.result === "sent").map((r) => r.school)).to.deep.equal(
        Array(4).fill(SCHOOLS[2]),
      );
    });

    it("refuses to proceed when an address already holds a different role", async () => {
      const { registry, roles } = await networkHelpers.loadFixture(deployFixture);
      const id = idToBytes32(SCHOOLS[0]);
      await registry.registerSchool(id);
      // The intended reviewer was mistakenly made a school admin.
      await registry.grantRole(id, roles.reviewer, Role.SchoolAdmin);

      let message = "";
      try {
        await setupRegistry(registry, [SCHOOLS[0]], roles);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).to.contain("already holds SchoolAdmin");
      // Not silently "fixed": the conflicting role is untouched.
      expect(await registry.roleOf(id, roles.reviewer)).to.equal(
        BigInt(Role.SchoolAdmin),
      );
    });

    it("rejects identical role addresses and non-owner callers", async () => {
      const { registry, outsider, roles } =
        await networkHelpers.loadFixture(deployFixture);

      let message = "";
      try {
        await setupRegistry(registry, SCHOOLS, { ...roles, reviewer: roles.schoolAdmin });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).to.contain("three different addresses");

      await expect(
        setupRegistry(registry.connect(outsider), SCHOOLS, roles),
      ).to.be.revertedWithCustomError(registry, "NotOwner");
    });
  });

  describe("fundRoles", () => {
    const freshRoles = () => ({
      registrar: ethers.Wallet.createRandom().address,
      schoolAdmin: ethers.Wallet.createRandom().address,
      reviewer: ethers.Wallet.createRandom().address,
    });
    const target = ethers.parseEther("0.05");

    it("tops each role address up to the target, then skips on a second run", async () => {
      const [funder] = await ethers.getSigners();
      const roles = freshRoles();

      const first = await fundRoles(funder, ethers.provider, roles, target);
      expect(first.map((r) => [r.before, r.sent, r.after])).to.deep.equal(
        Array(3).fill([0n, target, target]),
      );

      const nonceBefore = await ethers.provider.getTransactionCount(funder.address);
      const second = await fundRoles(funder, ethers.provider, roles, target);
      expect(second.every((r) => r.sent === 0n && r.txHash === "")).to.equal(true);
      expect(await ethers.provider.getTransactionCount(funder.address)).to.equal(
        nonceBefore,
      );
    });

    it("sends only the shortfall to a partly funded address", async () => {
      const [funder] = await ethers.getSigners();
      const roles = freshRoles();
      const partial = ethers.parseEther("0.02");
      await funder.sendTransaction({ to: roles.reviewer, value: partial });

      const rows = await fundRoles(funder, ethers.provider, roles, target);
      const reviewer = rows.find((r) => r.role === "reviewer");
      expect(reviewer?.before).to.equal(partial);
      expect(reviewer?.sent).to.equal(target - partial);
      expect(await ethers.provider.getBalance(roles.reviewer)).to.equal(target);
    });

    it("sends nothing at all if the funder cannot cover every top-up", async () => {
      const [rich] = await ethers.getSigners();
      const poor = ethers.Wallet.createRandom().connect(ethers.provider);
      await rich.sendTransaction({ to: poor.address, value: ethers.parseEther("0.06") });
      const roles = freshRoles();

      let message = "";
      try {
        await fundRoles(poor, ethers.provider, roles, target);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).to.contain("Nothing was sent");
      expect(await ethers.provider.getBalance(roles.registrar)).to.equal(0n);
      expect(await ethers.provider.getTransactionCount(poor.address)).to.equal(0);
    });
  });
});
