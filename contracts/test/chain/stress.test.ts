// Stress test: 25 institutions x 8 cases, driven by a seeded random number generator and
// checked, step by step, against a small reference model written in plain TypeScript.
//
// Every institution uses the SAME eight report ids and the SAME eight work order ids, so
// any leak between institutions shows up as a state that differs from its own model.
//
// Before each step the model predicts the outcome: success, or the exact custom error.
// Predicted successes are sent as transactions; predicted refusals are checked with a
// read-only call. Afterwards the chain is audited from its events alone.
//
// Also writes the gas table to contracts/exports/chain-gas-report.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect } from "chai";
import type { BaseContract, Interface, Log } from "ethers";
import { artifacts, network } from "hardhat";
import { revertName } from "../../scripts/chain/lib/chain.js";

const { ethers } = await network.getOrCreate();

const SEED = 20261120;
const INSTITUTIONS = 25;
const CASES = 8;
const STEPS = 4200;

// ------------------------------------------------------------------ enums

const R = {
  None: 0,
  Registrar: 1,
  SchoolAdmin: 2,
  Reviewer: 3,
  Buyer: 4,
  Supplier: 5,
  Receiver: 6,
  PaymentApprover: 7,
} as const;
const S = {
  None: 0,
  Reported: 1,
  Acknowledged: 2,
  RepairClaimed: 3,
  Verified: 4,
  Disputed: 5,
} as const;
const O = { None: 0, Approved: 1, Acknowledged: 2, Released: 3 } as const;

// ------------------------------------------------------------------- PRNG

/** mulberry32: small, fast, and the same sequence on every machine. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------- reference model

interface ReportModel {
  status: number;
  acted: Set<string>; // acknowledged, recorded protection or claimed a repair
  reviewed: Set<string>; // verified or disputed a claim
  evidence: string[];
  protections: string[];
}

interface OrderModel {
  status: number;
  actedAs: Map<string, number>;
  supplier: string;
  invoices: string[];
  receiptCount: number;
  matchPassed: boolean;
  disputeOpen: boolean;
  opener: string;
}

interface InstitutionModel {
  roles: Map<string, number>;
  reports: (ReportModel | null)[];
  orders: (OrderModel | null)[];
  reportCommitments: Set<string>;
  financeCommitments: string[];
  verified: number;
  released: number;
}

const FUNCTIONS = [
  "registerReport",
  "registerEvidence",
  "acknowledgeReport",
  "recordInterimProtection",
  "claimRepair",
  "verifyRepair",
  "disputeRepair",
  "approveWorkOrder",
  "acknowledgeWorkOrder",
  "submitInvoice",
  "recordGoodsReceipt",
  "recordMatchResult",
  "openPaymentDispute",
  "closePaymentDispute",
  "authoriseRelease",
] as const;
type Fn = (typeof FUNCTIONS)[number];
const OPERATIONS_FNS: readonly Fn[] = FUNCTIONS.slice(0, 7);

interface Action {
  fn: Fn;
  actor: string;
  /** Case index: selects the report id and the work order id. */
  k: number;
  /** Commitment or evidence digest. */
  c: string;
  kind: number;
  invoice: string;
  passed: boolean;
}

const EVIDENCE_ROLE = [R.Registrar, R.SchoolAdmin, R.Reviewer];

