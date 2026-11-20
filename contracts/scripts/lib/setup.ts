// Shared, side-effect-free helpers for the Fuji setup scripts. Kept separate from the
// script entry points so the Hardhat tests can exercise the same code the scripts run.
import { readFileSync } from "node:fs";
import { ethers as ethersLib, type Provider, type Signer } from "ethers";
import type { BonaRegistry } from "../../types/ethers-contracts/index.js";

export const FUJI_CHAIN_ID = 43113n;
export const LOCAL_CHAIN_ID = 31337n;

export const Role = { None: 0, Registrar: 1, SchoolAdmin: 2, Reviewer: 3 } as const;
const ROLE_NAMES = ["None", "Registrar", "SchoolAdmin", "Reviewer"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertSupportedChain(chainId: bigint): void {
  if (chainId !== FUJI_CHAIN_ID && chainId !== LOCAL_CHAIN_ID) {
    throw new Error(
      `Refusing to run: chain ${chainId} is neither Fuji (43113) nor local.`,
    );
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} (see contracts/.env.example).`);
  return value;
}

export function readDeployment(chainId: bigint): { address: string } {
  const url = new URL(`../../deployments/${chainId}.json`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8")) as { address: string };
  } catch {
    throw new Error(
      `No deployment record for chain ${chainId} (contracts/deployments/${chainId}.json). Deploy first.`,
    );
  }
}

/**
 * App UUID -> bytes32: the UUID's 16 bytes left-padded with zeros. Must stay byte-identical
 * to `idToBytes32` in the web app (`src/shared/commitment.ts`).
 */
export function idToBytes32(uuid: string): string {
  if (!UUID.test(uuid)) throw new Error(`Not a UUID: "${uuid}"`);
  return `0x${"0".repeat(32)}${uuid.replaceAll("-", "").toLowerCase()}`;
}

/** Parses a comma-separated list of UUIDs, rejecting empties, bad values and duplicates. */
export function parseSchoolIds(csv: string): string[] {
  const ids = csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (ids.length === 0) throw new Error("BONA_SCHOOL_IDS lists no school ids.");
  for (const id of ids) idToBytes32(id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("BONA_SCHOOL_IDS contains a duplicate school id.");
  }
  return ids;
}

export interface RoleAddresses {
  registrar: string;
  schoolAdmin: string;
  reviewer: string;
}

/** Normalises the three role addresses and insists they are three different accounts. */
export function normaliseRoleAddresses(input: RoleAddresses): RoleAddresses {
  const out = {
    registrar: ethersLib.getAddress(input.registrar),
    schoolAdmin: ethersLib.getAddress(input.schoolAdmin),
    reviewer: ethersLib.getAddress(input.reviewer),
  };
  if (new Set(Object.values(out)).size !== 3) {
    throw new Error(
      "Registrar, school admin and reviewer must be three different addresses.",
    );
  }
  return out;
}

export interface SetupRow {
  school: string;
  action: "registerSchool" | "grant Registrar" | "grant SchoolAdmin" | "grant Reviewer";
  account: string;
  result: "sent" | "skipped";
  txHash: string;
}

/**
 * Idempotently registers every school and grants the three roles for each one. Anything
 * already in place is skipped, so a re-run (or a run resumed after a failure) sends only
 * what is still missing. Never revokes: an account holding a *different* role for a school
 * is reported as an error for a human to resolve.
 */
export async function setupRegistry(
  registry: BonaRegistry,
  schoolUuids: string[],
  roles: RoleAddresses,
): Promise<SetupRow[]> {
  const addresses = normaliseRoleAddresses(roles);
  const wanted = [
    { role: Role.Registrar, action: "grant Registrar", account: addresses.registrar },
    {
      role: Role.SchoolAdmin,
      action: "grant SchoolAdmin",
      account: addresses.schoolAdmin,
    },
    { role: Role.Reviewer, action: "grant Reviewer", account: addresses.reviewer },
  ] as const;

  const rows: SetupRow[] = [];
  for (const school of schoolUuids) {
    const schoolId = idToBytes32(school);

    if (await registry.isSchoolRegistered(schoolId)) {
      rows.push({
        school,
        action: "registerSchool",
        account: "",
        result: "skipped",
        txHash: "",
      });
    } else {
      const tx = await registry.registerSchool(schoolId);
      await tx.wait();
      rows.push({
        school,
        action: "registerSchool",
        account: "",
        result: "sent",
        txHash: tx.hash,
      });
    }

    for (const { role, action, account } of wanted) {
      const current = Number(await registry.roleOf(schoolId, account));
      if (current === role) {
        rows.push({ school, action, account, result: "skipped", txHash: "" });
        continue;
      }
      if (current !== Role.None) {
        throw new Error(
          `${account} already holds ${ROLE_NAMES[current]} for school ${school}; ` +
            `cannot ${action}. Revoke it deliberately first.`,
        );
      }
      const tx = await registry.grantRole(schoolId, account, role);
      await tx.wait();
      rows.push({ school, action, account, result: "sent", txHash: tx.hash });
    }
  }
  return rows;
}

export interface FundRow {
  role: keyof RoleAddresses;
  account: string;
  before: bigint;
  sent: bigint;
  after: bigint;
  txHash: string;
}

/**
 * Tops each role address up to `targetWei` from `funder`. Addresses already at or above the
 * target are skipped. Checks the funder can cover every top-up before sending anything.
 */
export async function fundRoles(
  funder: Signer,
  provider: Provider,
  roles: RoleAddresses,
  targetWei: bigint,
): Promise<FundRow[]> {
  const addresses = normaliseRoleAddresses(roles);
  const plan: FundRow[] = [];
  for (const role of ["registrar", "schoolAdmin", "reviewer"] as const) {
    const account = addresses[role];
    const before = await provider.getBalance(account);
    const sent = before >= targetWei ? 0n : targetWei - before;
    plan.push({ role, account, before, sent, after: before, txHash: "" });
  }

  const total = plan.reduce((sum, row) => sum + row.sent, 0n);
  if (total > 0n) {
    const funderBalance = await provider.getBalance(await funder.getAddress());
    const gasMargin = ethersLib.parseEther("0.01");
    if (funderBalance < total + gasMargin) {
      throw new Error(
        `Funder holds ${ethersLib.formatEther(funderBalance)} AVAX but needs ` +
          `${ethersLib.formatEther(total)} plus gas. Nothing was sent.`,
      );
    }
  }

  for (const row of plan) {
    if (row.sent === 0n) continue;
    const tx = await funder.sendTransaction({ to: row.account, value: row.sent });
    await tx.wait();
    row.txHash = tx.hash;
    row.after = await provider.getBalance(row.account);
  }
  return plan;
}

/** Reads the three role addresses from the environment. Addresses only — never keys. */
export function roleAddressesFromEnv(): RoleAddresses {
  return normaliseRoleAddresses({
    registrar: requireEnv("BONA_REGISTRAR_ADDRESS"),
    schoolAdmin: requireEnv("BONA_SCHOOL_ADMIN_ADDRESS"),
    reviewer: requireEnv("BONA_REVIEWER_ADDRESS"),
  });
}
