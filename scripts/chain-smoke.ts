/**
 * Bona Chain smoke test: one whole case on Avalanche Fuji, through the same
 * adapter the app uses (`src/blockchain/chain-ledger.ts`).
 *
 * It registers a throw-away report on one institution and takes it through the
 * procurement trail, checking on the way that the contracts refuse what they
 * must refuse:
 *
 *   report registered -> report acknowledged -> work order approved (buyer)
 *   -> order acknowledged (supplier) -> [supplier records a goods receipt: REFUSED]
 *   -> invoice submitted -> goods receipt recorded (receiver) -> passing match
 *   -> [release: REFUSED, RepairNotVerified] -> [buyer authorises: REFUSED]
 *   -> repair claimed (school) -> repair verified (reviewer)
 *   -> release authorised (payment approver) -> [second release: REFUSED]
 *
 * It sends about ten real testnet transactions, so every role's key needs a
 * little test AVAX and its role on the factory for the institution. Run it
 * after `contracts` `chain:deploy`, `chain:setup` and `chain:fund`.
 *
 * Run from the repository root (tsx reads the `@/` path alias from tsconfig.json):
 *
 *   verifier/node_modules/.bin/tsx --env-file=.env.local scripts/chain-smoke.ts
 *
 * Environment (the app's own names, nothing else is read):
 *   LEDGER_RPC_URL, LEDGER_CHAIN_ID (eip155:43113), LEDGER_FACTORY_ADDRESS,
 *   LEDGER_REGISTRAR_PRIVATE_KEY, LEDGER_SCHOOL_ADMIN_PRIVATE_KEY,
 *   LEDGER_REVIEWER_PRIVATE_KEY, LEDGER_BUYER_PRIVATE_KEY,
 *   LEDGER_SUPPLIER_PRIVATE_KEY, LEDGER_RECEIVER_PRIVATE_KEY,
 *   LEDGER_PAYMENT_APPROVER_PRIVATE_KEY
 *   SMOKE_INSTITUTION_ID (optional; default the institution ending ...0005)
 *
 * Keys are read from the environment only and are never printed: the output
 * holds transaction hashes, contract error names and a PASS/FAIL table.
 * Fuji is a test network. No money moves: a release is an instruction.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createChainLedger, type ChainLedgerConfig } from "@/blockchain/chain-ledger";
import { ledgerContracts } from "@/blockchain";
import { LEDGER_KEY_ENV, loadEnv } from "@/server/env";
import {
  AVALANCHE_CHAINS,
  LedgerError,
  type BlockchainReceipt,
  type ChainRole,
  type Hex32,
  type LedgerPort,
} from "@/shared";

const DEFAULT_INSTITUTION_ID = "00000000-0000-4000-8000-010000000005";

interface Row {
  step: string;
  expected: string;
  got: string;
  detail: string;
  pass: boolean;
}

const rows: Row[] = [];
let secrets: string[] = [];

/** Text that is safe to print: no key, and no RPC address (it may carry an API key). */
function safe(text: string): string {
  let out = text.split("\n")[0] ?? "";
  for (const secret of secrets) {
    out = out.split(secret).join("[key]");
    out = out.split(secret.replace(/^0x/, "")).join("[key]");
  }
  return out.replace(/https?:\/\/\S+/gi, "[rpc]");
}

const fingerprint = (): Hex32 => `0x${randomBytes(32).toString("hex")}`;

function record(row: Row): boolean {
  rows.push(row);
  console.log(
    `${row.pass ? "PASS" : "FAIL"}  ${row.step}\n      expected ${row.expected}; got ${row.got}${row.detail ? `\n      ${row.detail}` : ""}`,
  );
  return row.pass;
}

function describeError(error: unknown): { got: string; name: string | null } {
  if (error instanceof LedgerError) {
    return error.contractError
      ? { got: `refused: ${error.contractError}`, name: error.contractError }
      : { got: `${error.code}: ${safe(error.message)}`, name: null };
  }
  return {
    got: safe(error instanceof Error ? error.message : String(error)),
    name: null,
  };
}