/** What the contracts must do with `a`: null for success, else the custom error name. */
function predict(m: InstitutionModel, a: Action): string | null {
  const held = m.roles.get(a.actor) ?? R.None;
  const report = m.reports[a.k];
  const order = m.orders[a.k];
  const used = (c: string) => m.financeCommitments.includes(c);

  // Finance gate: separation of duties first, then the role.
  const gate = (o: OrderModel, required: number): string | null => {
    const prior = o.actedAs.get(a.actor) ?? R.None;
    if (prior !== R.None && prior !== required) return "SeparationOfDuties";
    return held === required ? null : "Unauthorized";
  };

  switch (a.fn) {
    case "registerReport":
      if (held !== R.Registrar) return "Unauthorized";
      if (report) return "ReportAlreadyRegistered";
      return m.reportCommitments.has(a.c) ? "DuplicateCommitment" : null;

    case "registerEvidence":
      if (!report) return "ReportNotFound";
      if (report.status === S.Verified) return "InvalidState";
      if (held !== EVIDENCE_ROLE[a.kind]) return "Unauthorized";
      return report.evidence.includes(a.c) ? "DuplicateEvidence" : null;

    case "acknowledgeReport":
      if (!report) return "ReportNotFound";
      if (held !== R.SchoolAdmin) return "Unauthorized";
      return report.status === S.Reported ? null : "InvalidState";

    case "recordInterimProtection":
      if (!report) return "ReportNotFound";
      if (held !== R.SchoolAdmin) return "Unauthorized";
      if (report.status === S.Reported || report.status === S.Verified)
        return "InvalidState";
      return report.protections.includes(a.c) ? "DuplicateProtection" : null;

    case "claimRepair":
      if (!report) return "ReportNotFound";
      if (held !== R.SchoolAdmin) return "Unauthorized";
      return report.status === S.Acknowledged || report.status === S.Disputed
        ? null
        : "InvalidState";

    case "verifyRepair":
    case "disputeRepair":
      if (!report) return "ReportNotFound";
      if (held === R.SchoolAdmin || report.acted.has(a.actor)) {
        return "SchoolAdminCannotVerify";
      }
      if (held !== R.Reviewer) return "Unauthorized";
      return report.status === S.RepairClaimed ? null : "InvalidState";

    case "approveWorkOrder":
      if (held !== R.Buyer) return "Unauthorized";
      if (order) return "WorkOrderAlreadyExists";
      if (!report) return "ReportNotFound";
      return used(a.c) ? "DuplicateCommitment" : null;

    case "acknowledgeWorkOrder": {
      if (!order) return "WorkOrderNotFound";
      const refused = gate(order, R.Supplier);
      if (refused) return refused;
      return order.status === O.Approved ? null : "InvalidOrderState";
    }

    case "submitInvoice": {
      if (!order) return "WorkOrderNotFound";
      const refused = gate(order, R.Supplier);
      if (refused) return refused;
      if (order.status !== O.Acknowledged) return "InvalidOrderState";
      if (order.supplier !== a.actor) return "Unauthorized";
      return used(a.c) ? "DuplicateCommitment" : null;
    }

    case "recordGoodsReceipt": {
      if (!order) return "WorkOrderNotFound";
      const refused = gate(order, R.Receiver);
      if (refused) return refused;
      if (order.status === O.Released) return "InvalidOrderState";
      return used(a.c) ? "DuplicateCommitment" : null;
    }

    case "recordMatchResult": {
      if (!order) return "WorkOrderNotFound";
      const refused = gate(order, R.Registrar);
      if (refused) return refused;
      if (order.status !== O.Acknowledged) return "InvalidOrderState";
      if (order.invoices.length === 0) return "NoInvoice";
      if (order.invoices[order.invoices.length - 1] !== a.invoice) return "StaleInvoice";
      return used(a.c) ? "DuplicateCommitment" : null;
    }

    case "openPaymentDispute": {
      if (!order) return "WorkOrderNotFound";
      const refused = gate(order, held === R.Receiver ? R.Receiver : R.Buyer);
      if (refused) return refused;
      if (order.status === O.Released) return "InvalidOrderState";
      if (order.disputeOpen) return "DisputeOpen";
      return used(a.c) ? "DuplicateCommitment" : null;
    }

    case "closePaymentDispute": {
      if (!order) return "WorkOrderNotFound";
      if (!order.disputeOpen) return "NoOpenDispute";
      const refused = gate(order, order.actedAs.get(order.opener) ?? R.None);
      if (refused) return refused;
      if (order.opener !== a.actor) return "Unauthorized";
      return used(a.c) ? "DuplicateCommitment" : null;
    }

    case "authoriseRelease": {
      if (!order) return "WorkOrderNotFound";
      // The report always exists once the order does.
      const linked = report!;
      if (linked.acted.has(a.actor) || linked.reviewed.has(a.actor)) {
        return "SeparationOfDuties";
      }
      const refused = gate(order, R.PaymentApprover);
      if (refused) return refused;
      if (order.status !== O.Acknowledged) return "InvalidOrderState";
      if (order.invoices.length === 0) return "NoInvoice";
      if (order.receiptCount === 0) return "NoGoodsReceipt";
      if (!order.matchPassed) return "MatchNotPassing";
      if (order.disputeOpen) return "DisputeOpen";
      if (linked.status !== S.Verified) return "RepairNotVerified";
      return used(a.c) ? "DuplicateCommitment" : null;
    }
  }
}

/** Applies a successful action to the model. */
function apply(m: InstitutionModel, a: Action): void {
  const held = m.roles.get(a.actor) ?? R.None;
  const report = m.reports[a.k];
  const order = m.orders[a.k];
  const act = (o: OrderModel, role: number) => {
    if (!o.actedAs.has(a.actor)) o.actedAs.set(a.actor, role);
  };

  switch (a.fn) {
    case "registerReport":
      m.reports[a.k] = {
        status: S.Reported,
        acted: new Set(),
        reviewed: new Set(),
        evidence: [],
        protections: [],
      };
      m.reportCommitments.add(a.c);
      return;
    case "registerEvidence":
      report!.evidence.push(a.c);
      return;
    case "acknowledgeReport":
      report!.status = S.Acknowledged;
      report!.acted.add(a.actor);
      return;
    case "recordInterimProtection":
      report!.protections.push(a.c);
      report!.acted.add(a.actor);
      return;
    case "claimRepair":
      report!.status = S.RepairClaimed;
      report!.acted.add(a.actor);
      return;
    case "verifyRepair":
      report!.status = S.Verified;
      report!.reviewed.add(a.actor);
      m.verified += 1;
      return;
    case "disputeRepair":
      report!.status = S.Disputed;
      report!.reviewed.add(a.actor);
      return;
    case "approveWorkOrder":
      m.orders[a.k] = {
        status: O.Approved,
        actedAs: new Map([[a.actor, R.Buyer]]),
        supplier: "",
        invoices: [],
        receiptCount: 0,
        matchPassed: false,
        disputeOpen: false,
        opener: "",
      };
      break;
    case "acknowledgeWorkOrder":
      act(order!, R.Supplier);
      order!.status = O.Acknowledged;
      order!.supplier = a.actor;
      return;
    case "submitInvoice":
      act(order!, R.Supplier);
      order!.invoices.push(a.c);
      order!.matchPassed = false; // a new invoice voids the match
      break;
    case "recordGoodsReceipt":
      act(order!, R.Receiver);
      order!.receiptCount += 1;
      order!.matchPassed = false; // a later receipt voids the match
      break;
    case "recordMatchResult":
      act(order!, R.Registrar);
      order!.matchPassed = a.passed;
      break;
    case "openPaymentDispute":
      act(order!, held === R.Receiver ? R.Receiver : R.Buyer);
      order!.disputeOpen = true;
      order!.opener = a.actor;
      break;
    case "closePaymentDispute":
      order!.disputeOpen = false;
      order!.opener = "";
      break;
    case "authoriseRelease":
      act(order!, R.PaymentApprover);
      order!.status = O.Released;
      m.released += 1;
      break;
  }
  m.financeCommitments.push(a.c);
}

