#!/usr/bin/env tsx
/**
 * BonaBlock Verify — command line.
 *
 *   pnpm --filter bona-verify verify -- --receipt receipt.json --file evidence.pdf
 *   pnpm --filter bona-verify verify -- --receipt receipt.json --document report-document.json
 *   pnpm --filter bona-verify verify -- --receipt receipt.json --digest 0x... [--report-id <uuid>]
 *   pnpm --filter bona-verify verify -- --receipt ack-receipt.json --report-id <uuid>
 *
 * Options: --rpc <url> --chain-id <n> --contract <0x...> --json
 * Environment: VERIFY_RPC_URL, VERIFY_CHAIN_ID, VERIFY_CONTRACT_ADDRESS,
 * VERIFY_FACTORY_ADDRESS (or --factory: accept contracts this BonaChainFactory created).
 *
 * Exit codes: 0 VERIFIED · 1 MISMATCH · 2 NOT_FOUND · 3 REJECTED · 4 CANNOT_VERIFY ·
 * 5 RECORDED (on the ledger, content not compared: nothing was supplied) · 64 usage.
 */
import { readFile } from "node:fs/promises";
import { loadVerifierConfig } from "./lib/config";
import { parseJsonText, verifyWithConfig } from "./lib/service";
import {
  OVERALL_LABEL,
  type Overall,
  type Source,
  type VerifyResult,
} from "./lib/verify";

const EXIT: Record<Overall, number> = {
  VERIFIED: 0,
  RECORDED: 5,
  MISMATCH: 1,
  NOT_FOUND: 2,
  REJECTED: 3,
  CANNOT_VERIFY: 4,
};

function usage(): never {
  console.error(
    [
      "Usage: tsx src/cli.ts --receipt <receipt.json> [--file <path> | --document <doc.json> | --digest <0x...>]",
      "       [--report-id <uuid>] [--rpc <url>] [--chain-id <n>] [--contract <0x...>] [--json]",
      "",
      "  --file      the evidence file (EvidenceRegistered receipts)",
      "  --document  the salted commitment document (ReportRegistered, InterimProtectionRecorded,",
      "              RepairClaimed, RepairVerified, RepairDisputed receipts)",
      "  (neither)   ReportAcknowledged receipts: give --report-id",
      "",
      "Reads Avalanche through VERIFY_RPC_URL (default: public Fuji RPC). Never calls BonaWork.",
    ].join("\n"),
  );
  process.exit(64);
}

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) usage();
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || typeof args.receipt !== "string") usage();

  const receiptText = await readFile(args.receipt, "utf8");
  const receipt = parseJsonText(receiptText);
  if (!receipt.ok) {
    console.error(`Receipt is not JSON: ${receipt.error}`);
    return 64;
  }

  let source: Source = { kind: "none" };
  if (typeof args.file === "string") {
    source = { kind: "bytes", bytes: new Uint8Array(await readFile(args.file)) };
  } else if (typeof args.document === "string") {
    const document = parseJsonText(await readFile(args.document, "utf8"));
    if (!document.ok) {
      console.error(`Document file is not JSON: ${document.error}`);
      return 64;
    }
    source = { kind: "document", document: document.value };
  } else if (typeof args.digest === "string") {
    source = { kind: "digest", digest: args.digest };
  }

  const env: Record<string, string | undefined> = { ...process.env };
  if (typeof args.rpc === "string") env.VERIFY_RPC_URL = args.rpc;
  if (typeof args["chain-id"] === "string") env.VERIFY_CHAIN_ID = args["chain-id"];
  if (typeof args.contract === "string") env.VERIFY_CONTRACT_ADDRESS = args.contract;
  if (typeof args.factory === "string") env.VERIFY_FACTORY_ADDRESS = args.factory;
  const config = loadVerifierConfig(env);

  const result = await verifyWithConfig(
    {
      receipt: receipt.value,
      source,
      reportId: typeof args["report-id"] === "string" ? args["report-id"] : undefined,
    },
    config,
  );

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result, config.rpcUrl);
  }
  return EXIT[result.overall];
}

function printHuman(result: VerifyResult, rpcUrl: string): void {
  const mark = { pass: "✓", fail: "✗", skip: "–" } as const;
  console.log(`BonaWork Verify — RPC ${rpcUrl} (chain ${result.verifier.chainId})`);
  console.log(
    `Expected contract: ${result.verifier.expectedContractAddress ?? "(not pinned; using the receipt's)"}`,
  );
  if (result.verifier.expectedFactoryAddress) {
    console.log(`BonaWork factory: ${result.verifier.expectedFactoryAddress}`);
  }
  console.log("");
  for (const step of result.steps) {
    console.log(`${mark[step.status]} ${step.title}`);
    console.log(`    ${step.detail}`);
  }
  console.log("");
  const f = result.facts;
  if (f.recomputedDigest) console.log(`Recomputed value  : ${f.recomputedDigest}`);
  if (f.onChainValue) console.log(`On-chain value    : ${f.onChainValue}`);
  if (f.txHash) console.log(`Transaction       : ${f.txHash}`);
  if (f.blockNumber !== undefined) console.log(`Block             : ${f.blockNumber}`);
  if (f.eventTimestamp) console.log(`Anchored at       : ${f.eventTimestamp}`);
  if (f.eventName) console.log(`Event             : ${f.eventName}`);
  if (f.reportIdOnChain) console.log(`Report id (chain) : ${f.reportIdOnChain}`);
  if (f.explorerUrl) console.log(`Explorer          : ${f.explorerUrl}`);
  console.log("");
  console.log(`RESULT: ${result.overall} — ${OVERALL_LABEL[result.overall]}`);
  console.log(result.summary);
  console.log(
    "This tool talks only to the Avalanche network. BonaWork's servers are not involved.",
  );
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(64);
  },
);
