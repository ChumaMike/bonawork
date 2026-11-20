import { existsSync, readFileSync } from "node:fs";
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const read = (relative: string) =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));

// The committed ABI files are what the web app and verifier consume. If the contract
// changes and nobody re-runs `pnpm abi` / `pnpm export:abi`, these tests fail.
describe("committed ABI files", () => {
  it("abi/BonaRegistry.json matches the compiled contract", async () => {
    const { interface: compiled } = await ethers.getContractFactory("BonaRegistry");
    const committed = new ethers.Interface(read("../abi/BonaRegistry.json"));
    expect(committed.formatJson()).to.equal(compiled.formatJson());
  });

  it("exports/BonaRegistry.43113.json matches the compiled contract and the deployment record", async () => {
    const { interface: compiled } = await ethers.getContractFactory("BonaRegistry");
    const exported = read("../exports/BonaRegistry.43113.json");

    expect(exported.contract).to.equal("BonaRegistry");
    expect(exported.chainId).to.equal(43113);
    expect(new ethers.Interface(exported.abi).formatJson()).to.equal(
      compiled.formatJson(),
    );

    const deploymentUrl = new URL("../deployments/43113.json", import.meta.url);
    if (existsSync(deploymentUrl)) {
      const deployment = JSON.parse(readFileSync(deploymentUrl, "utf8"));
      expect(exported.deployed).to.equal(true);
      expect(exported.address).to.equal(deployment.address);
      expect(ethers.isAddress(exported.address)).to.equal(true);
    } else {
      // Not deployed: the export must say so rather than carry a made-up address.
      expect(exported.deployed).to.equal(false);
      expect(exported.address).to.equal(null);
    }
  });
});