/**
 * Release eligibility, written independently of `predict` and in the words of the brief:
 * acknowledged order, a passing match on the latest invoice with no later receipt, no open
 * dispute, a verified repair, and an authoriser who played no other part in the case.
 */
function eligibleForRelease(m: InstitutionModel, k: number, actor: string): boolean {
  const report = m.reports[k];
  const order = m.orders[k];
  if (!report || !order) return false;
  const otherPart = [...order.actedAs.entries()].some(
    ([account, role]) => account === actor && role !== R.PaymentApprover,
  );
  return (
    m.roles.get(actor) === R.PaymentApprover &&
    order.status === O.Acknowledged &&
    order.invoices.length > 0 &&
    order.receiptCount > 0 &&
    order.matchPassed &&
    !order.disputeOpen &&
    report.status === S.Verified &&
    !otherPart &&
    !report.acted.has(actor) &&
    !report.reviewed.has(actor)
  );
}

// ------------------------------------------------------------- gas table

const gasByFunction = new Map<string, bigint[]>();
const noteGas = (name: string, gas: bigint) => {
  const list = gasByFunction.get(name) ?? [];
  list.push(gas);
  gasByFunction.set(name, list);
};
const fmt = (n: bigint | number) => Number(n).toLocaleString("en-US");

interface FullCaseRow {
  step: string;
  signer: string;
  gas: bigint;
  finance: boolean;
}
const report: {
  sizes: { name: string; runtime: number; creation: number }[];
  deployGas: bigint;
  fullCase: FullCaseRow[];
  outcomes: Map<string, number>;
  summary: string[];
} = { sizes: [], deployGas: 0n, fullCase: [], outcomes: new Map(), summary: [] };

function writeGasReport() {
  const stat = (name: string) => {
    const list = [...(gasByFunction.get(name) ?? [])].sort((x, y) => (x < y ? -1 : 1));
    if (list.length === 0) return null;
    return {
      calls: list.length,
      min: list[0],
      median: list[Math.floor(list.length / 2)],
      max: list[list.length - 1],
    };
  };
  const lines: string[] = [
    "# Bona Chain gas report",
    "",
    "Generated by `pnpm chain:gas` (`contracts/test/chain/stress.test.ts`). Do not edit by hand.",
    "",
    "Measured on Hardhat's local network with the compiler settings used for Fuji",
    "(solc 0.8.28, optimizer 200 runs, EVM `cancun`). Gas **units** carry over to Fuji; the",
    "AVAX cost is `units x gas price`, and the gas price is not something a local run can know.",
    "",
    "## Contract sizes",
    "",
    "The limit for deployed (runtime) code is 24,576 bytes. The factory carries the creation",
    "code of both institution contracts, so it is the one to watch.",
    "",
    "| Contract | Runtime bytes | Creation bytes |",
    "| --- | ---: | ---: |",
    ...report.sizes.map(
      (s) => `| \`${s.name}\` | ${fmt(s.runtime)} | ${fmt(s.creation)} |`,
    ),
    "",
    "## One full case, step by step",
    "",
    "A fresh institution, one report and one work order, the shortest honest path from the",
    "report to the release instruction.",
    "",
    "| Step | Signer | Gas units |",
    "| --- | --- | ---: |",
    ...report.fullCase.map((r) => `| \`${r.step}\` | ${r.signer} | ${fmt(r.gas)} |`),
    `| **Finance steps only** | | **${fmt(
      report.fullCase.filter((r) => r.finance).reduce((sum, r) => sum + r.gas, 0n),
    )}** |`,
    `| **Full case (${report.fullCase.length} transactions)** | | **${fmt(
      report.fullCase.reduce((sum, r) => sum + r.gas, 0n),
    )}** |`,
    "",
    "## Setup",
    "",
    "| Operation | Signer | Calls | Min | Median | Max |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    `| \`deploy BonaChainFactory\` | owner | 1 | ${fmt(report.deployGas)} | ${fmt(report.deployGas)} | ${fmt(report.deployGas)} |`,
    ...["createInstitution", "grantRole", "revokeRole"].flatMap((name) => {
      const s = stat(name);
      return s
        ? [
            `| \`${name}\` | owner | ${fmt(s.calls)} | ${fmt(s.min)} | ${fmt(s.median)} | ${fmt(s.max)} |`,
          ]
        : [];
    }),
    "",
    "For the five seed institutions the Fuji runbook therefore needs about",
    (() => {
      const create = stat("createInstitution")?.max ?? 0n;
      const grant = stat("grantRole")?.max ?? 0n;
      const total = report.deployGas + 5n * create + 35n * grant + 4n * 21_000n;
      return `**${fmt(total)} gas** (1 deploy + 5 x createInstitution + 35 x grantRole + 4 transfers).`;
    })(),
    "",
    `## Stress run (${INSTITUTIONS} institutions x ${CASES} cases, seed ${SEED})`,
    "",
    "Gas of every successful transaction in the run. Units vary with storage state: the",
    "first write to a fresh slot costs more than later writes.",
    "",
    "| Function | Calls | Min | Median | Max |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...FUNCTIONS.flatMap((name) => {
      const s = stat(name);
      return s
        ? [
            `| \`${name}\` | ${fmt(s.calls)} | ${fmt(s.min)} | ${fmt(s.median)} | ${fmt(s.max)} |`,
          ]
        : [];
    }),
    "",
    "### What the run did",
    "",
    ...report.summary.map((line) => `- ${line}`),
    "",
    "### Refusals checked against the model",
    "",
    "| Custom error | Times |",
    "| --- | ---: |",
    ...[...report.outcomes.entries()]
      .filter(([name]) => name !== "success")
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([name, count]) => `| \`${name}\` | ${fmt(count)} |`),
    "",
  ];
  const dir = new URL("../../exports/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("chain-gas-report.md", dir), lines.join("\n"));
}

