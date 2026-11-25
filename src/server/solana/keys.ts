/**
 * Server-held Solana keys for BonaWork.
 *
 * Each platform role has its own key, read from an environment variable as
 * base58 or as a Solana CLI JSON array (64 bytes: secret seed + public key).
 * In local development only, a missing variable may be read from a keypair
 * file in BONAWORK_KEYS_DIR. Secret bytes are never logged, echoed in errors,
 * or returned to callers: only signers and public addresses leave this module.
 */
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";

/** Platform roles. Each signs only the steps the program gives it. */
export const PLATFORM_KEY_ROLES = [
  "admin",
  "match",
  "dispute",
  "feepayer",
  "treasury",
  "keeper",
] as const;
/** Stand-ins used until real people sign with their own wallets. Never real users. */
export const DEMO_KEY_ROLES = [
  "demoContractor",
  "demoFunder",
  "demoReviewer",
  "demoSupplier",
  "demoSchool",
] as const;

export type PlatformKeyRole = (typeof PLATFORM_KEY_ROLES)[number];
export type DemoKeyRole = (typeof DEMO_KEY_ROLES)[number];
export type KeyRole = PlatformKeyRole | DemoKeyRole;

export const KEY_ENV: Record<KeyRole, string> = {
  admin: "BONAWORK_ADMIN_KEY",
  match: "BONAWORK_MATCH_KEY",
  dispute: "BONAWORK_DISPUTE_KEY",
  feepayer: "BONAWORK_FEEPAYER_KEY",
  treasury: "BONAWORK_TREASURY_KEY",
  keeper: "BONAWORK_KEEPER_KEY",
  demoContractor: "BONAWORK_DEMO_CONTRACTOR_KEY",
  demoFunder: "BONAWORK_DEMO_FUNDER_KEY",
  demoReviewer: "BONAWORK_DEMO_REVIEWER_KEY",
  demoSupplier: "BONAWORK_DEMO_SUPPLIER_KEY",
  demoSchool: "BONAWORK_DEMO_SCHOOL_KEY",
};

export const KEY_FILES: Record<KeyRole, string> = {
  admin: "bonawork-admin.json",
  match: "bonawork-match.json",
  dispute: "bonawork-dispute.json",
  feepayer: "bonawork-feepayer.json",
  treasury: "bonawork-treasury.json",
  keeper: "bonawork-keeper.json",
  demoContractor: "bonawork-contractor-demo.json",
  demoFunder: "bonawork-funder-demo.json",
  demoReviewer: "bonawork-reviewer-demo.json",
  demoSupplier: "bonawork-supplier-demo.json",
  demoSchool: "bonawork-school-demo.json",
};

export class KeyFormatError extends Error {
  constructor(label: string, reason: string) {
    // The value itself is never included.
    super(`${label}: ${reason}`);
    this.name = "KeyFormatError";
  }
}

/**
 * Parses a 64-byte Solana secret key given as base58 or a JSON byte array.
 * Errors name the source (`label`) and the problem, never the value.
 */
