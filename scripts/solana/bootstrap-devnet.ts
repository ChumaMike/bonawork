/**
 * BonaWork devnet bootstrap. Idempotent: every step checks the chain first and
 * is skipped when already done, so it is safe to run again.
 *
 *   1. Tops up admin, feepayer and keeper with SOL from the deployer
 *      (the deployer keeps at least 0.3 SOL).
 *   2. Creates the BDZAR sandbox mint (classic SPL, 2 decimals, mint authority =
 *      the sandbox treasury key, no freeze authority).
 *   3. initialize_config (match key, dispute key, challenge 60 s .. 7 days).
 *   4. Registers one demo reviewer (stand-in for the reviewer's own wallet).
 *   5. Writes the public addresses to config/solana-devnet.json.
 *
 * Keys are read from keypair files in BONAWORK_KEYS_DIR, which must be outside
 * the repository. New keys (treasury, keeper, demo reviewer) are created there.
 * Only public keys and signatures are printed.
 *
 * Run from the repository root (the config path is relative to it):
 *   BONAWORK_KEYS_DIR=~/.bonawork/keys verifier/node_modules/.bin/tsx scripts/solana/bootstrap-devnet.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { getBase64Encoder, type Address, type KeyPairSigner } from "@solana/kit";
import { getInitializeMint2Instruction, getMintSize } from "@solana-program/token";

import {
  KEY_FILES,
  generateKeypairBytes,
  readKeypairFile,
  signerFromBytes,
  writeNewKeypairFile,
} from "@/server/solana/keys";
import {
  buildSignSend,
  getSolanaRpc,
  solanaRpcUrl,
  withRetry,
} from "@/server/solana/rpc";
import {
  formatSol,
  getCreateAccountInstruction,
  getSolTransferInstruction,
} from "@/server/solana/system";
import {
  BONAWORK_PROGRAM_ADDRESS,
  MINT_DECIMALS,
  TOKEN_PROGRAM_ADDRESS,
  decodeConfig,
  decodeReviewerRecord,
  findConfigPda,
  findReviewerPda,
  getInitializeConfigInstruction,
  getSetReviewerInstruction,
} from "@/solana";

const REPO_ROOT = process.cwd();
const CONFIG_PATH = join(REPO_ROOT, "config", "solana-devnet.json");
const EXPLORER = "https://explorer.solana.com";
const tx = (s: string) => `${EXPLORER}/tx/${s}?cluster=devnet`;
const acct = (a: string) => `${EXPLORER}/address/${a}?cluster=devnet`;

const sol = (n: number) => BigInt(Math.round(n * 1e9));
const TOPUPS: { role: "admin" | "feepayer" | "keeper"; target: bigint }[] = [
  { role: "admin", target: sol(0.6) },
  { role: "feepayer", target: sol(0.6) },
  { role: "keeper", target: sol(0.1) },
];
const DEPLOYER_FLOOR = sol(0.3);
const MIN_TOPUP = sol(0.01);
const MIN_CHALLENGE = 60;
const MAX_CHALLENGE = 604_800;

const log = (line = "") => console.log(line);

function keysDir(): string {
  const dir = process.env.BONAWORK_KEYS_DIR;
  if (!dir)
    throw new Error("Set BONAWORK_KEYS_DIR to the folder that holds the keypair files.");
  const abs = resolve(dir);
  const rel = relative(REPO_ROOT, abs);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error("BONAWORK_KEYS_DIR must be outside the repository.");
  }
  return abs;
}

async function loadFile(dir: string, file: string): Promise<KeyPairSigner> {
  return signerFromBytes(readKeypairFile(join(dir, file)));
}

/** Loads a key file, creating a new keypair first if it does not exist. */
async function loadOrCreate(
  dir: string,
  file: string,
): Promise<{ signer: KeyPairSigner; created: boolean }> {
  const path = join(dir, file);
  let created = false;
  if (!existsSync(path)) {
    writeNewKeypairFile(path, generateKeypairBytes());
    created = true;
  }
  return { signer: await loadFile(dir, file), created };
}