// ------------------------------------------------------------------ tests

const digest = (s: string) => ethers.sha256(ethers.toUtf8Bytes(s));
const REPORT_IDS = Array.from({ length: CASES }, (_, k) =>
  ethers.id(`stress:report:${k}`),
);
const ORDER_IDS = Array.from({ length: CASES }, (_, k) => ethers.id(`stress:order:${k}`));

describe("Bona Chain stress test", function () {
  this.timeout(600_000);

  it("measures the contract sizes and one full case", async () => {
    const [owner, registrar, schoolAdmin, reviewer, buyer, supplier, receiver, approver] =
      await ethers.getSigners();

    for (const name of [
      "BonaChainFactory",
      "InstitutionOperations",
      "InstitutionFinance",
    ]) {
      const artifact = await artifacts.readArtifact(name);
      report.sizes.push({
        name,
        runtime: (artifact.deployedBytecode.length - 2) / 2,
        creation: (artifact.bytecode.length - 2) / 2,
      });
    }
    expect(report.sizes[0].runtime).to.be.lessThan(24_000);

    const factory = await ethers.deployContract("BonaChainFactory", [owner.address]);
    report.deployGas = (await factory.deploymentTransaction()!.wait())!.gasUsed;

    const institution = ethers.id("stress:full-case");
    await factory.createInstitution(institution);
    const [operationsAddress, financeAddress] = await factory.institutionOf(institution);
    const operations = await ethers.getContractAt(
      "InstitutionOperations",
      operationsAddress,
    );
    const finance = await ethers.getContractAt("InstitutionFinance", financeAddress);
    const holders = [
      registrar,
      schoolAdmin,
      reviewer,
      buyer,
      supplier,
      receiver,
      approver,
    ];
    for (const [index, holder] of holders.entries()) {
      await factory.grantRole(institution, holder.address, index + 1);
    }

    const r = REPORT_IDS[0];
    const o = ORDER_IDS[0];
    const steps: [
      string,
      string,
      boolean,
      () => Promise<{ wait(): Promise<unknown> }>,
    ][] = [
      [
        "registerReport",
        "registrar",
        false,
        () => operations.connect(registrar).registerReport(r, digest("report")),
      ],
      [
        "registerEvidence (report photo)",
        "registrar",
        false,
        () => operations.connect(registrar).registerEvidence(r, digest("photo"), 0),
      ],
      [
        "acknowledgeReport",
        "school admin",
        false,
        () => operations.connect(schoolAdmin).acknowledgeReport(r),
      ],
      [
        "approveWorkOrder",
        "buyer",
        true,
        () => finance.connect(buyer).approveWorkOrder(o, r, digest("order")),
      ],
      [
        "acknowledgeWorkOrder",
        "supplier",
        true,
        () => finance.connect(supplier).acknowledgeWorkOrder(o),
      ],
      [
        "recordGoodsReceipt",
        "receiver",
        true,
        () => finance.connect(receiver).recordGoodsReceipt(o, digest("receipt")),
      ],
      [
        "submitInvoice",
        "supplier",
        true,
        () => finance.connect(supplier).submitInvoice(o, digest("invoice")),
      ],
      [
        "recordMatchResult",
        "registrar",
        true,
        () =>
          finance
            .connect(registrar)
            .recordMatchResult(o, digest("invoice"), true, digest("match")),
      ],
      [
        "registerEvidence (repair photo)",
        "school admin",
        false,
        () => operations.connect(schoolAdmin).registerEvidence(r, digest("repair"), 1),
      ],
      [
        "claimRepair",
        "school admin",
        false,
        () => operations.connect(schoolAdmin).claimRepair(r, digest("claim")),
      ],
      [
        "registerEvidence (review photo)",
        "reviewer",
        false,
        () => operations.connect(reviewer).registerEvidence(r, digest("review-photo"), 2),
      ],
      [
        "verifyRepair",
        "reviewer",
        false,
        () => operations.connect(reviewer).verifyRepair(r, digest("review")),
      ],
      [
        "authoriseRelease",
        "payment approver",
        true,
        () => finance.connect(approver).authoriseRelease(o, digest("release")),
      ],
    ];
    for (const [step, signer, isFinance, send] of steps) {
      const receipt = (await (await send()).wait()) as { gasUsed: bigint };
      report.fullCase.push({ step, signer, gas: receipt.gasUsed, finance: isFinance });
    }
    expect((await finance.getWorkOrder(o)).status).to.equal(3n);
  });

  it(`drives ${INSTITUTIONS} institutions x ${CASES} cases against the reference model`, async () => {
    const random = prng(SEED);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
    const signers = await ethers.getSigners();
    const owner = signers[0];
    const signerOf = new Map(signers.map((s) => [s.address, s]));
    // Two complete casts, so a role holder of one institution is a stranger at the next.
    const casts = [signers.slice(1, 8), signers.slice(8, 15)].map((cast) =>
      cast.map((s) => s.address),
    );
    const floaters = [signers[15].address, signers[16].address];

    const factory = await ethers.deployContract("BonaChainFactory", [owner.address]);

    // ---- setup: 25 institutions, seven roles each
    const institutions: {
      id: string;
      operations: BaseContract;
      finance: BaseContract;
      model: InstitutionModel;
      cast: string[];
      strangers: string[];
    }[] = [];
    for (let i = 0; i < INSTITUTIONS; i++) {
      const id = ethers.id(`stress:institution:${i}`);
      const created = await (await factory.createInstitution(id)).wait();
      noteGas("createInstitution", created!.gasUsed);
      const [operationsAddress, financeAddress] = await factory.institutionOf(id);
      const cast = casts[i % 2];
      const model: InstitutionModel = {
        roles: new Map(),
        reports: Array(CASES).fill(null),
        orders: Array(CASES).fill(null),
        reportCommitments: new Set(),
        financeCommitments: [],
        verified: 0,
        released: 0,
      };
      for (const [index, account] of cast.entries()) {
        const granted = await (await factory.grantRole(id, account, index + 1)).wait();
        noteGas("grantRole", granted!.gasUsed);
        model.roles.set(account, index + 1);
      }
      institutions.push({
        id,
        operations: await ethers.getContractAt(
          "InstitutionOperations",
          operationsAddress,
        ),
        finance: await ethers.getContractAt("InstitutionFinance", financeAddress),
        model,
        cast,
        strangers: casts[(i + 1) % 2],
      });
    }

    // ---- helpers
    let counter = 0;
    const fresh = () => digest(`stress:commitment:${counter++}`);
    const holdersOf = (m: InstitutionModel, role: number) =>
      [...m.roles.entries()]
        .filter(([, held]) => held === role)
        .map(([account]) => account);
    const argsOf = (a: Action): unknown[] => {
      const r = REPORT_IDS[a.k];
      const o = ORDER_IDS[a.k];
      switch (a.fn) {
        case "registerReport":
        case "recordInterimProtection":
        case "claimRepair":
        case "verifyRepair":
        case "disputeRepair":
          return [r, a.c];
        case "registerEvidence":
          return [r, a.c, a.kind];
        case "acknowledgeReport":
          return [r];
        case "approveWorkOrder":
          return [o, r, a.c];
        case "acknowledgeWorkOrder":
          return [o];
        case "recordMatchResult":
          return [o, a.invoice, a.passed, a.c];
        default:
          return [o, a.c];
      }
    };
    const blank = (fn: Fn, k: number, actor: string): Action => ({
      fn,
      actor,
      k,
      c: fresh(),
      kind: 0,
      invoice: ethers.ZeroHash,
      passed: true,
    });
    const complete = (m: InstitutionModel, k: number) =>
      m.reports[k]?.status === S.Verified && m.orders[k]?.status === O.Released;

    /** A step that should succeed: chosen among the actions the model allows right now. */
    const progress = (m: InstitutionModel, k: number): Action | null => {
      const order = m.orders[k];
      const candidates: { action: Action; weight: number }[] = [];
      const offer = (
        fn: Fn,
        role: number,
        weight: number,
        patch: Partial<Action> = {},
      ) => {
        const holders = holdersOf(m, role);
        if (holders.length === 0) return;
        const action = { ...blank(fn, k, pick(holders)), ...patch };
        if (predict(m, action) === null) candidates.push({ action, weight });
      };
      offer("registerReport", R.Registrar, 5);
      offer("registerEvidence", R.Registrar, 0.3, { kind: 0 });
      offer("registerEvidence", R.SchoolAdmin, 0.3, { kind: 1 });
      offer("registerEvidence", R.Reviewer, 0.3, { kind: 2 });
      offer("acknowledgeReport", R.SchoolAdmin, 3);
      offer("recordInterimProtection", R.SchoolAdmin, 0.3);
      offer("claimRepair", R.SchoolAdmin, 3);
      offer("verifyRepair", R.Reviewer, 4);
      offer("disputeRepair", R.Reviewer, 0.6);
      offer("approveWorkOrder", R.Buyer, 3);
      offer("acknowledgeWorkOrder", R.Supplier, 3);
      if (order) {
        if (order.supplier) {
          const invoice = blank("submitInvoice", k, order.supplier);
          if (predict(m, invoice) === null) {
            candidates.push({
              action: invoice,
              weight: order.invoices.length === 0 ? 3 : 0.25,
            });
          }
        }
        offer("recordGoodsReceipt", R.Receiver, order.receiptCount === 0 ? 3 : 0.25);
        offer("recordMatchResult", R.Registrar, order.matchPassed ? 0.2 : 3, {
          invoice: order.invoices[order.invoices.length - 1] ?? ethers.ZeroHash,
          passed: random() < 0.75,
        });
        offer("openPaymentDispute", random() < 0.5 ? R.Buyer : R.Receiver, 0.25);
        if (order.disputeOpen) {
          const close = blank("closePaymentDispute", k, order.opener);
          if (predict(m, close) === null) candidates.push({ action: close, weight: 2.5 });
        }
        offer("authoriseRelease", R.PaymentApprover, 8);
      }
      if (candidates.length === 0) return null;
      let roll = random() * candidates.reduce((sum, c) => sum + c.weight, 0);
      for (const candidate of candidates) {
        roll -= candidate.weight;
        if (roll <= 0) return candidate.action;
      }
      return candidates[candidates.length - 1].action;
    };

    /** Anything by anyone: mostly refusals, including strangers and reused fingerprints. */
    const chaos = (inst: (typeof institutions)[number], k: number): Action => {
      const m = inst.model;
      const actor = pick([
        ...inst.cast,
        ...inst.cast,
        ...floaters,
        ...inst.strangers,
        owner.address,
      ]);
      // One time in four: the payment approver tries to release early. This is the
      // attempt the whole design exists to refuse, so it gets extra weight.
      const early = random() < 0.25;
      const action = early
        ? blank("authoriseRelease", k, inst.cast[R.PaymentApprover - 1])
        : blank(pick(FUNCTIONS), k, actor);
      action.kind = Math.floor(random() * 3);
      action.passed = random() < 0.5;
      const order = m.orders[k];
      const reportModel = m.reports[k];
      if (action.fn === "recordMatchResult") {
        // Mostly the real relayer, matching the latest invoice half of the time and an
        // older or never-submitted one otherwise.
        if (random() < 0.6) action.actor = inst.cast[R.Registrar - 1];
        if (order && order.invoices.length > 0) {
          action.invoice =
            random() < 0.5
              ? order.invoices[order.invoices.length - 1]
              : order.invoices.length > 1
                ? order.invoices[0]
                : fresh();
        }
      }
      if (random() < 0.2) {
        // Reuse a fingerprint that is already on record.
        if (OPERATIONS_FNS.includes(action.fn)) {
          if (action.fn === "registerReport" && m.reportCommitments.size > 0) {
            action.c = pick([...m.reportCommitments]);
          } else if (action.fn === "registerEvidence" && reportModel?.evidence.length) {
            action.c = pick(reportModel.evidence);
          } else if (
            action.fn === "recordInterimProtection" &&
            reportModel?.protections.length
          ) {
            action.c = pick(reportModel.protections);
          }
        } else if (m.financeCommitments.length > 0) {
          action.c = pick(m.financeCommitments);
        }
      }
      return action;
    };

    const bump = (name: string) =>
      report.outcomes.set(name, (report.outcomes.get(name) ?? 0) + 1);
    let roleChanges = 0;
    let releasesChecked = 0;

    // ---- the run
    for (let step = 0; step < STEPS; step++) {
      const inst = pick(institutions);
      const m = inst.model;

      // Now and then the owner re-assigns a floating account, so accounts that already
      // acted come back under a different role.
      if (random() < 0.03) {
        const floater = pick(floaters);
        if ((m.roles.get(floater) ?? R.None) !== R.None) {
          const revoked = await (await factory.revokeRole(inst.id, floater)).wait();
          noteGas("revokeRole", revoked!.gasUsed);
          m.roles.delete(floater);
        }
        if (random() < 0.85) {
          const role = 1 + Math.floor(random() * 7);
          const granted = await (await factory.grantRole(inst.id, floater, role)).wait();
          noteGas("grantRole", granted!.gasUsed);
          m.roles.set(floater, role);
        }
        roleChanges += 1;
      }

      const open = Array.from({ length: CASES }, (_, k) => k).filter(
        (k) => !complete(m, k),
      );
      const k =
        open.length > 0 && random() < 0.8 ? pick(open) : Math.floor(random() * CASES);
      const action = (random() < 0.62 ? progress(m, k) : null) ?? chaos(inst, k);

      const expected = predict(m, action);
      const contract = OPERATIONS_FNS.includes(action.fn)
        ? inst.operations
        : inst.finance;
      const method = contract.connect(signerOf.get(action.actor)!).getFunction(action.fn);
      const where = `step ${step}: ${action.fn} on case ${action.k} of ${inst.id.slice(0, 10)}`;

      if (expected === null) {
        if (action.fn === "authoriseRelease") {
          // No release without eligibility, by the independent predicate.
          expect(eligibleForRelease(m, action.k, action.actor), where).to.equal(true);
          releasesChecked += 1;
        }
        let receipt;
        try {
          receipt = await (await method(...argsOf(action))).wait();
        } catch (error) {
          throw new Error(
            `${where}: the model expected success but the contract refused with ` +
              `${revertName(contract.interface, error) ?? String(error)}`,
          );
        }
        noteGas(action.fn, receipt.gasUsed);
        apply(m, action);
        bump("success");
      } else {
        if (action.fn === "authoriseRelease") {
          // Refused although eligible only when the release fingerprint was already used.
          expect(
            eligibleForRelease(m, action.k, action.actor),
            `${where} refused with ${expected}`,
          ).to.equal(expected === "DuplicateCommitment");
        }
        let actual: string | null = "success";
        try {
          await method.staticCall(...argsOf(action));
        } catch (error) {
          actual = revertName(contract.interface, error);
        }
        expect(actual, where).to.equal(expected);
        bump(expected);
      }
    }

    // ---- 1. the chain agrees with the model, institution by institution (isolation)
    let verifiedOnChain = 0;
    let releasedOnChain = 0;
    const statusSpread = new Set<string>();
    for (const inst of institutions) {
      const operations = inst.operations as unknown as {
        statusOf(id: string): Promise<bigint>;
        evidenceCount(id: string): Promise<bigint>;
        claimCount(id: string): Promise<bigint>;
        protectionCount(id: string): Promise<bigint>;
      };
      const finance = inst.finance as unknown as {
        getWorkOrder(id: string): Promise<{
          status: bigint;
          invoiceCount: bigint;
          receiptCount: bigint;
          matchPassed: boolean;
          disputeOpen: boolean;
          supplier: string;
          latestInvoice: string;
        }>;
      };
      let verifiedHere = 0;
      let releasedHere = 0;
      for (let k = 0; k < CASES; k++) {
        const reportModel = inst.model.reports[k];
        const orderModel = inst.model.orders[k];
        const where = `case ${k} of ${inst.id.slice(0, 10)}`;

        const status = await operations.statusOf(REPORT_IDS[k]);
        expect(status, where).to.equal(BigInt(reportModel?.status ?? S.None));
        expect(await operations.evidenceCount(REPORT_IDS[k]), where).to.equal(
          BigInt(reportModel?.evidence.length ?? 0),
        );
        expect(await operations.protectionCount(REPORT_IDS[k]), where).to.equal(
          BigInt(reportModel?.protections.length ?? 0),
        );
        if (status === BigInt(S.Verified)) verifiedHere += 1;

        const order = await finance.getWorkOrder(ORDER_IDS[k]);
        expect(order.status, where).to.equal(BigInt(orderModel?.status ?? O.None));
        expect(order.invoiceCount, where).to.equal(
          BigInt(orderModel?.invoices.length ?? 0),
        );
        expect(order.receiptCount, where).to.equal(BigInt(orderModel?.receiptCount ?? 0));
        expect(order.matchPassed, where).to.equal(orderModel?.matchPassed ?? false);
        expect(order.disputeOpen, where).to.equal(orderModel?.disputeOpen ?? false);
        expect(order.supplier, where).to.equal(
          orderModel?.supplier || ethers.ZeroAddress,
        );
        expect(order.latestInvoice, where).to.equal(
          orderModel?.invoices[orderModel.invoices.length - 1] ?? ethers.ZeroHash,
        );
        if (order.status === BigInt(O.Released)) releasedHere += 1;
        if (k === 0) {
          statusSpread.add(
            `${status}/${order.status}/${order.invoiceCount}/${order.receiptCount}`,
          );
        }
      }
      expect(verifiedHere, inst.id).to.equal(inst.model.verified);
      expect(releasedHere, inst.id).to.equal(inst.model.released);
      verifiedOnChain += verifiedHere;
      releasedOnChain += releasedHere;
    }
    // The same ids ended in different states in different institutions: no shared state.
    expect(statusSpread.size).to.be.greaterThan(3);

    // ---- 2. audit from events alone
    const parse = async (contract: BaseContract) => {
      const logs: Log[] = await ethers.provider.getLogs({
        address: await contract.getAddress(),
        fromBlock: 0,
        toBlock: "latest",
      });
      const iface: Interface = contract.interface;
      return logs
        .map((log) => ({ parsed: iface.parseLog(log)!, block: log.blockNumber }))
        .sort((x, y) => x.block - y.block);
    };
    let verifiedEvents = 0;
    let releaseEvents = 0;
    for (const inst of institutions) {
      const operationsEvents = await parse(inst.operations);
      const financeEvents = await parse(inst.finance);

      // Every report event of this contract belongs to this institution and to one of
      // its own cases.
      for (const { parsed } of operationsEvents) {
        expect(REPORT_IDS).to.include(parsed.args.reportId);
        if (parsed.name === "ReportRegistered" || parsed.name === "ReportAcknowledged") {
          expect(parsed.args.schoolId).to.equal(inst.id);
        }
      }
      const verifiedHere = operationsEvents.filter(
        (e) => e.parsed.name === "RepairVerified",
      );
      // One RepairVerified event per verified report, never two for the same report.
      expect(verifiedHere.length).to.equal(inst.model.verified);
      expect(new Set(verifiedHere.map((e) => e.parsed.args.reportId)).size).to.equal(
        verifiedHere.length,
      );
      verifiedEvents += verifiedHere.length;

      const releases = financeEvents.filter((e) => e.parsed.name === "ReleaseAuthorised");
      expect(releases.length).to.equal(inst.model.released);
      releaseEvents += releases.length;

      for (const release of releases) {
        const orderId = release.parsed.args.workOrderId as string;
        const reportId = release.parsed.args.reportId as string;
        const authoriser = release.parsed.args.actor as string;
        const k = ORDER_IDS.indexOf(orderId);
        expect(reportId).to.equal(REPORT_IDS[k]);

        const trail = financeEvents.filter(
          (e) => e.parsed.args.workOrderId === orderId && e.block < release.block,
        );
        const names = trail.map((e) => e.parsed.name);
        // Exactly one release for the order, and nothing recorded after it.
        expect(
          financeEvents.filter(
            (e) => e.parsed.args.workOrderId === orderId && e.block >= release.block,
          ),
        ).to.have.lengthOf(1);
        expect(names[0]).to.equal("WorkOrderApproved");
        expect(names.filter((n) => n === "WorkOrderAcknowledged")).to.have.lengthOf(1);
        expect(names).to.include("GoodsReceiptRecorded");

        // The last of invoice / receipt / match is a passing match of the latest invoice.
        const matching = trail.filter((e) =>
          ["InvoiceSubmitted", "GoodsReceiptRecorded", "MatchRecorded"].includes(
            e.parsed.name,
          ),
        );
        const last = matching[matching.length - 1].parsed;
        const invoices = trail.filter((e) => e.parsed.name === "InvoiceSubmitted");
        expect(last.name).to.equal("MatchRecorded");
        expect(last.args.passed).to.equal(true);
        expect(last.args.invoiceCommitment).to.equal(
          invoices[invoices.length - 1].parsed.args.commitment,
        );

        // Every dispute that was opened was closed.
        expect(names.filter((n) => n === "PaymentDisputeOpened").length).to.equal(
          names.filter((n) => n === "PaymentDisputeClosed").length,
        );

        // The repair was verified before the release, and that was the last review.
        const reviews = operationsEvents.filter(
          (e) =>
            e.parsed.args.reportId === reportId &&
            e.block < release.block &&
            ["RepairClaimed", "RepairVerified", "RepairDisputed"].includes(e.parsed.name),
        );
        expect(reviews[reviews.length - 1].parsed.name).to.equal("RepairVerified");

        // The authoriser played no other part: not in the money trail, not in the repair.
        const financeActors = trail.map((e) => e.parsed.args.actor as string);
        const repairActors = operationsEvents
          .filter((e) => e.parsed.args.reportId === reportId)
          .flatMap((e) => [e.parsed.args.schoolAdmin, e.parsed.args.reviewer])
          .filter((account): account is string => typeof account === "string");
        expect(financeActors).to.not.include(authoriser);
        expect(repairActors).to.not.include(authoriser);
      }
    }

    // ---- 3. totals
    expect(verifiedEvents).to.equal(verifiedOnChain);
    expect(releaseEvents).to.equal(releasedOnChain);
    expect(releaseEvents).to.equal(releasesChecked);
    // The run must actually exercise the system, not idle.
    expect(releasedOnChain).to.be.greaterThan(100);
    // ...and must stop before every case is finished, so end states differ.
    expect(releasedOnChain).to.be.lessThan(INSTITUTIONS * CASES);
    expect(verifiedOnChain).to.be.greaterThanOrEqual(releasedOnChain);
    for (const refusal of [
      "WorkOrderNotFound",
      "SeparationOfDuties",
      "Unauthorized",
      "InvalidOrderState",
      "NoInvoice",
      "NoGoodsReceipt",
      "MatchNotPassing",
      "DisputeOpen",
      "RepairNotVerified",
      "SchoolAdminCannotVerify",
      "StaleInvoice",
      "DuplicateCommitment",
    ]) {
      expect(report.outcomes.get(refusal) ?? 0, refusal).to.be.greaterThan(0);
    }

    const refusals = [...report.outcomes.entries()]
      .filter(([name]) => name !== "success")
      .reduce((sum, [, count]) => sum + count, 0);
    report.summary.push(
      `${fmt(STEPS)} random steps: ${fmt(report.outcomes.get("success") ?? 0)} transactions ` +
        `the model said must succeed (all did) and ${fmt(refusals)} attempts it said must be ` +
        "refused (all were, with the predicted error).",
      `${fmt(roleChanges)} role re-assignments of two floating accounts.`,
      `${fmt(verifiedOnChain)} of ${INSTITUTIONS * CASES} reports ended Verified = ` +
        `${fmt(verifiedEvents)} RepairVerified events.`,
      `${fmt(releasedOnChain)} releases authorised = ${fmt(releaseEvents)} ReleaseAuthorised ` +
        "events, each one eligible by the model and by an audit of the events alone.",
      "Every institution uses the same report and work order ids; each ended in the state " +
        "its own model predicted.",
    );
  });

  after(() => {
    if (report.fullCase.length > 0 && report.summary.length > 0) writeGasReport();
  });
});
