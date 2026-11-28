/**
 * The guided demo: one fresh sample repair case per visitor, made from a fixed
 * template, and one-tap sign-in as the five demo people (School, Funder,
 * Contractor, Reviewer, Public). The people are demo accounts; the Solana
 * program and its transactions are real (devnet, sandbox rand).
 *
 * The visitor's case is remembered in a signed cookie (`bona_demo`), so a
 * browser keeps its case until it finishes or restarts. New cases are capped
 * (./limits.ts) because funding a case spends devnet SOL.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { address } from "@solana/kit";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import type { DemoPerson } from "@/features/demo/steps";
import { createDemoSearch } from "@/server/price-check/fixtures";
import { checkInvoicePrices } from "@/server/price-check/service";
import type { PriceCheckResult } from "@/shared/price-check";
import { getSolanaRpc } from "@/server/solana/rpc";
import { devnetConfig } from "@/server/solana/network";

import type { LearnerImpact, ReportRow } from "../../../database/schema";
import {
  createSessionToken,
  sessionCookie,
  sessionFor,
  toSession,
  type Session,
} from "../auth/session";
import type { ServerContext } from "../context";
import { schema } from "../db";
import {
  escrowDeps,
  findEscrowCase,
  loadPublicEscrow,
  loadRepairBudget,
  type PublicEscrow,
  type PublicRepairBudget,
} from "../escrow";
import { HttpError } from "../http";
import { actorOf, requireInstitutionRow, type Actor } from "../reports/common";
import { createReport } from "../reports/create";
import {
  IpWindow,
  clientIp,
  demoModeOn,
  mayCreateCase,
  readDemoLimits,
  type DemoLimits,
} from "./limits";

// ---------------------------------------------------------------- template

export type DemoLine = {
  lineId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  kind: "material" | "service";
};

/**
 * The sample case. The material lines add up to Check 1 (released to the
 * supplier who delivers them), the labour line to Check 2 (released to the
 * contractor). Prices are set within the recorded shop prices.
 */
export const DEMO_TEMPLATE = {
  school: "thandolwethu-primary",
  reporterEmail: "zanele@community.demo",
  category: "sanitation" as const,
  title: "Leaking toilets in the Grade 3 block",
  location: "Grade 3 toilet block, behind the hall",
  description:
    "Two of the four toilets in the Grade 3 block leak at the cistern and do not flush, so 380 learners share the two that work. The floor is always wet and the drain pipe is cracked. Learners queue for the whole break or go home early.",
  reportNote:
    "Checked by the school today. Two cisterns leak and the drain pipe is cracked. The block is closed until it is fixed.",
  lines: [
    {
      lineId: "CIST-9L",
      description: "Toilet cistern 9 litre white",
      quantity: 2,
      unitPriceCents: 95_000,
      kind: "material",
    },
    {
      lineId: "FLUSH-DUAL",
      description: "Dual flush valve",
      quantity: 2,
      unitPriceCents: 30_000,
      kind: "material",
    },
    {
      lineId: "PVC-110",
      description: "PVC sewer pipe 110mm x 6m",
      quantity: 1,
      unitPriceCents: 50_000,
      kind: "material",
    },
    {
      lineId: "LAB-PLUMB",
      description: "Plumber: fit, test and seal",
      quantity: 1,
      unitPriceCents: 200_000,
      kind: "service",
    },
  ] satisfies DemoLine[],
  claimNotes: [
    "Delivered to the school today, as on the invoice: 2 toilet cisterns (9 litre), 2 dual flush valves and 1 PVC sewer pipe (110 mm).",
    "The plumber fitted both cisterns and valves and replaced the drain pipe. All four toilets flush and nothing leaks.",
  ],
  schoolDoneNote:
    "The plumber finished today. All four toilets flush and the floor is dry. The block is open again.",
  challengeSeconds: 60,
  impact: {
    learners: 380,
    since: "About 3 weeks",
    instead: ["Queue for the 2 that work", "Miss class time"],
    danger: "unhealthy",
  },
} as const;

