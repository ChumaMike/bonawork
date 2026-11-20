import { z } from "zod";

const PrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte hex key");

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
    LEDGER_CHAIN_ID: z.string().min(1).default("eip155:43113"),
    LEDGER_CONTRACT_ADDRESS: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed address")
      .optional(),
    LEDGER_REGISTRAR_PRIVATE_KEY: PrivateKey.optional(),
    LEDGER_SCHOOL_ADMIN_PRIVATE_KEY: PrivateKey.optional(),
    LEDGER_REVIEWER_PRIVATE_KEY: PrivateKey.optional(),

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
      const keys = [
        e.LEDGER_REGISTRAR_PRIVATE_KEY,
        e.LEDGER_SCHOOL_ADMIN_PRIVATE_KEY,
        e.LEDGER_REVIEWER_PRIVATE_KEY,
      ].filter(Boolean);
      return new Set(keys).size === keys.length;
    },
    { message: "Registrar, school admin and reviewer private keys must all differ." },
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
