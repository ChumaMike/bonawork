// Registers the demo school and grants the three school-scoped roles on a deployed
// registry. Run as the owner:  pnpm roles:fuji
//
// Takes ADDRESSES only (see .env.example). The private keys for the school admin and
// the independent reviewer stay with those parties / the backend, never with this script.
import { readFileSync } from "node:fs";
import { network } from "hardhat";

const Role = { Registrar: 1, SchoolAdmin: 2, Reviewer: 3 } as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} (see contracts/.env.example).`);
  return value;
}

const { ethers } = await network.getOrCreate();
const { chainId } = await ethers.provider.getNetwork();
const deployment = JSON.parse(
  readFileSync(new URL(`../deployments/${chainId}.json`, import.meta.url), "utf8"),
) as { address: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BYTES32 = /^0x[0-9a-f]{64}$/i;

/**
 * BONA_SCHOOL_ID (preferred, integration decision D3) is the institution UUID from the app
 * database, or an explicit 0x bytes32. A UUID becomes its 16 bytes LEFT-padded with zeros
 * to 32 bytes — this must match the app's `idToBytes32`; compare the printed schoolId.
 * BONA_SCHOOL_LABEL (fallback) hashes a text label with keccak256.
 */
function resolveSchool(): { label: string; schoolId: string } {
  const id = process.env.BONA_SCHOOL_ID;
  if (id) {
    if (BYTES32.test(id)) return { label: id, schoolId: id.toLowerCase() };
    if (UUID.test(id)) {
      const hex = `0x${id.replaceAll("-", "").toLowerCase()}`;
      return { label: id, schoolId: ethers.zeroPadValue(hex, 32) };
    }
    throw new Error("BONA_SCHOOL_ID must be a UUID or a 0x-prefixed 32-byte hex value.");
  }
  const label = requireEnv("BONA_SCHOOL_LABEL");
  return { label, schoolId: ethers.id(label) };
}

const { label, schoolId } = resolveSchool();
const grants = [
  {
    role: Role.Registrar,
    name: "Registrar",
    account: requireEnv("BONA_REGISTRAR_ADDRESS"),
  },
  {
    role: Role.SchoolAdmin,
    name: "SchoolAdmin",
    account: requireEnv("BONA_SCHOOL_ADMIN_ADDRESS"),
  },
  {
    role: Role.Reviewer,
    name: "Reviewer",
    account: requireEnv("BONA_REVIEWER_ADDRESS"),
  },
].map((g) => ({ ...g, account: ethers.getAddress(g.account) }));

if (new Set(grants.map((g) => g.account)).size !== grants.length) {
  throw new Error(
    "Registrar, school admin and reviewer must be three different addresses.",
  );
}

const registry = await ethers.getContractAt("BonaRegistry", deployment.address);
console.log(`Registry ${deployment.address} on chain ${chainId}`);
console.log(`School "${label}" -> schoolId ${schoolId}`);

if (!(await registry.isSchoolRegistered(schoolId))) {
  const tx = await registry.registerSchool(schoolId);
  await tx.wait();
  console.log(`registerSchool      tx ${tx.hash}`);
}
for (const { role, name, account } of grants) {
  const current = Number(await registry.roleOf(schoolId, account));
  if (current === role) {
    console.log(`${name.padEnd(12)} already granted to ${account}`);
    continue;
  }
  const tx = await registry.grantRole(schoolId, account, role);
  await tx.wait();
  console.log(`grant ${name.padEnd(12)} tx ${tx.hash} -> ${account}`);
}