/** [Check 1 materials, Check 2 labour], cents. */
export function templateAmounts(
  lines: readonly DemoLine[] = DEMO_TEMPLATE.lines,
): [number, number] {
  let materials = 0;
  let labour = 0;
  for (const l of lines) {
    if (l.kind === "material") materials += l.quantity * l.unitPriceCents;
    else labour += l.quantity * l.unitPriceCents;
  }
  return [materials, labour];
}

/** The demo person behind each one-tap sign-in. "public" signs out. */
export const DEMO_PERSON_EMAIL: Record<Exclude<DemoPerson, "public">, string> = {
  school: "admin@thandolwethu.demo",
  funder: "buyer@vaalridge.demo",
  contractor: "supplier@emseni-supplies.demo",
  reviewer: "reviewer@vaalridge.demo",
};

// ------------------------------------------------------------------ cookie

export const DEMO_COOKIE = "bona_demo";
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

export type DemoCookie = {
  /** The visitor's case (report id). */
  caseId: string;
  /** New cases this browser has made. */
  made: number;
  /** True when the visitor watches a shared case because the limits were reached. */
  shared: boolean;
};

const mac = (payload: string, secret: string) =>
  createHmac("sha256", `bona-demo:${secret}`).update(payload).digest("base64url");

export function encodeDemoCookie(value: DemoCookie, secret: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ ...value, exp: now + DEMO_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${mac(payload, secret)}`;
}

export function decodeDemoCookie(
  token: string | null,
  secret: string,
  now = Date.now(),
): DemoCookie | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(mac(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
      string,
      unknown
    >;
    if (typeof v.caseId !== "string" || typeof v.exp !== "number" || v.exp < now)
      return null;
    return {
      caseId: v.caseId,
      made: typeof v.made === "number" ? v.made : 0,
      shared: v.shared === true,
    };
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

export function readDemoCookie(request: Request, secret: string): DemoCookie | null {
  return decodeDemoCookie(cookieValue(request, DEMO_COOKIE), secret);
}

export function demoCookieHeader(token: string | null, secure: boolean): string {
  const base = `${DEMO_COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  return token ? `${base}; Max-Age=${DEMO_TTL_MS / 1000}` : `${base}; Max-Age=0`;
}

// ------------------------------------------------------------------- guard

export function requireDemoMode(): DemoLimits {
  if (!demoModeOn()) throw new HttpError("not_found", "Not found.");
  return readDemoLimits();
}

// ------------------------------------------------------------------- state

export type GuidedDemo = {
  caseId: string;
  reference: string;
  title: string;
  description: string;
  location: string;
  schoolName: string;
  /** Stored status: submitted, acknowledged, repair_claimed, verified... */
  status: string;
  impact: LearnerImpact | null;
  budget: PublicRepairBudget | null;
  escrow: PublicEscrow | null;
  /** Set when the escrow could not be read; the steps fall back on it. */
  escrowError: string | null;
  /** True when this visitor watches a shared case (the limits were reached). */
  shared: boolean;
  template: {
    lines: DemoLine[];
    amounts: [number, number];
    claimNotes: readonly [string, string];
    reportNote: string;
    schoolDoneNote: string;
    challengeSeconds: number;
  };
};

async function findDemoReport(
  ctx: ServerContext,
  caseId: string,
): Promise<ReportRow | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.id, caseId))
    .limit(1);
  return row ?? null;
}

export async function loadGuidedDemo(
  ctx: ServerContext,
  cookie: DemoCookie,
): Promise<GuidedDemo | null> {
  const report = await findDemoReport(ctx, cookie.caseId);
  if (!report) return null;
  const [institution] = await ctx.db
    .select({ name: schema.institutions.name })
    .from(schema.institutions)
    .where(eq(schema.institutions.id, report.institutionId))
    .limit(1);
  let escrow: PublicEscrow | null = null;
  let escrowError: string | null = null;
  if (await findEscrowCase(ctx.db, report.id)) {
    try {
      escrow = await loadPublicEscrow(await escrowDeps(), report.id);
    } catch (error) {
      escrowError =
        error instanceof HttpError ? error.message : "Solana devnet could not be read.";
    }
  }
  return {
    caseId: report.id,
    reference: report.reference,
    title: report.title,
    description: report.description,
    location: report.location,
    schoolName: institution?.name ?? "",
    status: report.status,
    impact: report.impact ?? null,
    budget: await loadRepairBudget(ctx.db, report.id),
    escrow,
    escrowError,
    shared: cookie.shared,
    template: {
      lines: [...DEMO_TEMPLATE.lines],
      amounts: templateAmounts(),
      claimNotes: DEMO_TEMPLATE.claimNotes,
      reportNote: DEMO_TEMPLATE.reportNote,
      schoolDoneNote: DEMO_TEMPLATE.schoolDoneNote,
      challengeSeconds: DEMO_TEMPLATE.challengeSeconds,
    },
  };
}

