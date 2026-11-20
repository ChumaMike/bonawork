import { expect } from "chai";
import { network } from "hardhat";
import {
  ContractKind,
  deployFixture,
  INSTITUTION,
  OTHER_INSTITUTION,
  Role,
} from "./helpers.js";

const { ethers, networkHelpers } = await network.getOrCreate();

// EIP-170: a contract's runtime code may not exceed 24,576 bytes. The factory carries the
// creation code of both institution contracts, so it is the one to watch.
const RUNTIME_LIMIT = 24_576;
const FACTORY_BUDGET = 24_000;

describe("BonaChainFactory", () => {
  describe("deployment and size", () => {
    it("stays under the contract size limit with room to spare", async () => {
      const { factory } = await networkHelpers.loadFixture(deployFixture);
      const code = await ethers.provider.getCode(await factory.getAddress());
      const size = (code.length - 2) / 2;
      expect(size).to.be.greaterThan(0);
      expect(size).to.be.lessThan(FACTORY_BUDGET);
      expect(FACTORY_BUDGET).to.be.lessThan(RUNTIME_LIMIT);
    });

    it("keeps both institution contracts under the size limit", async () => {
      const { operations, finance } = await networkHelpers.loadFixture(deployFixture);
      for (const contract of [operations, finance]) {
        const code = await ethers.provider.getCode(await contract.getAddress());
        expect((code.length - 2) / 2).to.be.lessThan(RUNTIME_LIMIT);
      }
    });

    it("refuses a zero owner", async () => {
      const factory = await ethers.getContractFactory("BonaChainFactory");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddress",
      );
    });
  });

  describe("ownership", () => {
    it("transfers ownership in two steps", async () => {
      const { factory, owner, outsider } =
        await networkHelpers.loadFixture(deployFixture);

      await expect(factory.transferOwnership(outsider.address))
        .to.emit(factory, "OwnershipTransferStarted")
        .withArgs(owner.address, outsider.address);
      // Nothing changes until the new owner accepts.
      expect(await factory.owner()).to.equal(owner.address);
      expect(await factory.pendingOwner()).to.equal(outsider.address);
      await expect(factory.connect(outsider).createInstitution(ethers.id("x")))
        .to.be.revertedWithCustomError(factory, "NotOwner")
        .withArgs(outsider.address);

      await expect(factory.acceptOwnership())
        .to.be.revertedWithCustomError(factory, "NotPendingOwner")
        .withArgs(owner.address);
      await expect(factory.connect(outsider).acceptOwnership())
        .to.emit(factory, "OwnershipTransferred")
        .withArgs(owner.address, outsider.address);

      expect(await factory.owner()).to.equal(outsider.address);
      expect(await factory.pendingOwner()).to.equal(ethers.ZeroAddress);
      // The previous owner has lost every power.
      await expect(factory.createInstitution(ethers.id("x")))
        .to.be.revertedWithCustomError(factory, "NotOwner")
        .withArgs(owner.address);
      await factory.connect(outsider).createInstitution(ethers.id("x"));
    });

    it("only lets the owner start a transfer, create institutions and manage roles", async () => {
      const { factory, schoolAdmin, outsider } =
        await networkHelpers.loadFixture(deployFixture);
      const asAdmin = factory.connect(schoolAdmin);
      for (const attempt of [
        asAdmin.transferOwnership(schoolAdmin.address),
        asAdmin.createInstitution(ethers.id("s")),
        asAdmin.grantRole(INSTITUTION, outsider.address, Role.Reviewer),
        asAdmin.revokeRole(INSTITUTION, schoolAdmin.address),
      ]) {
        await expect(attempt)
          .to.be.revertedWithCustomError(factory, "NotOwner")
          .withArgs(schoolAdmin.address);
      }
    });
  });

  describe("institutions", () => {
    it("creates an operations and a finance contract wired to the factory and each other", async () => {
      const { factory } = await networkHelpers.loadFixture(deployFixture);
      const id = ethers.id("bona:institution:new");

      const predicted = await factory.createInstitution.staticCall(id);
      await expect(factory.createInstitution(id))
        .to.emit(factory, "InstitutionCreated")
        .withArgs(id, predicted.operations, predicted.finance);

      const [operationsAddress, financeAddress] = await factory.institutionOf(id);
      expect(operationsAddress).to.equal(predicted.operations);
      expect(financeAddress).to.equal(predicted.finance);

      const operations = await ethers.getContractAt(
        "InstitutionOperations",
        operationsAddress,
      );
      const finance = await ethers.getContractAt("InstitutionFinance", financeAddress);
      const factoryAddress = await factory.getAddress();
      expect(await operations.factory()).to.equal(factoryAddress);
      expect(await operations.institutionId()).to.equal(id);
      expect(await finance.factory()).to.equal(factoryAddress);
      expect(await finance.institutionId()).to.equal(id);
      expect(await finance.operations()).to.equal(operationsAddress);
    });

    it("lists institutions in creation order", async () => {
      const { factory } = await networkHelpers.loadFixture(deployFixture);
      expect(await factory.institutionCount()).to.equal(2n);
      expect(await factory.institutionIdAt(0)).to.equal(INSTITUTION);
      expect(await factory.institutionIdAt(1)).to.equal(OTHER_INSTITUTION);
      await expect(factory.institutionIdAt(2)).to.be.revertedWithPanic(0x32);
    });

    it("refuses a duplicate institution and a zero id", async () => {
      const { factory } = await networkHelpers.loadFixture(deployFixture);
      const before = await factory.institutionOf(INSTITUTION);

      await expect(factory.createInstitution(INSTITUTION))
        .to.be.revertedWithCustomError(factory, "InstitutionAlreadyExists")
        .withArgs(INSTITUTION);
      await expect(
        factory.createInstitution(ethers.ZeroHash),
      ).to.be.revertedWithCustomError(factory, "ZeroValue");

      expect(await factory.institutionCount()).to.equal(2n);
      expect(await factory.institutionOf(INSTITUTION)).to.deep.equal(before);
    });

    it("returns zero addresses for an unknown institution", async () => {
      const { factory } = await networkHelpers.loadFixture(deployFixture);
      expect(await factory.institutionOf(ethers.id("nope"))).to.deep.equal([
        ethers.ZeroAddress,
        ethers.ZeroAddress,
      ]);
    });

    it("tells genuine contracts from look-alikes with kindOf and isGenuine", async () => {
      const { factory, operations, finance, outsider } =
        await networkHelpers.loadFixture(deployFixture);
      const operationsAddress = await operations.getAddress();
      const financeAddress = await finance.getAddress();

      expect(await factory.kindOf(operationsAddress)).to.equal(ContractKind.Operations);
      expect(await factory.kindOf(financeAddress)).to.equal(ContractKind.Finance);
      expect(await factory.isGenuine(operationsAddress)).to.equal(true);
      expect(await factory.isGenuine(financeAddress)).to.equal(true);

      // A look-alike deployed by someone else, pointing at the real factory with the real
      // institution id, is still not genuine.
      const factoryAddress = await factory.getAddress();
      const fakeOperations = await ethers.deployContract(
        "InstitutionOperations",
        [factoryAddress, INSTITUTION],
        outsider,
      );
      const fakeFinance = await ethers.deployContract(
        "InstitutionFinance",
        [factoryAddress, INSTITUTION, operationsAddress],
        outsider,
      );
      for (const fake of [fakeOperations, fakeFinance]) {
        const address = await fake.getAddress();
        expect(await factory.kindOf(address)).to.equal(ContractKind.None);
        expect(await factory.isGenuine(address)).to.equal(false);
      }
      // Neither is the factory itself, an ordinary account or the zero address.
      for (const address of [factoryAddress, outsider.address, ethers.ZeroAddress]) {
        expect(await factory.isGenuine(address)).to.equal(false);
      }
    });
  });

  describe("roles", () => {
    it("grants a role for one institution only", async () => {
      const { factory, outsider } = await networkHelpers.loadFixture(deployFixture);

      await expect(factory.grantRole(INSTITUTION, outsider.address, Role.Buyer))
        .to.emit(factory, "RoleGranted")
        .withArgs(INSTITUTION, outsider.address, Role.Buyer);

      expect(await factory.roleOf(INSTITUTION, outsider.address)).to.equal(Role.Buyer);
      expect(await factory.roleOf(OTHER_INSTITUTION, outsider.address)).to.equal(
        Role.None,
      );
    });

    it("refuses grants for unknown institutions, the zero address and the None role", async () => {
      const { factory, outsider } = await networkHelpers.loadFixture(deployFixture);
      const unknown = ethers.id("nope");

      await expect(factory.grantRole(unknown, outsider.address, Role.Buyer))
        .to.be.revertedWithCustomError(factory, "InstitutionNotFound")
        .withArgs(unknown);
      await expect(
        factory.grantRole(INSTITUTION, ethers.ZeroAddress, Role.Buyer),
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
      await expect(
        factory.grantRole(INSTITUTION, outsider.address, Role.None),
      ).to.be.revertedWithCustomError(factory, "InvalidRole");
      // A role number outside the list is not accepted either.
      await expect(factory.grantRole(INSTITUTION, outsider.address, 8)).to.be.revert(
        ethers,
      );
    });

    it("refuses any second role for the same institution, across operations and finance roles", async () => {
      const {
        factory,
        registrar,
        schoolAdmin,
        reviewer,
        buyer,
        supplier,
        receiver,
        approver,
      } = await networkHelpers.loadFixture(deployFixture);
      const holders = [
        [registrar, Role.Registrar],
        [schoolAdmin, Role.SchoolAdmin],
        [reviewer, Role.Reviewer],
        [buyer, Role.Buyer],
        [supplier, Role.Supplier],
        [receiver, Role.Receiver],
        [approver, Role.PaymentApprover],
      ] as const;

      // 7 holders x 7 roles: every combination is refused, including the role already held.
      for (const [holder, held] of holders) {
        for (const [, wanted] of holders) {
          await expect(factory.grantRole(INSTITUTION, holder.address, wanted))
            .to.be.revertedWithCustomError(factory, "RoleConflict")
            .withArgs(INSTITUTION, holder.address, held);
        }
        expect(await factory.roleOf(INSTITUTION, holder.address)).to.equal(held);
      }
    });

    it("lets the same account hold a different role at another institution", async () => {
      const { factory, schoolAdmin } = await networkHelpers.loadFixture(deployFixture);
      await factory.grantRole(
        OTHER_INSTITUTION,
        schoolAdmin.address,
        Role.PaymentApprover,
      );
      expect(await factory.roleOf(INSTITUTION, schoolAdmin.address)).to.equal(
        Role.SchoolAdmin,
      );
      expect(await factory.roleOf(OTHER_INSTITUTION, schoolAdmin.address)).to.equal(
        Role.PaymentApprover,
      );
    });

    it("revokes a role, after which a different one can be granted", async () => {
      const { factory, buyer, outsider } =
        await networkHelpers.loadFixture(deployFixture);

      await expect(factory.revokeRole(INSTITUTION, buyer.address))
        .to.emit(factory, "RoleRevoked")
        .withArgs(INSTITUTION, buyer.address, Role.Buyer);
      expect(await factory.roleOf(INSTITUTION, buyer.address)).to.equal(Role.None);

      await expect(factory.revokeRole(INSTITUTION, buyer.address))
        .to.be.revertedWithCustomError(factory, "RoleNotHeld")
        .withArgs(INSTITUTION, buyer.address);
      await expect(factory.revokeRole(INSTITUTION, outsider.address))
        .to.be.revertedWithCustomError(factory, "RoleNotHeld")
        .withArgs(INSTITUTION, outsider.address);

      await factory.grantRole(INSTITUTION, buyer.address, Role.Receiver);
      expect(await factory.roleOf(INSTITUTION, buyer.address)).to.equal(Role.Receiver);
    });

    it("takes effect in the institution contracts at once, with no copy of the role kept there", async () => {
      const { factory, finance, operations, registrar, buyer } =
        await networkHelpers.loadFixture(deployFixture);
      const report = ethers.id("report:live-role");
      await operations.connect(registrar).registerReport(report, ethers.id("c1"));

      await factory.revokeRole(INSTITUTION, buyer.address);
      await expect(
        finance.connect(buyer).approveWorkOrder(ethers.id("o1"), report, ethers.id("c2")),
      )
        .to.be.revertedWithCustomError(finance, "Unauthorized")
        .withArgs(buyer.address, Role.Buyer);

      await factory.grantRole(INSTITUTION, buyer.address, Role.Buyer);
      await finance
        .connect(buyer)
        .approveWorkOrder(ethers.id("o1"), report, ethers.id("c2"));
    });

    it("exposes only the documented state-changing functions", async () => {
      const { factory } = await networkHelpers.loadFixture(deployFixture);
      const mutating = factory.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => ethers.FunctionFragment.from(f))
        .filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.name)
        .sort();
      expect(mutating).to.deep.equal([
        "acceptOwnership",
        "createInstitution",
        "grantRole",
        "revokeRole",
        "transferOwnership",
      ]);
    });
  });
});
