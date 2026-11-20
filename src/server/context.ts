/**
 * Everything a request needs, built once per process: the environment, the
 * database (migrated and seeded), the ledger and the evidence store. Tests
 * replace it with `setContext()`; `next dev` keeps it across hot reloads on
 * `globalThis` so PGlite is never opened twice on the same directory.
 */
import { createLedger, ledgerMode, type LedgerMode } from "@/blockchain";
import type { LedgerPort } from "@/shared";
import { sessionSecret } from "./auth/session";
import { openDb, type DatabaseKind, type Db } from "./db";
import { env, type Env } from "./env";
import { createEvidenceStore, type EvidenceStore } from "./evidence/store";
import { seedIfEmpty } from "./seed";

export interface ServerContext {
  env: Env;
  db: Db;
  database: DatabaseKind;
  ledger: LedgerPort;
  ledgerMode: LedgerMode;
  store: EvidenceStore;
  /** Session signing secret (resolved once so the warning prints once). */
  secret: string;
}

const slot = globalThis as unknown as { __bonaContext?: Promise<ServerContext> };

export function getContext(): Promise<ServerContext> {
  slot.__bonaContext ??= build().catch((error) => {
    slot.__bonaContext = undefined;
    throw error;
  });
  return slot.__bonaContext;
}

/** Replace the process context (tests). */
export function setContext(context: ServerContext | null): void {
  slot.__bonaContext = context ? Promise.resolve(context) : undefined;
}

async function build(): Promise<ServerContext> {
  const e = env();
  const ledger = createLedger(e);
  const pglite =
    e.NODE_ENV === "test" || (e.VERCEL && !e.DATABASE_URL) ? "memory" : e.PGLITE_DATA_DIR;
  if (!e.DATABASE_URL) {
    console.info(
      pglite === "memory"
        ? "[db] DATABASE_URL is not set; using an in-memory PGlite database (data is lost on restart)."
        : `[db] DATABASE_URL is not set; using PGlite at ${pglite}.`,
    );
  }
  const { db, kind } = await openDb({ url: e.DATABASE_URL, pglite });
  const context: ServerContext = {
    env: e,
    db,
    database: kind,
    ledger,
    ledgerMode: ledgerMode(e),
    store: createEvidenceStore(e),
    secret: sessionSecret(e),
  };
  await seedIfEmpty(context);
  return context;
}
