// A local dry run of the Fuji scripts: the tests call the same library functions that
// scripts/chain/{deploy,setup,fund,export,generate-keys}.ts call.
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "chai";
import { network } from "hardhat";
import {
  assertAffordable,
  assertSupportedChain,
  bytes32ToId,
  ChainRole,
  chainRoleAddresses,
  DEFAULT_INSTITUTION_IDS,
  deployFactory,
  estimateDeployCost,
  financeAddresses,
  fundAddresses,
  generateFinanceKeys,
  idToBytes32,
  MAX_DEPLOY_COST_WEI,
  parseInstitutionIds,
  planChainSetup,
  readAddressLines,
  readChainDeployment,
  readInstitutions,
  requireChainDeployment,
  setupChain,
  summariseSetup,
  writeChainDeployment,
} from "../../scripts/chain/lib/chain.js";

const { ethers, networkHelpers } = await network.getOrCreate();

const tempDir = () =>
  pathToFileURL(join(mkdtempSync(join(tmpdir(), "bonachain-test-")), "/"));

async function deployedFixture() {
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
  ] = await ethers.getSigners();
  const { deployment, estimate, gasUsed } = await deployFactory(
    await ethers.getContractFactory("BonaChainFactory", owner),
    owner,
    ethers.provider,
  );
  const factory = await ethers.getContractAt(
    "BonaChainFactory",
    deployment.factory,
    owner,
  );
  const roles = {
    registrar: registrar.address,
    schoolAdmin: schoolAdmin.address,
    reviewer: reviewer.address,
    buyer: buyer.address,
    supplier: supplier.address,
    receiver: receiver.address,
    paymentApprover: approver.address,
  };
  return { factory, deployment, estimate, gasUsed, roles, owner, outsider, reviewer };
}