export function parseSecretKey(value: string, label = "secret key"): Uint8Array {
  const text = value.trim();
  if (!text) throw new KeyFormatError(label, "is empty");
  let bytes: Uint8Array;
  if (text.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new KeyFormatError(label, "is not a valid JSON byte array");
    }
    if (
      !Array.isArray(parsed) ||
      !parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ) {
      throw new KeyFormatError(label, "must be an array of numbers from 0 to 255");
    }
    bytes = Uint8Array.from(parsed as number[]);
  } else {
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(text)) {
      throw new KeyFormatError(label, "is neither base58 nor a JSON byte array");
    }
    bytes = Uint8Array.from(getBase58Encoder().encode(text));
  }
  if (bytes.length !== 64) {
    throw new KeyFormatError(label, `must be 64 bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** Reads a Solana CLI keypair file (JSON array of 64 bytes). */
export function readKeypairFile(path: string): Uint8Array {
  return parseSecretKey(readFileSync(path, "utf8"), `key file ${path}`);
}

/** A fresh ed25519 keypair as 64 bytes (seed + public key), Solana CLI layout. */
export function generateKeypairBytes(): Uint8Array {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const d = privateKey.export({ format: "jwk" }).d;
  const x = publicKey.export({ format: "jwk" }).x;
  if (!d || !x) throw new Error("ed25519 key generation returned no key material");
  const out = new Uint8Array(64);
  out.set(Buffer.from(d, "base64url"), 0);
  out.set(Buffer.from(x, "base64url"), 32);
  return out;
}

/** Writes a new keypair file. Refuses to overwrite one that exists. */
export function writeNewKeypairFile(path: string, bytes: Uint8Array): void {
  writeFileSync(path, JSON.stringify(Array.from(bytes)), { flag: "wx", mode: 0o600 });
}

/** Signer from 64 secret-key bytes; checks the public half matches the seed. */
export function signerFromBytes(bytes: Uint8Array): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(bytes);
}

/** Key files are only read outside production and outside Vercel. */
export function keyFilesAllowed(source: Record<string, string | undefined>): boolean {
  return source.NODE_ENV !== "production" && !source.VERCEL;
}

export type KeySource = "env" | "file";

/**
 * Finds the secret bytes for each requested role: the environment first, then
 * (local development only) a key file in BONAWORK_KEYS_DIR. Missing roles are
 * left out; callers decide which roles they need.
 */
export function resolveKeyBytes(
  roles: readonly KeyRole[],
  source: Record<string, string | undefined> = process.env,
): Partial<Record<KeyRole, { bytes: Uint8Array; from: KeySource }>> {
  const out: Partial<Record<KeyRole, { bytes: Uint8Array; from: KeySource }>> = {};
  const dir = source.BONAWORK_KEYS_DIR;
  for (const role of roles) {
    const envName = KEY_ENV[role];
    const value = source[envName];
    if (value && value.trim()) {
      out[role] = { bytes: parseSecretKey(value, envName), from: "env" };
      continue;
    }
    if (dir && keyFilesAllowed(source)) {
      const path = join(dir, KEY_FILES[role]);
      if (existsSync(path)) out[role] = { bytes: readKeypairFile(path), from: "file" };
    }
  }
  return out;
}

/**
 * Local development only: writes a new keypair file for a demo role when the
 * role has no env key and no file yet. Never runs in production or on Vercel.
 * Returns true when a file was created.
 */
export function ensureDemoKeyFile(
  role: DemoKeyRole,
  source: Record<string, string | undefined> = process.env,
): boolean {
  const dir = source.BONAWORK_KEYS_DIR;
  if (!dir || !keyFilesAllowed(source)) return false;
  if (source[KEY_ENV[role]]?.trim()) return false;
  const path = join(dir, KEY_FILES[role]);
  if (existsSync(path)) return false;
  writeNewKeypairFile(path, generateKeypairBytes());
  return true;
}

export type ServerSigners = Partial<Record<KeyRole, KeyPairSigner>>;

/**
 * Loads signers for the requested roles. Throws if two platform roles share a
 * key: one key per role, never shared.
 */
export async function loadSigners(
  roles: readonly KeyRole[],
  source: Record<string, string | undefined> = process.env,
): Promise<ServerSigners> {
  const resolved = resolveKeyBytes(roles, source);
  const signers: ServerSigners = {};
  const seen = new Map<Address, KeyRole>();
  for (const role of roles) {
    const entry = resolved[role];
    if (!entry) continue;
    const signer = await signerFromBytes(entry.bytes);
    const other = seen.get(signer.address);
    if (other) {
      throw new Error(
        `${KEY_ENV[role]} and ${KEY_ENV[other]} hold the same key. Each role needs its own key.`,
      );
    }
    seen.set(signer.address, role);
    signers[role] = signer;
  }
  return signers;
}
