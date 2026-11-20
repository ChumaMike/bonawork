// Shared helpers for the Bona Chain scripts (deploy, setup, fund, export, keys). They take
// their inputs as arguments and print nothing, so the Hardhat tests exercise exactly the
// code the scripts run. Nothing here ever returns or logs a private key.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  ethers as ethersLib,
  type ContractFactory,
  type Interface,
  type Provider,
  type Signer,
} from "ethers";
import type { BonaChainFactory } from "../../../types/ethers-contracts/index.js";
import { FUJI_CHAIN_ID, idToBytes32, LOCAL_CHAIN_ID } from "../../lib/setup.js";

export {
  assertSupportedChain,
  FUJI_CHAIN_ID,
  idToBytes32,
  LOCAL_CHAIN_ID,
} from "../../lib/setup.js";

/**
 * The name of the custom error a call or transaction reverted with, or null. Works with
 * the local test network (which reports raw revert data) and with a JSON-RPC provider.
 */
export function revertName(iface: Interface, error: unknown): string | null {
  const e = error as { revert?: { name?: string } | null; data?: unknown };
  if (e?.revert?.name) return e.revert.name;
  if (typeof e?.data === "string" && e.data.length >= 10) {
    try {
      return iface.parseError(e.data)?.name ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

// ------------------------------------------------------------------ roles

export const ChainRole = {
  None: 0,
  Registrar: 1,
  SchoolAdmin: 2,
  Reviewer: 3,
  Buyer: 4,
  Supplier: 5,
  Receiver: 6,
  PaymentApprover: 7,
} as const;
const CHAIN_ROLE_NAMES = [
  "None",
  "Registrar",
  "SchoolAdmin",
  "Reviewer",
  "Buyer",
  "Supplier",
  "Receiver",
  "PaymentApprover",
] as const;

export interface ChainRoleAddresses {
  registrar: string;
  schoolAdmin: string;
  reviewer: string;
  buyer: string;
  supplier: string;
  receiver: string;
  paymentApprover: string;
}

/** Role key -> the env var that carries its ADDRESS, and the on-chain role. */
export const CHAIN_ROLE_ENV = [
  { key: "registrar", env: "BONA_REGISTRAR_ADDRESS", role: ChainRole.Registrar },
  { key: "schoolAdmin", env: "BONA_SCHOOL_ADMIN_ADDRESS", role: ChainRole.SchoolAdmin },
  { key: "reviewer", env: "BONA_REVIEWER_ADDRESS", role: ChainRole.Reviewer },
  { key: "buyer", env: "BONA_BUYER_ADDRESS", role: ChainRole.Buyer },
  { key: "supplier", env: "BONA_SUPPLIER_ADDRESS", role: ChainRole.Supplier },
  { key: "receiver", env: "BONA_RECEIVER_ADDRESS", role: ChainRole.Receiver },
  {
    key: "paymentApprover",
    env: "BONA_PAYMENT_APPROVER_ADDRESS",
    role: ChainRole.PaymentApprover,
  },
] as const satisfies readonly {
  key: keyof ChainRoleAddresses;
  env: string;
  role: number;
}[];

/** The four roles Bona Chain adds. `generate-keys` creates a key for each. */
export const FINANCE_KEYS = [
  { key: "buyer", prefix: "BONA_BUYER" },
  { key: "supplier", prefix: "BONA_SUPPLIER" },
  { key: "receiver", prefix: "BONA_RECEIVER" },
  { key: "paymentApprover", prefix: "BONA_PAYMENT_APPROVER" },
] as const;
export type FinanceKeyName = (typeof FINANCE_KEYS)[number]["key"];

/** Normalises the seven role addresses and insists they are seven different accounts. */
export function normaliseChainRoleAddresses(
  input: ChainRoleAddresses,
): ChainRoleAddresses {
  const out = {} as ChainRoleAddresses;
  for (const { key } of CHAIN_ROLE_ENV) out[key] = ethersLib.getAddress(input[key]);
  if (new Set(Object.values(out)).size !== CHAIN_ROLE_ENV.length) {
    throw new Error(
      "The seven role addresses (registrar, school admin, reviewer, buyer, supplier, " +
        "receiver, payment approver) must all be different.",
    );
  }
  return out;
}

/**
 * Reads only the `BONA_*_ADDRESS=` lines of an env-style file. Private key lines in the
 * same file are skipped, so they never enter this process's environment.
 */
export function readAddressLines(fileText: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fileText.split(/\r?\n/)) {
    const match = /^\s*(BONA_[A-Z_]+_ADDRESS)\s*=\s*(\S+)\s*$/.exec(line);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

/**
 * The seven role addresses: from the environment first, then from the `BONA_*_ADDRESS`
 * lines of contracts/.env.finance.local (written by `pnpm chain:keys`). Addresses only.
 */
export function chainRoleAddresses(
  env: Record<string, string | undefined>,
  financeFileText = "",
): ChainRoleAddresses {
  const fromFile = readAddressLines(financeFileText);
  const out = {} as ChainRoleAddresses;
  const missing: string[] = [];
  for (const { key, env: name } of CHAIN_ROLE_ENV) {
    const value = env[name] || fromFile[name];
    if (value) out[key] = value;
    else missing.push(name);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(", ")}. Set them in contracts/.env ` +
        "(the four finance addresses are also read from contracts/.env.finance.local).",
    );
  }
  return normaliseChainRoleAddresses(out);
}

// ----------------------------------------------------------- institutions

/** The five seed institutions of the app: the demo school plus four more. */
export const DEFAULT_INSTITUTION_IDS = [1, 2, 3, 4, 5].map(
  (n) => `00000000-0000-4000-8000-01${String(n).padStart(10, "0")}`,
);

/** Parses BONA_INSTITUTION_IDS (comma-separated UUIDs). Empty means the five seed ids. */
export function parseInstitutionIds(csv: string | undefined): string[] {
  if (csv === undefined || csv.trim() === "") return [...DEFAULT_INSTITUTION_IDS];
  const ids = csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (ids.length === 0) throw new Error("BONA_INSTITUTION_IDS lists no institution ids.");
  for (const id of ids) idToBytes32(id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("BONA_INSTITUTION_IDS contains a duplicate institution id.");
  }
  return ids;
}

/** bytes32 -> app UUID, when the value is a left-padded UUID (see `idToBytes32`). */
export function bytes32ToId(value: string): string | null {
  const hex = value.toLowerCase().replace(/^0x/, "");
  if (hex.length !== 64 || !/^0{32}/.test(hex)) return null;
  const u = hex.slice(32);
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
}

// ----------------------------------------------------------------- deploy

/** The most a factory deployment may be estimated to cost before the script refuses. */
export const MAX_DEPLOY_COST_WEI = ethersLib.parseEther("0.2");

export interface CostEstimate {
  gas: bigint;
  /** Worst-case price per gas unit: the fee cap if the network reports one, else the gas price. */
  gasPrice: bigint;
  cost: bigint;
  balance: bigint;
}

/** Worst-case price per gas unit the network currently asks for. Read-only. */
export async function currentGasPrice(provider: Provider): Promise<bigint> {
  const fees = await provider.getFeeData();
  const price = fees.maxFeePerGas ?? fees.gasPrice;
  if (price === null || price <= 0n) {
    throw new Error("The network did not report a gas price.");
  }
  return price;
}

/** Estimates what deploying `factory` would cost `deployer`. Read-only: sends nothing. */
export async function estimateDeployCost(
  factory: ContractFactory,
  deployer: string,
  provider: Provider,
): Promise<CostEstimate> {
  const request = await factory.getDeployTransaction(deployer);
  const gas = await provider.estimateGas({ ...request, from: deployer });
  const gasPrice = await currentGasPrice(provider);
  const balance = await provider.getBalance(deployer);
  return { gas, gasPrice, cost: gas * gasPrice, balance };
}

/** Throws unless the estimate is within `capWei` and the account can pay for it. */
export function assertAffordable(
  estimate: CostEstimate,
  capWei: bigint,
  what: string,
): void {
  const fmt = ethersLib.formatEther;
  if (estimate.cost > capWei) {
    throw new Error(
      `Refusing to ${what}: the estimated cost is ${fmt(estimate.cost)} AVAX ` +
        `(${estimate.gas} gas at ${ethersLib.formatUnits(estimate.gasPrice, "gwei")} gwei), ` +
        `over the ${fmt(capWei)} AVAX limit. Nothing was sent.`,
    );
  }
  if (estimate.balance < estimate.cost) {
    throw new Error(
      `Refusing to ${what}: the wallet holds ${fmt(estimate.balance)} AVAX but the ` +
        `estimated cost is ${fmt(estimate.cost)} AVAX. Nothing was sent.`,
    );
  }
}

export interface InstitutionRecord {
  /** The app UUID, or null if the on-chain id is not a padded UUID. */
  institutionId: string | null;
  institutionIdBytes32: string;
  operations: string;
  finance: string;
}

export interface ChainDeployment {
  contract: "BonaChainFactory";
  chainId: number;
  network: string;
  factory: string;
  owner: string;
  deployTxHash: string;
  deployBlock: number;
  institutions: InstitutionRecord[];
}

/**
 * Preflight, then deploy. The preflight reads the gas price and the balance and aborts,
 * before sending anything, if the estimated cost is over `capWei` or over the balance.
 */
export async function deployFactory(
  factory: ContractFactory,
  deployer: Signer,
  provider: Provider,
  capWei: bigint = MAX_DEPLOY_COST_WEI,
): Promise<{ deployment: ChainDeployment; estimate: CostEstimate; gasUsed: bigint }> {
  const owner = await deployer.getAddress();
  const { chainId } = await provider.getNetwork();
  const estimate = await estimateDeployCost(factory, owner, provider);
  assertAffordable(estimate, capWei, "deploy BonaChainFactory");

  const contract = await factory.connect(deployer).deploy(owner);
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error("Deployment transaction missing.");
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Deployment receipt missing.");

  return {
    estimate,
    gasUsed: receipt.gasUsed,
    deployment: {
      contract: "BonaChainFactory",
      chainId: Number(chainId),
      network: networkName(chainId),
      factory: await contract.getAddress(),
      owner,
      deployTxHash: tx.hash,
      deployBlock: receipt.blockNumber,
      institutions: [],
    },
  };
}

export function networkName(chainId: bigint): string {
  if (chainId === FUJI_CHAIN_ID) return "avalanche-fuji";
  if (chainId === LOCAL_CHAIN_ID) return "local";
  return `chain-${chainId}`;
}

// ------------------------------------------------------ deployment record

const DEPLOYMENTS_DIR = new URL("../../../deployments/", import.meta.url);

export function deploymentUrl(chainId: bigint | number, dir: URL = DEPLOYMENTS_DIR): URL {
  return new URL(`bonachain.${chainId}.json`, dir);
}

export function readChainDeployment(
  chainId: bigint | number,
  dir: URL = DEPLOYMENTS_DIR,
): ChainDeployment | null {
  const url = deploymentUrl(chainId, dir);
  if (!existsSync(url)) return null;
  return JSON.parse(readFileSync(url, "utf8")) as ChainDeployment;
}

export function writeChainDeployment(
  deployment: ChainDeployment,
  dir: URL = DEPLOYMENTS_DIR,
): URL {
  mkdirSync(dir, { recursive: true });
  const url = deploymentUrl(deployment.chainId, dir);
  writeFileSync(url, `${JSON.stringify(deployment, null, 2)}\n`);
  return url;
}

/** The deployment record, or a clear error telling the operator to deploy first. */
export function requireChainDeployment(
  chainId: bigint | number,
  dir: URL = DEPLOYMENTS_DIR,
): ChainDeployment {
  const deployment = readChainDeployment(chainId, dir);
  if (!deployment) {
    throw new Error(
      `No Bona Chain deployment record for chain ${chainId} ` +
        `(contracts/deployments/bonachain.${chainId}.json). Run chain:deploy first.`,
    );
  }
  return deployment;
}

// ------------------------------------------------------------------ setup

export interface ChainSetupRow {
  institution: string;
  action: "createInstitution" | `grant ${(typeof CHAIN_ROLE_NAMES)[number]}`;
  account: string;
  result: "sent" | "skipped";
  txHash: string;
  gasUsed: bigint;
}

/**
 * Works out what is still missing, without sending anything. Throws if an account already
 * holds a DIFFERENT role for an institution: that is for a human to resolve, on purpose.
 */
export async function planChainSetup(
  factory: BonaChainFactory,
  institutionUuids: string[],
  roles: ChainRoleAddresses,
): Promise<ChainSetupRow[]> {
  const addresses = normaliseChainRoleAddresses(roles);
  const rows: ChainSetupRow[] = [];
  for (const institution of institutionUuids) {
    const id = idToBytes32(institution);
    const [operations] = await factory.institutionOf(id);
    const exists = operations !== ethersLib.ZeroAddress;
    rows.push({
      institution,
      action: "createInstitution",
      account: "",
      result: exists ? "skipped" : "sent",
      txHash: "",
      gasUsed: 0n,
    });

    for (const { key, role } of CHAIN_ROLE_ENV) {
      const account = addresses[key];
      const action = `grant ${CHAIN_ROLE_NAMES[role]}` as const;
      const current = exists ? Number(await factory.roleOf(id, account)) : ChainRole.None;
      if (current !== role && current !== ChainRole.None) {
        throw new Error(
          `${account} already holds ${CHAIN_ROLE_NAMES[current]} for institution ` +
            `${institution}; cannot ${action}. Revoke it deliberately first. Nothing was sent.`,
        );
      }
      rows.push({
        institution,
        action,
        account,
        result: current === role ? "skipped" : "sent",
        txHash: "",
        gasUsed: 0n,
      });
    }
  }
  return rows;
}

/**
 * Idempotently creates every institution and grants the seven roles for each one. Anything
 * already in place is skipped, so a re-run (or a run resumed after a failure) sends only
 * what is still missing. Never revokes.
 */
export async function setupChain(
  factory: BonaChainFactory,
  institutionUuids: string[],
  roles: ChainRoleAddresses,
): Promise<ChainSetupRow[]> {
  const rows = await planChainSetup(factory, institutionUuids, roles);
  const roleByAction = new Map<string, number>(
    CHAIN_ROLE_ENV.map(({ role }) => [`grant ${CHAIN_ROLE_NAMES[role]}`, role]),
  );
  for (const row of rows) {
    if (row.result === "skipped") continue;
    const id = idToBytes32(row.institution);
    const tx =
      row.action === "createInstitution"
        ? await factory.createInstitution(id)
        : await factory.grantRole(id, row.account, roleByAction.get(row.action)!);
    const receipt = await tx.wait();
    row.txHash = tx.hash;
    row.gasUsed = receipt?.gasUsed ?? 0n;
  }
  return rows;
}

/** "N transaction(s) sent, M already in place" */
export function summariseSetup(rows: ChainSetupRow[]): string {
  const sent = rows.filter((r) => r.result === "sent").length;
  return `${sent} transaction(s) sent, ${rows.length - sent} already in place`;
}

/** Reads every institution and its two contract addresses from the factory. Read-only. */
export async function readInstitutions(
  factory: BonaChainFactory,
): Promise<InstitutionRecord[]> {
  const count = Number(await factory.institutionCount());
  const out: InstitutionRecord[] = [];
  for (let i = 0; i < count; i++) {
    const id = await factory.institutionIdAt(i);
    const [operations, finance] = await factory.institutionOf(id);
    out.push({
      institutionId: bytes32ToId(id),
      institutionIdBytes32: id,
      operations,
      finance,
    });
  }
  return out;
}

// ------------------------------------------------------------------- fund

export interface FundRow {
  label: string;
  account: string;
  before: bigint;
  sent: bigint;
  after: bigint;
  txHash: string;
}

/**
 * Tops each address up to `targetWei` from `funder`. Addresses already at or above the
 * target are skipped. Checks the funder can cover every top-up before sending anything.
 */
export async function fundAddresses(
  funder: Signer,
  provider: Provider,
  entries: { label: string; account: string }[],
  targetWei: bigint,
): Promise<FundRow[]> {
  const plan: FundRow[] = [];
  for (const { label, account } of entries) {
    const address = ethersLib.getAddress(account);
    const before = await provider.getBalance(address);
    const sent = before >= targetWei ? 0n : targetWei - before;
    plan.push({ label, account: address, before, sent, after: before, txHash: "" });
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

// ------------------------------------------------------------------- keys

/** contracts/.env.finance.local: git-ignored, written once by `pnpm chain:keys`. */
export const FINANCE_KEY_FILE = new URL("../../../.env.finance.local", import.meta.url);

/** The text of the finance key file, or "" if absent. Callers read ADDRESS lines only. */
export function readFinanceKeyFile(url: URL = FINANCE_KEY_FILE): string {
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

/** The four finance role addresses, from the environment or the finance key file. */
export function financeAddresses(
  env: Record<string, string | undefined>,
  financeFileText = "",
): { label: FinanceKeyName; account: string }[] {
  const fromFile = readAddressLines(financeFileText);
  const out = FINANCE_KEYS.map(({ key, prefix }) => {
    const name = `${prefix}_ADDRESS`;
    const value = env[name] || fromFile[name];
    if (!value) {
      throw new Error(
        `Missing ${name}. Run chain:keys first, or set it in contracts/.env.`,
      );
    }
    return { label: key, account: ethersLib.getAddress(value) };
  });
  if (new Set(out.map((o) => o.account)).size !== out.length) {
    throw new Error("The four finance role addresses must all be different.");
  }
  return out;
}

/**
 * Creates one fresh testnet-only key for each of the four finance roles and writes them
 * to `filePath` as BONA_<ROLE>_PRIVATE_KEY, with the matching BONA_<ROLE>_ADDRESS lines.
 * Refuses to overwrite an existing file. Returns the ADDRESSES only.
 */
export function generateFinanceKeys(
  filePath: string | URL,
): Record<FinanceKeyName, string> {
  const addresses = {} as Record<FinanceKeyName, string>;
  const lines = [
    "# Bona Chain finance role keys. TESTNET ONLY (Avalanche Fuji). Never fund on mainnet.",
    "# Git-ignored. Do not commit, paste or print the PRIVATE_KEY lines.",
    "",
  ];
  for (const { key, prefix } of FINANCE_KEYS) {
    const wallet = ethersLib.Wallet.createRandom();
    addresses[key] = wallet.address;
    lines.push(`${prefix}_ADDRESS=${wallet.address}`);
    lines.push(`${prefix}_PRIVATE_KEY=${wallet.privateKey}`);
    lines.push("");
  }
  try {
    // "wx": fail if the file exists, so keys in use are never replaced.
    writeFileSync(filePath, lines.join("\n"), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        "Refusing to overwrite the existing finance key file. Move it away deliberately " +
          "if you really want new keys (the old addresses hold the roles and the gas).",
      );
    }
    throw error;
  }
  return addresses;
}
