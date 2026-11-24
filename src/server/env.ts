import { z } from "zod";
import { SOLANA_CHAINS } from "@/shared";

const PrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte hex key");
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed address");

/** The variable that holds the signing key of each on-chain role. Server-side only. */
export const LEDGER_KEY_ENV = {
  registrar: "LEDGER_REGISTRAR_PRIVATE_KEY",
  school_admin: "LEDGER_SCHOOL_ADMIN_PRIVATE_KEY",
  reviewer: "LEDGER_REVIEWER_PRIVATE_KEY",
  buyer: "LEDGER_BUYER_PRIVATE_KEY",
  supplier: "LEDGER_SUPPLIER_PRIVATE_KEY",
  receiver: "LEDGER_RECEIVER_PRIVATE_KEY",
  payment_approver: "LEDGER_PAYMENT_APPROVER_PRIVATE_KEY",
} as const;

/**
 * Server-side configuration. Every variable is documented in `.env.example`.
 * Nothing is required to run locally: without a database the app uses an
 * in-process store, and without a complete LEDGER_* set it uses the in-memory
 * ledger (clearly labelled as not a blockchain).
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /* Backend */
    DATABASE_URL: z.string().min(1).optional(),
    /** PGlite data directory used when DATABASE_URL is unset (`memory` = ephemeral). */
    PGLITE_DATA_DIR: z.string().min(1).default(".data/pglite"),
    AUTH_SECRET: z.string().min(32).optional(),
    /**
     * Disk fallback for evidence when no Blob token is set. On Vercel the
     * project directory is read-only, so the default moves to /tmp (ephemeral:
     * fine for a preview, not for the demo — set BLOB_READ_WRITE_TOKEN).
     */
    EVIDENCE_STORAGE_DIR: z
      .string()
      .min(1)
      .default(process.env.VERCEL ? "/tmp/bona-evidence" : ".evidence"),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    /** Password of every seeded demo account (docs/demo/DEMO_SCENARIO.md). */
    DEMO_ACCOUNT_PASSWORD: z.string().min(8).default("bona-demo-2026"),
    /** Shared secret for `POST /api/ledger/retry` (Vercel cron sends it as a bearer token). */
    CRON_SECRET: z.string().min(1).optional(),
    /** Set by Vercel at runtime; the file system there is read-only. */
    VERCEL: z.string().optional(),

    /* Ledger — decision D4 in docs/coordination/DEPENDENCIES.md */
    LEDGER_MODE: z.enum(["auto", "memory", "off"]).default("auto"),
    LEDGER_RPC_URL: z.url().optional(),
    /**
     * `solana:devnet` for BonaWork. `eip155:<n>` is still accepted for the
     * earlier EVM adapters, which refuse anything but Avalanche Fuji.
     */
    LEDGER_CHAIN_ID: z
      .string()
      .regex(/^(solana:devnet|eip155:\d+)$/, "expected solana:devnet")
      .default(SOLANA_CHAINS.devnet),
    /**
     * The BonaChainFactory. When set, the Bona Chain contracts are used and
     * LEDGER_CONTRACT_ADDRESS is ignored: nothing is written to it.
     */
    LEDGER_FACTORY_ADDRESS: Address.optional(),
    /** The earlier single BonaRegistry. Used only when no factory address is set. */
    LEDGER_CONTRACT_ADDRESS: Address.optional(),
    LEDGER_REGISTRAR_PRIVATE_KEY: PrivateKey.optional(),
    LEDGER_SCHOOL_ADMIN_PRIVATE_KEY: PrivateKey.optional(),
    LEDGER_REVIEWER_PRIVATE_KEY: PrivateKey.optional(),
    /* The four finance roles of InstitutionFinance. */
    LEDGER_BUYER_PRIVATE_KEY: PrivateKey.optional(),
    LEDGER_SUPPLIER_PRIVATE_KEY: PrivateKey.optional(),
    LEDGER_RECEIVER_PRIVATE_KEY: PrivateKey.optional(),
    LEDGER_PAYMENT_APPROVER_PRIVATE_KEY: PrivateKey.optional(),
    /**
     * `auto`: finance steps are written to the ledger when it can take them.
     * `off`: they are kept in the database only and the app says so.
     */
    LEDGER_FINANCE_MODE: z.enum(["auto", "off"]).default("auto"),

    /* Bona AI */
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    /**
     * `auto`: use the AI Gateway when it can authenticate, with an API key or, on Vercel, the
     * project's own OIDC token (no key to create or store). `off`: always the keyword fallback.
     */
    AI_MODE: z.enum(["auto", "off"]).default("auto"),
    AI_MODEL: z.string().min(1).default("google/gemini-2.5-flash-lite"),
  })
  .refine(
    (e) => {
      // Hex is case-insensitive: the same key in another case is still the same key.
      const keys = Object.values(LEDGER_KEY_ENV)
        .map((name) => e[name]?.toLowerCase())
        .filter(Boolean);
      return new Set(keys).size === keys.length;
    },
    {
      message:
        "The ledger private keys must all differ: one key per on-chain role, never shared.",
    },
  )
  .refine(
    (e) =>
      !e.LEDGER_FACTORY_ADDRESS ||
      !e.LEDGER_CONTRACT_ADDRESS ||
      e.LEDGER_FACTORY_ADDRESS.toLowerCase() !== e.LEDGER_CONTRACT_ADDRESS.toLowerCase(),
    {
      message:
        "LEDGER_FACTORY_ADDRESS must be the BonaChainFactory, not the BonaRegistry in LEDGER_CONTRACT_ADDRESS.",
    },
  );

export type Env = z.infer<typeof EnvSchema>;

/** Parse and validate environment variables. Throws with a readable list of problems. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

let cached: Env | null = null;

/** Process-wide environment, parsed once. */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}