// --------------------------------------------------------------- sign in

async function userByEmail(ctx: ServerContext, email: string) {
  const [user] = await ctx.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user)
    throw new HttpError("unauthenticated", "That demo person is not set up yet.");
  return user;
}

/** Signs in as a demo person (no password), or signs out for "public". */
export async function signInAsPerson(
  ctx: ServerContext,
  person: DemoPerson,
): Promise<{ session: Session | null; cookie: string }> {
  const secure = ctx.env.NODE_ENV === "production";
  if (person === "public") return { session: null, cookie: sessionCookie(null, secure) };
  const user = await userByEmail(ctx, DEMO_PERSON_EMAIL[person]);
  return {
    session: toSession(sessionFor(user)),
    cookie: sessionCookie(createSessionToken(user.id, ctx.secret), secure),
  };
}

// ------------------------------------------------------------------- start

const ipWindow = new IpWindow();

/** Below this many lamports on the feepayer or the admin key, new cases wait. */
export async function demoWalletLow(minLamports: bigint): Promise<boolean> {
  if (minLamports <= BigInt(0)) return false;
  try {
    const network = devnetConfig();
    const rpc = getSolanaRpc();
    for (const who of [network.feepayer, network.admin]) {
      const { value } = await rpc
        .getBalance(address(who), { commitment: "confirmed" })
        .send();
      if (BigInt(value) < minLamports) {
        console.warn(
          `[demo] devnet SOL is low: ${who} holds ${value} lamports (minimum ${minLamports}). New demo cases are paused.`,
        );
        return true;
      }
    }
    return false;
  } catch {
    // If the balance cannot be read, let the chain steps report what happens.
    return false;
  }
}

export const LOW_SOL_MESSAGE = "Demo wallet needs a top-up, try again later.";

async function countRecentDemoCases(ctx: ServerContext, since: string): Promise<number> {
  const [row] = await ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(schema.reports)
    .where(
      and(
        eq(schema.reports.title, DEMO_TEMPLATE.title),
        gte(schema.reports.createdAt, since),
      ),
    );
  return Number(row?.count ?? 0);
}

async function latestDemoCase(ctx: ServerContext): Promise<ReportRow | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.title, DEMO_TEMPLATE.title))
    .orderBy(desc(schema.reports.createdAt))
    .limit(1);
  return row ?? null;
}

async function createDemoCase(ctx: ServerContext): Promise<ReportRow> {
  const reporter = actorOf(await userByEmail(ctx, DEMO_TEMPLATE.reporterEmail));
  return createReport(
    { db: ctx.db, ledger: ctx.ledger, store: ctx.store },
    {
      actor: reporter,
      institutionIdOrSlug: DEMO_TEMPLATE.school,
      category: DEMO_TEMPLATE.category,
      title: DEMO_TEMPLATE.title,
      description: DEMO_TEMPLATE.description,
      location: DEMO_TEMPLATE.location,
      anonymous: true,
      impact: { ...DEMO_TEMPLATE.impact, instead: [...DEMO_TEMPLATE.impact.instead] },
      uploads: [],
    },
  );
}

export type StartOutcome = {
  cookie: DemoCookie;
  /** True when a new case was made by this call. */
  created: boolean;
  /** A plain sentence when the visitor did not get what they asked for. */
  notice: string | null;
};