async function main(): Promise<number> {
  const env = loadEnv();
  secrets = Object.values(LEDGER_KEY_ENV)
    .map((name) => env[name])
    .filter((value): value is string => Boolean(value));

  const missing = [
    env.LEDGER_RPC_URL ? null : "LEDGER_RPC_URL",
    env.LEDGER_FACTORY_ADDRESS ? null : "LEDGER_FACTORY_ADDRESS",
    ...Object.values(LEDGER_KEY_ENV).map((name) => (env[name] ? null : name)),
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error(`Not run. Missing in the environment: ${missing.join(", ")}`);
    return 2;
  }
  if (env.LEDGER_CHAIN_ID !== AVALANCHE_CHAINS.fuji) {
    console.error(
      `Not run. LEDGER_CHAIN_ID is ${env.LEDGER_CHAIN_ID}; this test runs on Fuji (${AVALANCHE_CHAINS.fuji}) only.`,
    );
    return 2;
  }
  if (ledgerContracts(env) !== "bona_chain" || env.LEDGER_FINANCE_MODE === "off") {
    console.error(
      "Not run. The environment does not select the Bona Chain adapter with finance on (check LEDGER_FINANCE_MODE).",
    );
    return 2;
  }

  const signers: Record<ChainRole, string> = {
    registrar: env.LEDGER_REGISTRAR_PRIVATE_KEY!,
    school_admin: env.LEDGER_SCHOOL_ADMIN_PRIVATE_KEY!,
    reviewer: env.LEDGER_REVIEWER_PRIVATE_KEY!,
    buyer: env.LEDGER_BUYER_PRIVATE_KEY!,
    supplier: env.LEDGER_SUPPLIER_PRIVATE_KEY!,
    receiver: env.LEDGER_RECEIVER_PRIVATE_KEY!,
    payment_approver: env.LEDGER_PAYMENT_APPROVER_PRIVATE_KEY!,
  };
  const config: ChainLedgerConfig = {
    rpcUrl: env.LEDGER_RPC_URL!,
    chainId: env.LEDGER_CHAIN_ID,
    factoryAddress: env.LEDGER_FACTORY_ADDRESS!,
    legacyContractAddress: env.LEDGER_CONTRACT_ADDRESS,
    financeMode: "auto",
    signers,
    // Each step builds on the one before it, so wait for it to be mined.
    confirmTimeoutMs: 90_000,
  };
  /** The adapter exactly as the app builds it. */
  const ledger = createChainLedger(config);
  /*
   * The port fixes which key signs each operation, so the app itself cannot
   * make the wrong role act. To show that the CONTRACT refuses too, these two
   * adapters have two keys swapped: with the first, the goods receipt is
   * signed by the supplier's key; with the second, the release by the buyer's.
   */
  const supplierAsReceiver = createChainLedger({
    ...config,
    signers: { ...signers, receiver: signers.supplier, supplier: signers.receiver },
  });
  const buyerAsApprover = createChainLedger({
    ...config,
    signers: {
      ...signers,
      payment_approver: signers.buyer,
      buyer: signers.payment_approver,
    },
  });

  const institutionId = smokeInstitution();
  const reportId = randomUUID();
  const workOrderId = randomUUID();
  const ref = { institutionId, workOrderId };
  const info = ledger.info();

  console.log("Bona Chain smoke test");
  console.log(`  network      ${info.networkName} (${info.chainId}), a test network`);
  console.log(`  factory      ${info.contractAddress}`);
  console.log(`  institution  ${institutionId}`);
  console.log(`  report       ${reportId} (throw-away)`);
  console.log(`  work order   ${workOrderId} (throw-away)`);
  console.log("");

  /** A write that must be accepted and mined. */
  async function accepted(
    step: string,
    run: () => Promise<BlockchainReceipt>,
  ): Promise<boolean> {
    try {
      const receipt = await run();
      return record({
        step,
        expected: "confirmed",
        got: receipt.status,
        detail: `tx ${receipt.txId}  ${info.explorerTxUrl(receipt.txId) ?? ""}  contract ${receipt.contractAddress}`,
        pass: receipt.status === "confirmed",
      });
    } catch (error) {
      return record({
        step,
        expected: "confirmed",
        got: describeError(error).got,
        detail: "",
        pass: false,
      });
    }
  }

  /** A write the contract must refuse, with one of the named errors. Nothing is sent. */
  async function refused(
    step: string,
    errors: string[],
    run: () => Promise<BlockchainReceipt>,
  ): Promise<boolean> {
    const expected = `refused: ${errors.join(" or ")}`;
    try {
      const receipt = await run();
      return record({
        step,
        expected,
        got: `ACCEPTED (${receipt.status})`,
        detail: `tx ${receipt.txId}  The contract took a write it should have refused.`,
        pass: false,
      });
    } catch (error) {
      const { got, name } = describeError(error);
      return record({
        step,
        expected,
        got,
        detail: "no transaction was sent: the refusal came from simulating the call",
        pass: name !== null && errors.includes(name),
      });
    }
  }

  /** Each step needs the one before it. Stop at the first that does not hold. */
  const steps: (() => Promise<boolean>)[] = [
    () =>
      accepted("1. register the report (registrar)", () =>
        ledger.registerReport({ reportId, institutionId, commitment: fingerprint() }),
      ),
    () =>
      accepted("2. acknowledge the report (school admin)", () =>
        ledger.acknowledgeReport({ reportId, institutionId }),
      ),
    () =>
      accepted("3. approve the work order (buyer)", () =>
        ledger.approveWorkOrder({ ...ref, reportId, commitment: fingerprint() }),
      ),
    () =>
      accepted("4. acknowledge the work order (supplier)", () =>
        ledger.acknowledgeWorkOrder(ref),
      ),
    () =>
      refused(
        "5. REFUSAL: the supplier records a goods receipt",
        // The supplier already acted on this order as supplier.
        ["SeparationOfDuties", "Unauthorized"],
        () =>
          supplierAsReceiver.recordGoodsReceipt({ ...ref, commitment: fingerprint() }),
      ),
  ];

  const invoice = fingerprint();
  steps.push(
    () =>
      accepted("6. submit the invoice (supplier)", () =>
        ledger.submitInvoice({ ...ref, commitment: invoice }),
      ),
    () =>
      accepted("7. record the goods receipt (receiving officer)", () =>
        ledger.recordGoodsReceipt({ ...ref, commitment: fingerprint() }),
      ),
    () =>
      accepted("8. record a passing three-way match (platform relayer)", () =>
        ledger.recordMatchResult({
          ...ref,
          invoiceCommitment: invoice,
          passed: true,
          commitment: fingerprint(),
        }),
      ),
    async () => {
      const probe = await probeRelease(ledger, ref);
      return record({
        step: "9a. probe the release before the repair is verified",
        expected: "not allowed: RepairNotVerified",
        got: probe,
        detail: "a simulated call, nothing sent",
        pass: probe === "not allowed: RepairNotVerified",
      });
    },
    () =>
      refused(
        "9b. REFUSAL: release before the repair is verified",
        ["RepairNotVerified"],
        () => ledger.authoriseRelease({ ...ref, commitment: fingerprint() }),
      ),
    () =>
      refused(
        "10. REFUSAL: the buyer authorises the release",
        // The buyer approved this order: it can never authorise its release.
        ["SeparationOfDuties"],
        () => buyerAsApprover.authoriseRelease({ ...ref, commitment: fingerprint() }),
      ),
    () =>
      accepted("11. claim the repair (school admin)", () =>
        ledger.claimRepair({ reportId, institutionId, commitment: fingerprint() }),
      ),
    () =>
      accepted("12. verify the repair (independent reviewer)", () =>
        ledger.verifyRepair({ reportId, institutionId, reviewCommitment: fingerprint() }),
      ),
    async () => {
      const probe = await probeRelease(ledger, ref);
      return record({
        step: "13. probe the release once the repair is verified",
        expected: "allowed",
        got: probe,
        detail: "a simulated call, nothing sent",
        pass: probe === "allowed",
      });
    },
    () =>
      accepted("14. authorise the release (payment approver)", () =>
        ledger.authoriseRelease({ ...ref, commitment: fingerprint() }),
      ),
    () =>
      refused(
        "15. REFUSAL: a second release of the same order",
        ["InvalidOrderState"],
        () => ledger.authoriseRelease({ ...ref, commitment: fingerprint() }),
      ),
    async () => {
      // Finance steps never change the report status.
      let status: string;
      try {
        status = await ledger.statusOf(reportId, institutionId);
      } catch (error) {
        status = describeError(error).got;
      }
      return record({
        step: "16. the report is verified on chain",
        expected: "verified",
        got: status,
        detail: "",
        pass: status === "verified",
      });
    },
  );

  let stoppedAt: string | null = null;
  for (const step of steps) {
    const before = rows.length;
    const held = await step();
    // A refusal that did not hold does not block the rest; a missing write does.
    const row = rows[before];
    if (!held && row && !row.step.includes("REFUSAL") && !row.step.includes("probe")) {
      stoppedAt = row.step;
      break;
    }
  }

  console.log("");
  console.log("RESULT   STEP");
  for (const row of rows) console.log(`${row.pass ? "PASS  " : "FAIL  "}   ${row.step}`);
  const failed = rows.filter((row) => !row.pass).length;
  const notRun = steps.length - rows.length;
  console.log("");
  if (stoppedAt) {
    console.log(
      `Stopped after "${stoppedAt}": the later steps need it. ${notRun} step(s) not run.`,
    );
  }
  console.log(
    failed === 0 && notRun === 0
      ? `ALL ${rows.length} CHECKS PASSED on ${info.networkName}.`
      : `${failed} FAILED, ${rows.length - failed} passed, ${notRun} not run.`,
  );
  return failed === 0 && notRun === 0 ? 0 : 1;
}

function smokeInstitution(): string {
  return (process.env.SMOKE_INSTITUTION_ID ?? "").trim() || DEFAULT_INSTITUTION_ID;
}

async function probeRelease(
  ledger: LedgerPort,
  ref: { institutionId: string; workOrderId: string },
): Promise<string> {
  try {
    const probe = await ledger.probeRelease(ref);
    return probe.allowed ? "allowed" : `not allowed: ${probe.revert ?? "?"}`;
  } catch (error) {
    return describeError(error).got;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(
      `Smoke test stopped: ${safe(error instanceof Error ? error.message : String(error))}`,
    );
    process.exit(2);
  },
);
