import { readFileSync } from "node:fs";
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const EXPORTS = [
  { file: "factory", contract: "BonaChainFactory", exportName: "bonaChainFactoryAbi" },
  {
    file: "operations",
    contract: "InstitutionOperations",
    exportName: "institutionOperationsAbi",
  },
  {
    file: "finance",
    contract: "InstitutionFinance",
    exportName: "institutionFinanceAbi",
  },
] as const;

// The committed ABI files are what the web app and the verifier consume. If a contract
// changes and nobody re-runs `pnpm chain:abi`, these tests fail.
describe("committed Bona Chain ABI files", () => {
  for (const { file, contract, exportName } of EXPORTS) {
    it(`abi/chain/${file}.json and .ts match the compiled ${contract}`, async () => {
      const { interface: compiled } = await ethers.getContractFactory(contract);
      const json = read(`../../abi/chain/${file}.json`);
      expect(new ethers.Interface(JSON.parse(json)).formatJson()).to.equal(
        compiled.formatJson(),
      );

      // The typed module is the same JSON wrapped in `export const <name> = ... as const;`.
      const ts = read(`../../abi/chain/${file}.ts`);
      expect(ts).to.contain(`export const ${exportName} = ${json.trimEnd()} as const;`);
    });
  }

  it("keeps the seven report events byte-identical to BonaRegistry", async () => {
    const { interface: registry } = await ethers.getContractFactory("BonaRegistry");
    const { interface: operations } = await ethers.getContractFactory(
      "InstitutionOperations",
    );
    const names = [
      "ReportRegistered",
      "EvidenceRegistered",
      "ReportAcknowledged",
      "InterimProtectionRecorded",
      "RepairClaimed",
      "RepairVerified",
      "RepairDisputed",
    ];
    for (const name of names) {
      const a = registry.getEvent(name);
      const b = operations.getEvent(name);
      // Same topic, same argument names, same indexed flags.
      expect(b?.topicHash, name).to.equal(a?.topicHash);
      expect(b?.format("full"), name).to.equal(a?.format("full"));
    }
  });
});