async function main() {
  const dir = keysDir();
  const rpc = getSolanaRpc(solanaRpcUrl());
  const done: string[] = [];
  const skipped: string[] = [];

  const admin = await loadFile(dir, KEY_FILES.admin);
  const match = await loadFile(dir, KEY_FILES.match);
  const dispute = await loadFile(dir, KEY_FILES.dispute);
  const feepayer = await loadFile(dir, KEY_FILES.feepayer);
  const deployer = await loadFile(dir, "bonawork-deployer.json");
  const treasury = await loadOrCreate(dir, KEY_FILES.treasury);
  const keeper = await loadOrCreate(dir, KEY_FILES.keeper);
  const reviewer = await loadOrCreate(dir, KEY_FILES.demoReviewer);
  for (const [name, k] of [
    ["treasury", treasury],
    ["keeper", keeper],
    ["demo reviewer", reviewer],
  ] as const) {
    (k.created ? done : skipped).push(
      k.created ? `created ${name} key ${k.signer.address}` : `${name} key exists`,
    );
  }

  const balance = async (a: Address) =>
    (await withRetry(() => rpc.getBalance(a, { commitment: "confirmed" }).send())).value;
  const accountData = async (a: Address): Promise<Uint8Array | null> => {
    const { value } = await withRetry(() =>
      rpc.getAccountInfo(a, { encoding: "base64", commitment: "confirmed" }).send(),
    );
    return value ? Uint8Array.from(getBase64Encoder().encode(value.data[0])) : null;
  };

  // 1. SOL top-ups from the deployer.
  const signers = { admin, feepayer, keeper: keeper.signer };
  let deployerBalance: bigint = await balance(deployer.address);
  const transfers = [];
  for (const { role, target } of TOPUPS) {
    const have = await balance(signers[role].address);
    const need = target - have;
    if (need < MIN_TOPUP) {
      skipped.push(`${role} already holds ${formatSol(have)}`);
      continue;
    }
    const spendable = deployerBalance - DEPLOYER_FLOOR - sol(0.001);
    const amount = need < spendable ? need : spendable;
    if (amount < MIN_TOPUP) {
      log(
        `! deployer cannot top up ${role}: it would drop below ${formatSol(DEPLOYER_FLOOR)}`,
      );
      continue;
    }
    transfers.push(
      getSolTransferInstruction(deployer.address, signers[role].address, amount),
    );
    deployerBalance -= amount;
    done.push(`sent ${formatSol(amount)} to ${role}`);
  }
  let topupSig: string | null = null;
  if (transfers.length) {
    topupSig = await buildSignSend(rpc, deployer, transfers);
    log(`top-up: ${tx(topupSig)}`);
  }

  // 2 + 3. Mint and config. The config fixes the mint forever, so read it first.
  const configPda = await findConfigPda();
  const configData = await accountData(configPda);
  const saved = existsSync(CONFIG_PATH)
    ? (JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { mint?: string })
    : {};
  let mint: Address;
  let mintSig: string | null = null;
  let configSig: string | null = null;

  if (configData) {
    const config = decodeConfig(configData);
    mint = config.mint;
    skipped.push(`config exists (mint ${mint})`);
    if (
      config.matchAuthority !== match.address ||
      config.disputeAuthority !== dispute.address
    ) {
      log("! on-chain config has different match/dispute keys than the key files");
    }
  } else {
    if (saved.mint && (await accountData(saved.mint as Address))) {
      mint = saved.mint as Address;
      skipped.push(`mint exists ${mint}`);
    } else {
      const mintKey = await signerFromBytes(generateKeypairBytes());
      const space = Number(getMintSize());
      const rent = await withRetry(() =>
        rpc.getMinimumBalanceForRentExemption(BigInt(space)).send(),
      );
      mintSig = await buildSignSend(
        rpc,
        feepayer,
        [
          getCreateAccountInstruction({
            payer: feepayer.address,
            newAccount: mintKey.address,
            lamports: rent,
            space,
            owner: TOKEN_PROGRAM_ADDRESS,
          }),
          getInitializeMint2Instruction({
            mint: mintKey.address,
            decimals: MINT_DECIMALS,
            mintAuthority: treasury.signer.address,
            freezeAuthority: null,
          }),
        ],
        [mintKey],
      );
      mint = mintKey.address;
      done.push(`created BDZAR mint ${mint}`);
      log(`mint: ${tx(mintSig)}`);
      // Save straight away so a failure later does not orphan the mint.
      writeConfig({ mint });
    }
    configSig = await buildSignSend(
      rpc,
      feepayer,
      [
        getInitializeConfigInstruction(
          { admin: admin.address, config: configPda, mint },
          {
            matchAuthority: match.address,
            disputeAuthority: dispute.address,
            minChallengeSeconds: MIN_CHALLENGE,
            maxChallengeSeconds: MAX_CHALLENGE,
          },
        ),
      ],
      [admin],
    );
    done.push("initialized config");
    log(`config: ${tx(configSig)}`);
  }

  // 4. Demo reviewer.
  const reviewerRecord = await findReviewerPda(reviewer.signer.address);
  const recordData = await accountData(reviewerRecord);
  let reviewerSig: string | null = null;
  if (recordData && decodeReviewerRecord(recordData).active) {
    skipped.push("demo reviewer already active");
  } else {
    const aliasHash = Uint8Array.from(
      createHash("sha256").update("bonawork:reviewer:demo").digest(),
    );
    reviewerSig = await buildSignSend(
      rpc,
      feepayer,
      [
        getSetReviewerInstruction(
          { admin: admin.address, config: configPda, reviewerRecord },
          { wallet: reviewer.signer.address, aliasHash, active: true },
        ),
      ],
      [admin],
    );
    done.push(`registered demo reviewer ${reviewer.signer.address}`);
    log(`reviewer: ${tx(reviewerSig)}`);
  }

  // 5. Public config file.
  function writeConfig(extra: { mint: Address }) {
    const file = {
      cluster: "devnet",
      chainId: "solana:devnet",
      explorerBase: EXPLORER,
      programId: BONAWORK_PROGRAM_ADDRESS,
      mint: extra.mint,
      mintSymbol: "BDZAR",
      mintLabel: "Sandbox demo rand (no real money)",
      mintDecimals: MINT_DECIMALS,
      admin: admin.address,
      match: match.address,
      dispute: dispute.address,
      feepayer: feepayer.address,
      treasury: treasury.signer.address,
      keeper: keeper.signer.address,
      demoReviewer: reviewer.signer.address,
      challengeSeconds: { min: MIN_CHALLENGE, max: MAX_CHALLENGE },
    };
    writeFileSync(CONFIG_PATH, `${JSON.stringify(file, null, 2)}\n`);
  }
  writeConfig({ mint });

  // Summary.
  log();
  log("BonaWork devnet bootstrap");
  log(`RPC            ${solanaRpcUrl()}`);
  log(`program        ${acct(BONAWORK_PROGRAM_ADDRESS)}`);
  log(`BDZAR mint     ${acct(mint)}`);
  log(`config PDA     ${acct(configPda)}`);
  log(`treasury       ${treasury.signer.address}`);
  log(`keeper         ${keeper.signer.address}`);
  log(`demo reviewer  ${reviewer.signer.address}`);
  log();
  for (const [name, a] of [
    ["deployer", deployer.address],
    ["admin", admin.address],
    ["feepayer", feepayer.address],
    ["keeper", keeper.signer.address],
  ] as const) {
    log(`${name.padEnd(14)} ${formatSol(await balance(a))}`);
  }
  log();
  for (const line of done) log(`done:    ${line}`);
  for (const line of skipped) log(`skipped: ${line}`);
  for (const [label, s] of [
    ["top-up", topupSig],
    ["mint", mintSig],
    ["config", configSig],
    ["reviewer", reviewerSig],
  ] as const) {
    if (s) log(`${label.padEnd(9)} ${tx(s)}`);
  }
  log(`wrote ${relative(REPO_ROOT, CONFIG_PATH)}`);
}

main().catch((error) => {
  console.error(
    `Bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
