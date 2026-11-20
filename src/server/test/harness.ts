/**
 * Test harness: an in-memory PGlite database seeded through a memory ledger,
 * a memory evidence store, and helpers to call route handlers with
 * `Request` objects as a signed-in demo account.
 */
import { eq } from "drizzle-orm";
import { LedgerError, type BlockchainReceipt, type LedgerPort } from "@/shared";
import { createSessionToken, sessionSecret } from "../auth/session";
import { setContext, type ServerContext } from "../context";
import { openDb, schema } from "../db";
import { loadEnv } from "../env";
import { createMemoryStore } from "../evidence/store";
import { createMemoryLedger } from "../ledger/memory";
import { runSeed } from "../seed";
import { syntheticPng } from "../seed/image";

export interface LedgerCall {
  method: string;
  args: unknown[];
}

/** A memory ledger that records every call and can be switched off (RPC down). */
export function instrumentedLedger(): LedgerPort & {
  calls: LedgerCall[];
  down: boolean;
} {
  const inner = createMemoryLedger();
  const calls: LedgerCall[] = [];
  const state = { calls, down: false };
  const wrap =
    <K extends keyof LedgerPort>(method: K) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      if (state.down && method !== "info") {
        throw new LedgerError("rpc_unavailable", null, "simulated RPC outage");
      }
      return (inner[method] as (...a: unknown[]) => unknown)(...args);
    };
  return Object.assign(state, {
    info: inner.info,
    registerReport: wrap("registerReport") as LedgerPort["registerReport"],
    registerEvidence: wrap("registerEvidence") as LedgerPort["registerEvidence"],
    acknowledgeReport: wrap("acknowledgeReport") as LedgerPort["acknowledgeReport"],
    recordInterimProtection: wrap(
      "recordInterimProtection",
    ) as LedgerPort["recordInterimProtection"],
    claimRepair: wrap("claimRepair") as LedgerPort["claimRepair"],
    verifyRepair: wrap("verifyRepair") as LedgerPort["verifyRepair"],
    disputeRepair: wrap("disputeRepair") as LedgerPort["disputeRepair"],
    probeVerify: wrap("probeVerify") as LedgerPort["probeVerify"],
    statusOf: wrap("statusOf") as LedgerPort["statusOf"],
    getReceipt: wrap("getReceipt") as (
      txId: string,
      event: BlockchainReceipt["event"],
    ) => Promise<BlockchainReceipt>,
  });
}

export interface TestWorld {
  ctx: ServerContext;
  ledger: ReturnType<typeof instrumentedLedger>;
  /** Request headers that sign in the demo account with this email. */
  as(email: string): Record<string, string>;
  close(): Promise<void>;
}

export async function createTestWorld(): Promise<TestWorld> {
  const env = loadEnv({ NODE_ENV: "test", CRON_SECRET: "test-cron-secret" });
  const ledger = instrumentedLedger();
  const handle = await openDb({ pglite: "memory" });
  const ctx: ServerContext = {
    env,
    db: handle.db,
    database: handle.kind,
    ledger,
    ledgerMode: "memory",
    store: createMemoryStore(),
    secret: sessionSecret(env),
  };
  await runSeed(ctx, { freshIds: false });
  setContext(ctx);
  const ids = new Map<string, string>();
  for (const user of await ctx.db.select().from(schema.users))
    ids.set(user.email, user.id);
  return {
    ctx,
    ledger,
    as(email) {
      const id = ids.get(email);
      if (!id) throw new Error(`no demo account ${email}`);
      return { cookie: `bona_session=${createSessionToken(id, ctx.secret)}` };
    },
    close: async () => {
      setContext(null);
      await handle.close();
    },
  };
}

export const BASE = "http://bona.test";

export function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function formRequest(
  method: string,
  path: string,
  fields: Record<string, string>,
  files: File[] = [],
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  for (const file of files) form.append("evidence", file, file.name);
  return new Request(`${BASE}${path}`, { method, headers, body: form });
}

export const params = <P extends Record<string, string>>(p: P) => ({
  params: Promise.resolve(p),
});

export const png = (label: string) =>
  new File([syntheticPng(label)], `${label}.png`, { type: "image/png" });

export const notAnImage = (name = "renamed.jpg") =>
  new File([new TextEncoder().encode("#!/bin/sh\necho definitely not a jpeg\n")], name, {
    type: "image/jpeg",
  });

export async function body<T = unknown>(response: Response): Promise<T> {
  const json = (await response.json()) as { data?: T; error?: unknown };
  return ("data" in json ? json.data : json) as T;
}

export async function reportByReference(world: TestWorld, reference: string) {
  const [row] = await world.ctx.db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.reference, reference));
  return row;
}

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const HEX32 = /^0x[0-9a-f]{64}$/;
