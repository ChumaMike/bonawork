/**
 * One full BonaWork escrow journey on Solana devnet, through the same server
 * adapter the app uses (src/server/solana). Sandbox demo rand only.
 *
 *   sandbox cash-in R5 000 to a demo funder
 *   -> create escrow (R3 000 materials + R2 000 completion, 60 s challenge window)
 *   -> demo funder moves R5 000 into the vault (Pollar will replace this signer)
 *   -> activate funding -> claim materials (demo contractor + match key)
 *   -> prepare verify, Bona Guardian check, demo reviewer signs, feepayer pays
 *   -> release straight away: REFUSED, ChallengeWindowActive
 *   -> wait for the window -> Escrow Watchdog (keeper) releases materials
 *
 * Demo keys (funder, contractor, reviewer) are keypair files in
 * BONAWORK_KEYS_DIR; missing funder/contractor files are created. Run
 * bootstrap-devnet.ts first. Prints public keys and signatures only.
 *
 *   BONAWORK_KEYS_DIR=~/.bonawork/keys verifier/node_modules/.bin/tsx scripts/solana/demo-journey.ts
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
  type Address,
} from "@solana/kit";

import {
  BonaProgramFailure,
  KEY_FILES,
  PLATFORM_KEY_ROLES,
  createEscrowService,
  devnetConfig,
  explorerAddress,
  generateKeypairBytes,
  getSolanaRpc,
  loadSigners,
  runEscrowWatchdog,
  signerFromBytes,
  writeNewKeypairFile,
} from "@/server/solana";
import { formatRand } from "@/solana";

const log = (line = "") => console.log(line);
const sha = (text: string) => Uint8Array.from(createHash("sha256").update(text).digest());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));

async function main() {
  const dir = process.env.BONAWORK_KEYS_DIR;
  if (!dir) throw new Error("Set BONAWORK_KEYS_DIR.");
  for (const role of ["demoFunder", "demoContractor"] as const) {
    const path = join(dir, KEY_FILES[role]);
    if (!existsSync(path)) writeNewKeypairFile(path, generateKeypairBytes());
  }
  const signers = await loadSigners([
    ...PLATFORM_KEY_ROLES,
    "demoContractor",
    "demoFunder",
    "demoReviewer",
  ]);
  const funder = signers.demoFunder!;
  const contractor = signers.demoContractor!;
  const reviewer = signers.demoReviewer!;
  const school = (await signerFromBytes(generateKeypairBytes())).address;

  const network = devnetConfig();
  const service = createEscrowService({ rpc: getSolanaRpc(), network, signers });
  const steps: [string, string][] = [];
  const step = (label: string, s: { signature: string; explorerUrl: string }) => {
    steps.push([label, s.signature]);
    log(`${label.padEnd(22)} ${s.explorerUrl}`);
  };

  log("BonaWork demo journey (Solana devnet, sandbox demo rand)");
  log(`funder (demo)     ${funder.address}`);
  log(`contractor (demo) ${contractor.address}`);
  log(`reviewer (demo)   ${reviewer.address}`);
  log(`school            ${school}`);
  log();

  // 1. Sandbox cash-in.
  const cashIn = await service.sandboxCashIn(funder.address, 500_000);
  step("cash-in R5 000", cashIn);

  // 2. Escrow.
  const start = nowSeconds();
  const caseHash = sha(`bonawork:demo-journey:${start}`);
  const created = await service.createEscrow({
    caseHash,
    termsHash: sha("terms: replace 6 classroom windows, two stages"),
    funder: funder.address,
    contractor: contractor.address,
    school,
    reviewer: reviewer.address,
    amounts: [BigInt(300_000), BigInt(200_000)],
    milestoneHashes: [
      sha("milestone: materials on site"),
      sha("milestone: windows fitted"),
    ],
    fundingDeadline: start + BigInt(900),
    verificationDeadlines: [start + BigInt(3_600), start + BigInt(7_200)],
    challengeSeconds: 60,
    disputeSeconds: 3_600,
  });
  if (created.alreadyExisted || !created.signature)
    throw new Error("escrow already existed");
  step("create escrow", {
    signature: created.signature,
    explorerUrl: created.explorerUrl,
  });
  const escrow: Address = created.addresses.escrow;
  log(`escrow            ${explorerAddress(escrow)}`);

  // 3. Funding.
  step("fund vault (demo)", await service.fundEscrowAsDemoFunder(escrow, funder));
  step("activate funding", await service.activateFunding(escrow));

  // 4. Claim materials.
  const evidenceHash = sha(`evidence:${start}:photos+invoice`);
  const matchHash = sha(`match:${start}:order=invoice=receipt`);
  step(
    "claim materials",
    await service.claimTranche({ escrow, index: 0, evidenceHash, matchHash, contractor }),
  );

  // 5. Verify: prepare, Guardian, reviewer signs (stands in for the browser wallet), submit.
  const reviewHash = sha(`review:${start}:site visit ok`);
  const prepared = await service.prepareVerifyTransaction({
    escrow,
    index: 0,
    reviewer: reviewer.address,
    reviewHash,
  });
  log(`Guardian (verify) ${prepared.guardian.ok ? "PASS" : "FAIL"}`);
  for (const line of prepared.description) log(`  - ${line}`);
  const unsigned = getTransactionDecoder().decode(
    getBase64Encoder().encode(prepared.transaction),
  );
  const reviewerSigned = await partiallySignTransaction([reviewer.keyPair], unsigned);
  step(
    "verify (reviewer)",
    await service.submitSignedVerify({
      transaction: getBase64EncodedWireTransaction(reviewerSigned),
      escrow,
      index: 0,
      reviewer: reviewer.address,
      reviewHash,
    }),
  );

  // 6. Early release must be refused.
  let earlyRefused = false;
  try {
    await service.releaseTranche(escrow, 0);
    log("! early release was NOT refused");
  } catch (error) {
    if (
      error instanceof BonaProgramFailure &&
      error.errorName === "ChallengeWindowActive"
    ) {
      earlyRefused = true;
      log(`early release      REFUSED (${error.errorName}): ${error.message}`);
    } else {
      throw error;
    }
  }

  // 7. Wait out the challenge window, then let the keeper act.
  const before = await service.getCaseOnChain(escrow);
  const until = before.tranches[0].account.challengeUntil;
  const waitMs = Math.max(0, Number(until - nowSeconds()) + 8) * 1000;
  log(`waiting ${Math.round(waitMs / 1000)}s for the challenge window...`);
  await sleep(waitMs);
  const outcomes = await runEscrowWatchdog(service, [escrow]);
  for (const o of outcomes) {
    log(
      `keeper tranche ${o.index}   ${o.decision.action} -> ${o.status}` +
        (o.step ? ` ${o.step.explorerUrl}` : "") +
        (o.error ? ` (${o.error})` : "") +
        ` [${o.decision.reason}]`,
    );
    if (o.step) steps.push([`keeper release t${o.index}`, o.step.signature]);
  }

  // 8. Balances.
  const after = await service.getCaseOnChain(escrow);
  log();
  log(
    `tranche states    ${after.tranches.map((t) => `${t.index}:${t.state}`).join("  ")}`,
  );
  log(`vault             ${after.vault.label}`);
  log(`contractor        ${formatRand(await service.walletBalance(contractor.address))}`);
  log(`funder            ${formatRand(await service.walletBalance(funder.address))}`);
  log(`early refused     ${earlyRefused}`);
  log();
  for (const [label, sig] of steps) log(`${label.padEnd(22)} ${sig}`);
}

main().catch((error) => {
  console.error(
    `Demo journey failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  if (error && typeof error === "object" && "logs" in error) {
    for (const line of (error as { logs: string[] }).logs.slice(-8))
      console.error(`  ${line}`);
  }
  process.exit(1);
});