/**
 * Starts (or picks up) this browser's guided demo. Without `restart` an
 * existing case is reused. A new case is made only within the limits;
 * otherwise the visitor keeps their case, or watches the latest shared one.
 */
export async function startGuidedDemo(
  ctx: ServerContext,
  input: {
    request: Request;
    existing: DemoCookie | null;
    restart: boolean;
    limits: DemoLimits;
    /** Whether `existing.caseId` is finished (done or off the path). */
    existingFinished: boolean;
    now?: number;
  },
): Promise<StartOutcome> {
  const now = input.now ?? Date.now();
  const { existing, limits } = input;
  const existingReport = existing ? await findDemoReport(ctx, existing.caseId) : null;
  if (existing && existingReport && !input.restart && !input.existingFinished) {
    return { cookie: existing, created: false, notice: null };
  }

  const ip = clientIp(input.request);
  const since = new Date(now - 3_600_000).toISOString();
  const decision = mayCreateCase(
    {
      session: existing?.made ?? 0,
      ipLastHour: ipWindow.count(ip, now),
      globalLastHour: await countRecentDemoCases(ctx, since),
    },
    limits,
  );
  let notice: string | null = null;
  if (decision.ok && (await demoWalletLow(limits.minLamports))) {
    notice = LOW_SOL_MESSAGE;
  } else if (decision.ok) {
    const report = await createDemoCase(ctx);
    ipWindow.record(ip, now);
    return {
      cookie: { caseId: report.id, made: (existing?.made ?? 0) + 1, shared: false },
      created: true,
      notice: null,
    };
  } else {
    notice = decision.message;
  }

  // No new case: keep the visitor's own, or show the latest shared one.
  if (existing && existingReport) {
    return { cookie: existing, created: false, notice };
  }
  const shared = await latestDemoCase(ctx);
  if (!shared)
    throw new HttpError("conflict", notice ?? "The demo cannot start right now.");
  return {
    cookie: { caseId: shared.id, made: existing?.made ?? 0, shared: true },
    created: false,
    notice: `${notice} You are watching the latest shared sample case instead.`,
  };
}

// ------------------------------------------------------------------- scope

let priceCheck: Promise<PriceCheckResult> | null = null;

/** The template's price check against the recorded South African shop prices. */
export function demoPriceCheck(): Promise<PriceCheckResult> {
  priceCheck ??= checkInvoicePrices(
    {
      lines: DEMO_TEMPLATE.lines.map((l) => ({
        lineId: l.lineId,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        vatInclusive: true,
        kind: l.kind,
      })),
    },
    { search: createDemoSearch() },
  ).catch((error) => {
    priceCheck = null;
    throw error;
  });
  return priceCheck;
}

/**
 * The school confirms the job and its prices. Check 1 is the material lines
 * (released to the supplier on verified delivery), Check 2 the labour.
 */
export async function confirmDemoScope(
  ctx: ServerContext,
  input: { caseId: string; actor: Actor },
): Promise<PublicRepairBudget> {
  const report = await findDemoReport(ctx, input.caseId);
  if (!report) throw new HttpError("not_found", "The demo case was not found.");
  const school = await requireInstitutionRow(ctx.db, DEMO_TEMPLATE.school);
  if (input.actor.role !== "school_admin" || input.actor.institutionId !== school.id) {
    throw new HttpError("forbidden", "Switch to the School to confirm the job.");
  }
  const [materials, labour] = templateAmounts();
  const row = {
    reportId: report.id,
    totalCents: materials + labour,
    materialsCents: materials,
    completionCents: labour,
    lines: DEMO_TEMPLATE.lines.map(({ description, quantity, kind, unitPriceCents }) => ({
      description,
      quantity,
      kind,
      unitPriceCents,
    })),
    confirmedBy: input.actor.id,
    confirmedAt: new Date().toISOString(),
  };
  await ctx.db
    .insert(schema.repairBudgets)
    .values(row)
    .onConflictDoUpdate({ target: schema.repairBudgets.reportId, set: row });
  const budget = await loadRepairBudget(ctx.db, report.id);
  if (!budget) throw new HttpError("conflict", "The budget was not saved. Try again.");
  return budget;
}