describe("Bona Chain scripts (local dry run)", () => {
  describe("inputs", () => {
    it("defaults to the five seed institutions, converted exactly like school ids", () => {
      expect(parseInstitutionIds(undefined)).to.deep.equal(DEFAULT_INSTITUTION_IDS);
      expect(parseInstitutionIds("  ")).to.deep.equal(DEFAULT_INSTITUTION_IDS);
      expect(DEFAULT_INSTITUTION_IDS).to.deep.equal([
        "00000000-0000-4000-8000-010000000001",
        "00000000-0000-4000-8000-010000000002",
        "00000000-0000-4000-8000-010000000003",
        "00000000-0000-4000-8000-010000000004",
        "00000000-0000-4000-8000-010000000005",
      ]);
      expect(idToBytes32(DEFAULT_INSTITUTION_IDS[0])).to.equal(
        `0x${"0".repeat(32)}00000000000040008000010000000001`,
      );
      // And back again, for the export.
      for (const id of DEFAULT_INSTITUTION_IDS) {
        expect(bytes32ToId(idToBytes32(id))).to.equal(id);
      }
      expect(bytes32ToId(ethers.id("not-a-padded-uuid"))).to.equal(null);
    });

    it("parses BONA_INSTITUTION_IDS and rejects empties, bad ids and duplicates", () => {
      const [a, b] = DEFAULT_INSTITUTION_IDS;
      expect(parseInstitutionIds(` ${a} , ${b.toUpperCase()},`)).to.deep.equal([a, b]);
      expect(() => parseInstitutionIds(" , ")).to.throw("no institution ids");
      expect(() => parseInstitutionIds("abc")).to.throw("Not a UUID");
      expect(() => parseInstitutionIds(`${a},${a.toUpperCase()}`)).to.throw("duplicate");
    });

    it("only accepts Fuji and the local chain", () => {
      assertSupportedChain(43113n);
      assertSupportedChain(31337n);
      for (const mainnetOrOther of [43114n, 1n, 137n]) {
        expect(() => assertSupportedChain(mainnetOrOther)).to.throw("Refusing to run");
      }
    });

    it("reads the seven role addresses from the environment and the finance key file", () => {
      const wallets = Array.from(
        { length: 7 },
        () => ethers.Wallet.createRandom().address,
      );
      const env = {
        BONA_REGISTRAR_ADDRESS: wallets[0],
        BONA_SCHOOL_ADMIN_ADDRESS: wallets[1].toLowerCase(),
        BONA_REVIEWER_ADDRESS: wallets[2],
      };
      const file = [
        `BONA_BUYER_ADDRESS=${wallets[3]}`,
        "BONA_BUYER_PRIVATE_KEY=0xnot-read",
        `BONA_SUPPLIER_ADDRESS=${wallets[4]}`,
        `BONA_RECEIVER_ADDRESS=${wallets[5]}`,
        `BONA_PAYMENT_APPROVER_ADDRESS=${wallets[6]}`,
      ].join("\n");

      // Only ADDRESS lines are read from the file; key lines never enter the process.
      expect(Object.keys(readAddressLines(file))).to.deep.equal([
        "BONA_BUYER_ADDRESS",
        "BONA_SUPPLIER_ADDRESS",
        "BONA_RECEIVER_ADDRESS",
        "BONA_PAYMENT_APPROVER_ADDRESS",
      ]);
      expect(Object.values(chainRoleAddresses(env, file))).to.deep.equal(wallets);
      expect(financeAddresses({}, file).map((e) => e.account)).to.deep.equal(
        wallets.slice(3),
      );

      // The environment wins over the file.
      const override = ethers.Wallet.createRandom().address;
      expect(
        chainRoleAddresses({ ...env, BONA_BUYER_ADDRESS: override }, file).buyer,
      ).to.equal(override);

      expect(() => chainRoleAddresses(env, "")).to.throw("Missing BONA_BUYER_ADDRESS");
      expect(() => financeAddresses({}, "")).to.throw("Missing BONA_BUYER_ADDRESS");
      // All seven must differ: the reviewer may not double as the payment approver.
      expect(() =>
        chainRoleAddresses({ ...env, BONA_PAYMENT_APPROVER_ADDRESS: wallets[2] }, file),
      ).to.throw("must all be different");
    });
  });

  describe("generate-keys", () => {
    it("writes four testnet keys to the file, returns addresses only and refuses to overwrite", () => {
      const file = new URL(".env.finance.local", tempDir());
      const addresses = generateFinanceKeys(file);

      expect(Object.keys(addresses)).to.deep.equal([
        "buyer",
        "supplier",
        "receiver",
        "paymentApprover",
      ]);
      expect(new Set(Object.values(addresses)).size).to.equal(4);
      // What comes back holds no key material.
      for (const value of Object.values(addresses)) {
        expect(ethers.isAddress(value)).to.equal(true);
      }

      const text = readFileSync(file, "utf8");
      for (const [prefix, key] of [
        ["BONA_BUYER", "buyer"],
        ["BONA_SUPPLIER", "supplier"],
        ["BONA_RECEIVER", "receiver"],
        ["BONA_PAYMENT_APPROVER", "paymentApprover"],
      ] as const) {
        const privateKey = new RegExp(
          `^${prefix}_PRIVATE_KEY=(0x[0-9a-f]{64})$`,
          "m",
        ).exec(text)?.[1];
        expect(privateKey, prefix).to.be.a("string");
        // Each stored key really controls the address reported for that role.
        expect(new ethers.Wallet(privateKey!).address).to.equal(addresses[key]);
        expect(text).to.contain(`${prefix}_ADDRESS=${addresses[key]}`);
      }
      // The file feeds setup and fund directly.
      expect(financeAddresses({}, text).map((e) => e.account)).to.deep.equal(
        Object.values(addresses),
      );

      const before = statSync(file).mtimeMs;
      expect(() => generateFinanceKeys(file)).to.throw("Refusing to overwrite");
      expect(readFileSync(file, "utf8")).to.equal(text);
      expect(statSync(file).mtimeMs).to.equal(before);
    });

    it("keeps the real key file out of git", () => {
      const gitignore = readFileSync(
        new URL("../../.gitignore", import.meta.url),
        "utf8",
      );
      expect(gitignore.split(/\r?\n/)).to.include(".env*");
    });
  });

  describe("deploy", () => {
    it("estimates the cost first, then deploys the factory owned by the deployer", async () => {
      const { factory, deployment, estimate, gasUsed, owner } =
        await networkHelpers.loadFixture(deployedFixture);

      expect(estimate.gas).to.equal(gasUsed);
      expect(estimate.cost).to.equal(estimate.gas * estimate.gasPrice);
      expect(estimate.cost > 0n && estimate.cost <= MAX_DEPLOY_COST_WEI).to.equal(true);

      expect(deployment.contract).to.equal("BonaChainFactory");
      expect(deployment.chainId).to.equal(31337);
      expect(deployment.owner).to.equal(owner.address);
      expect(await factory.owner()).to.equal(owner.address);
      expect(deployment.deployBlock).to.be.greaterThan(0);
      expect(deployment.deployTxHash).to.match(/^0x[0-9a-f]{64}$/);
      expect(deployment.institutions).to.deep.equal([]);
    });

    it("aborts before sending anything when the estimate is over the limit or the balance", async () => {
      const [owner] = await ethers.getSigners();
      const contractFactory = await ethers.getContractFactory("BonaChainFactory", owner);
      const nonceBefore = await ethers.provider.getTransactionCount(owner.address);

      let message = "";
      try {
        await deployFactory(contractFactory, owner, ethers.provider, 1n);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).to.contain("Refusing to deploy BonaChainFactory");
      expect(message).to.contain("Nothing was sent");
      expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
        nonceBefore,
      );

      // The 0.2 AVAX limit, at a Fuji-like and at an absurd gas price.
      const estimate = await estimateDeployCost(
        contractFactory,
        owner.address,
        ethers.provider,
      );
      const at = (gwei: string) => {
        const gasPrice = ethers.parseUnits(gwei, "gwei");
        return { ...estimate, gasPrice, cost: estimate.gas * gasPrice };
      };
      assertAffordable(at("25"), MAX_DEPLOY_COST_WEI, "deploy");
      expect(() => assertAffordable(at("100"), MAX_DEPLOY_COST_WEI, "deploy")).to.throw(
        "over the 0.2 AVAX limit",
      );
      expect(() =>
        assertAffordable({ ...at("25"), balance: 1n }, MAX_DEPLOY_COST_WEI, "deploy"),
      ).to.throw("the wallet holds");
    });
  });

  describe("setup", () => {
    it("creates every institution and grants all seven roles", async () => {
      const { factory, roles } = await networkHelpers.loadFixture(deployedFixture);

      const rows = await setupChain(factory, DEFAULT_INSTITUTION_IDS, roles);

      // 5 institutions x (1 creation + 7 grants), every step a real transaction.
      expect(rows).to.have.lengthOf(40);
      expect(
        rows.every((r) => r.result === "sent" && /^0x[0-9a-f]{64}$/.test(r.txHash)),
      ).to.equal(true);
      expect(summariseSetup(rows)).to.equal("40 transaction(s) sent, 0 already in place");

      expect(await factory.institutionCount()).to.equal(5n);
      for (const institution of DEFAULT_INSTITUTION_IDS) {
        const id = idToBytes32(institution);
        const [operations, finance] = await factory.institutionOf(id);
        expect(await factory.isGenuine(operations)).to.equal(true);
        expect(await factory.isGenuine(finance)).to.equal(true);
        expect(await factory.roleOf(id, roles.registrar)).to.equal(1n);
        expect(await factory.roleOf(id, roles.schoolAdmin)).to.equal(2n);
        expect(await factory.roleOf(id, roles.reviewer)).to.equal(3n);
        expect(await factory.roleOf(id, roles.buyer)).to.equal(4n);
        expect(await factory.roleOf(id, roles.supplier)).to.equal(5n);
        expect(await factory.roleOf(id, roles.receiver)).to.equal(6n);
        expect(await factory.roleOf(id, roles.paymentApprover)).to.equal(7n);
      }
    });

    it("is idempotent: a second run sends no transactions and changes nothing", async () => {
      const { factory, owner, roles } = await networkHelpers.loadFixture(deployedFixture);
      await setupChain(factory, DEFAULT_INSTITUTION_IDS, roles);

      const blockBefore = await ethers.provider.getBlockNumber();
      const nonceBefore = await ethers.provider.getTransactionCount(owner.address);

      const second = await setupChain(factory, DEFAULT_INSTITUTION_IDS, roles);

      expect(second).to.have.lengthOf(40);
      expect(second.every((r) => r.result === "skipped" && r.txHash === "")).to.equal(
        true,
      );
      expect(summariseSetup(second)).to.equal(
        "0 transaction(s) sent, 40 already in place",
      );
      expect(await ethers.provider.getBlockNumber()).to.equal(blockBefore);
      expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
        nonceBefore,
      );
    });

    it("resumes a partial setup, sending only what is missing", async () => {
      const { factory, roles } = await networkHelpers.loadFixture(deployedFixture);
      const [first, second, third] = DEFAULT_INSTITUTION_IDS;
      // Simulate an interrupted first run: one institution created, two roles granted.
      await factory.createInstitution(idToBytes32(first));
      await factory.grantRole(idToBytes32(first), roles.registrar, ChainRole.Registrar);
      await factory.grantRole(idToBytes32(first), roles.buyer, ChainRole.Buyer);

      const plan = await planChainSetup(factory, [first, second], roles);
      const rows = await setupChain(factory, [first, second], roles);
      expect(rows.map((r) => r.result)).to.deep.equal(plan.map((r) => r.result));
      expect(summariseSetup(rows)).to.equal("13 transaction(s) sent, 3 already in place");
      expect(
        rows.filter((r) => r.result === "skipped").map((r) => r.action),
      ).to.deep.equal(["createInstitution", "grant Registrar", "grant Buyer"]);

      // Adding an institution later only touches the new one.
      const later = await setupChain(factory, [first, second, third], roles);
      expect(
        later.filter((r) => r.result === "sent").map((r) => r.institution),
      ).to.deep.equal(Array(8).fill(third));
    });

    it("refuses to proceed, before sending anything, when an address holds a different role", async () => {
      const { factory, owner, roles } = await networkHelpers.loadFixture(deployedFixture);
      const [first, second] = DEFAULT_INSTITUTION_IDS;
      const id = idToBytes32(second);
      await factory.createInstitution(id);
      // The intended payment approver was mistakenly made a reviewer of the second one.
      await factory.grantRole(id, roles.paymentApprover, ChainRole.Reviewer);
      const nonceBefore = await ethers.provider.getTransactionCount(owner.address);

      let message = "";
      try {
        await setupChain(factory, [first, second], roles);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).to.contain("already holds Reviewer");
      expect(message).to.contain("Nothing was sent");
      // Not silently "fixed", and the first institution was not half set up either.
      expect(await factory.roleOf(id, roles.paymentApprover)).to.equal(3n);
      expect(await ethers.provider.getTransactionCount(owner.address)).to.equal(
        nonceBefore,
      );
      expect(await factory.institutionCount()).to.equal(1n);
    });

    it("rejects identical role addresses and non-owner callers", async () => {
      const { factory, outsider, roles } =
        await networkHelpers.loadFixture(deployedFixture);

      let message = "";
      try {
        await setupChain(factory, DEFAULT_INSTITUTION_IDS, {
          ...roles,
          paymentApprover: roles.buyer,
        });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).to.contain("must all be different");

      await expect(
        setupChain(factory.connect(outsider), DEFAULT_INSTITUTION_IDS, roles),
      ).to.be.revertedWithCustomError(factory, "NotOwner");
    });
  });

  describe("fund", () => {
    const freshEntries = () =>
      ["buyer", "supplier", "receiver", "paymentApprover"].map((label) => ({
        label,
        account: ethers.Wallet.createRandom().address,
      }));
    const target = ethers.parseEther("0.02");

    it("tops each finance address up to 0.02 AVAX, then skips on a second run", async () => {
      const [funder] = await ethers.getSigners();
      const entries = freshEntries();

      const first = await fundAddresses(funder, ethers.provider, entries, target);
      expect(first.map((r) => [r.before, r.sent, r.after])).to.deep.equal(
        Array(4).fill([0n, target, target]),
      );

      const nonceBefore = await ethers.provider.getTransactionCount(funder.address);
      const second = await fundAddresses(funder, ethers.provider, entries, target);
      expect(second.every((r) => r.sent === 0n && r.txHash === "")).to.equal(true);
      expect(await ethers.provider.getTransactionCount(funder.address)).to.equal(
        nonceBefore,
      );
    });

    it("sends only the shortfall, and nothing at all if the funder cannot cover every top-up", async () => {
      const [rich] = await ethers.getSigners();
      const entries = freshEntries();
      await rich.sendTransaction({
        to: entries[2].account,
        value: ethers.parseEther("0.015"),
      });
      const rows = await fundAddresses(rich, ethers.provider, entries, target);
      expect(rows[2].sent).to.equal(ethers.parseEther("0.005"));
      expect(await ethers.provider.getBalance(entries[2].account)).to.equal(target);

      const poor = ethers.Wallet.createRandom().connect(ethers.provider);
      await rich.sendTransaction({ to: poor.address, value: ethers.parseEther("0.05") });
      const others = freshEntries();
      let message = "";
      try {
        await fundAddresses(poor, ethers.provider, others, target);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).to.contain("Nothing was sent");
      expect(await ethers.provider.getBalance(others[0].account)).to.equal(0n);
      expect(await ethers.provider.getTransactionCount(poor.address)).to.equal(0);
    });
  });

  describe("export", () => {
    it("writes the factory address, deploy block and every institution's two addresses", async () => {
      const { factory, deployment, roles } =
        await networkHelpers.loadFixture(deployedFixture);
      await setupChain(factory, DEFAULT_INSTITUTION_IDS, roles);
      const dir = tempDir();

      expect(readChainDeployment(31337, dir)).to.equal(null);
      expect(() => requireChainDeployment(31337, dir)).to.throw("Run chain:deploy first");

      const institutions = await readInstitutions(factory);
      const url = writeChainDeployment({ ...deployment, institutions }, dir);
      expect(existsSync(url)).to.equal(true);
      expect(url.pathname.endsWith("/bonachain.31337.json")).to.equal(true);

      const exported = requireChainDeployment(31337, dir);
      expect(exported.factory).to.equal(await factory.getAddress());
      expect(exported.deployBlock).to.equal(deployment.deployBlock);
      expect(exported.institutions.map((i) => i.institutionId)).to.deep.equal(
        DEFAULT_INSTITUTION_IDS,
      );
      for (const institution of exported.institutions) {
        const [operations, finance] = await factory.institutionOf(
          institution.institutionIdBytes32,
        );
        expect(institution.operations).to.equal(operations);
        expect(institution.finance).to.equal(finance);
        expect(await factory.kindOf(institution.operations)).to.equal(1n);
        expect(await factory.kindOf(institution.finance)).to.equal(2n);
      }
      // Addresses and ids only: nothing secret is written.
      expect(readFileSync(url, "utf8")).to.not.match(/private|secret|key/i);
    });
  });
});
