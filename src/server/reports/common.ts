/**
 * Shared pieces of the report services: actors, timestamps, loading a report
 * with everything attached to it, and appending case events.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { IdSchema, type CaseEventType, type IsoDateTime, type UserRole } from "@/shared";
import { schema, type Db } from "../db";
import type {
  CaseEventRow,
  EvidenceRow,
  IndependentReviewRow,
  InstitutionRow,
  InterimProtectionRow,
  RepairClaimRow,
  ReportRow,
  UserRow,
} from "../../../database/schema";
import { HttpError } from "../http";

export interface Actor {
  id: string;
  role: UserRole;
  /** What the public sees, e.g. "Reporter R-7F3A" or "School admin". */
  publicLabel: string;
  institutionId: string | null;
}

/**
 * A signed-out visitor reporting or adding problem evidence. `id` is empty:
 * nothing is attributed to an account and the public sees "Reporter".
 */
export const GUEST_REPORTER: Actor = {
  id: "",
  role: "reporter",
  publicLabel: "Reporter",
  institutionId: null,
};

/** The account to attribute a write to; `null` for a signed-out visitor. */
export const actorUserId = (actor: Actor): string | null => actor.id || null;

export const actorOf = (user: UserRow): Actor => ({
  id: user.id,
  role: user.role,
  publicLabel: user.publicLabel,
  institutionId: user.institutionId,
});

export const nowIso = (): IsoDateTime => new Date().toISOString();
export const newId = (): string => randomUUID();
export const isUuid = (value: string): boolean => IdSchema.safeParse(value).success;

/** Everything the view model needs about one report. */
export interface IssueBundle {
  report: ReportRow;
  institution: InstitutionRow;
  events: CaseEventRow[];
  evidence: EvidenceRow[];
  protections: InterimProtectionRow[];
  claims: RepairClaimRow[];
  reviews: IndependentReviewRow[];
  endorserIds: string[];
  /** Public labels of reviewers, by user id. */
  labels: Record<string, string>;
}

/* --------------------------------- Lookups --------------------------------- */

export async function findInstitution(
  db: Db,
  idOrSlug: string,
): Promise<InstitutionRow | null> {
  const where = isUuid(idOrSlug)
    ? eq(schema.institutions.id, idOrSlug)
    : eq(schema.institutions.slug, idOrSlug);
  const [row] = await db.select().from(schema.institutions).where(where).limit(1);
  return row ?? null;
}

export async function requireInstitutionRow(
  db: Db,
  idOrSlug: string,
): Promise<InstitutionRow> {
  const row = await findInstitution(db, idOrSlug);
  if (!row) throw new HttpError("not_found", `Unknown school: ${idOrSlug}`);
  return row;
}

export async function findReport(
  db: Db,
  idOrReference: string,
): Promise<ReportRow | null> {
  const key = idOrReference.trim();
  const where = isUuid(key)
    ? eq(schema.reports.id, key)
    : eq(schema.reports.reference, key.toUpperCase());
  const [row] = await db.select().from(schema.reports).where(where).limit(1);
  return row ?? null;
}

export async function requireReport(db: Db, idOrReference: string): Promise<ReportRow> {
  const row = await findReport(db, idOrReference);
  if (!row) throw new HttpError("not_found", `Unknown report: ${idOrReference}`);
  return row;
}

/** Load bundles for the given reports, in the order given. */
export async function loadBundles(
  db: Db,
  reportRows: ReportRow[],
): Promise<IssueBundle[]> {
  if (reportRows.length === 0) return [];
  const ids = reportRows.map((r) => r.id);
  const institutionIds = [...new Set(reportRows.map((r) => r.institutionId))];
  const [institutions, events, evidence, protections, claims, reviews, endorsements] =
    await Promise.all([
      db
        .select()
        .from(schema.institutions)
        .where(inArray(schema.institutions.id, institutionIds)),
      db
        .select()
        .from(schema.caseEvents)
        .where(inArray(schema.caseEvents.reportId, ids))
        .orderBy(asc(schema.caseEvents.sequence)),
      db
        .select()
        .from(schema.evidenceCommitments)
        .where(inArray(schema.evidenceCommitments.reportId, ids))
        .orderBy(asc(schema.evidenceCommitments.version)),
      db
        .select()
        .from(schema.interimProtections)
        .where(inArray(schema.interimProtections.reportId, ids))
        .orderBy(asc(schema.interimProtections.createdAt)),
      db
        .select()
        .from(schema.repairClaims)
        .where(inArray(schema.repairClaims.reportId, ids))
        .orderBy(asc(schema.repairClaims.index)),
      db
        .select()
        .from(schema.independentReviews)
        .where(inArray(schema.independentReviews.reportId, ids))
        .orderBy(asc(schema.independentReviews.createdAt)),
      db
        .select({
          reportId: schema.endorsements.reportId,
          userId: schema.endorsements.userId,
        })
        .from(schema.endorsements)
        .where(inArray(schema.endorsements.reportId, ids)),
    ]);
  const reviewerIds = [...new Set(reviews.map((r) => r.reviewerId))];
  const reviewers = reviewerIds.length
    ? await db
        .select({ id: schema.users.id, publicLabel: schema.users.publicLabel })
        .from(schema.users)
        .where(inArray(schema.users.id, reviewerIds))
    : [];
  const labels = Object.fromEntries(reviewers.map((u) => [u.id, u.publicLabel]));
  const byInstitution = new Map(institutions.map((i) => [i.id, i]));
  const group = <T extends { reportId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.reportId) ?? [];
      list.push(row);
      map.set(row.reportId, list);
    }
    return map;
  };
  const g = {
    events: group(events),
    evidence: group(evidence),
    protections: group(protections),
    claims: group(claims),
    reviews: group(reviews),
    endorsements: group(endorsements),
  };
  return reportRows.map((report) => ({
    report,
    institution: byInstitution.get(report.institutionId)!,
    events: g.events.get(report.id) ?? [],
    evidence: g.evidence.get(report.id) ?? [],
    protections: g.protections.get(report.id) ?? [],
    claims: g.claims.get(report.id) ?? [],
    reviews: g.reviews.get(report.id) ?? [],
    endorserIds: (g.endorsements.get(report.id) ?? []).map((e) => e.userId),
    labels,
  }));
}

export async function loadBundle(db: Db, reportId: string): Promise<IssueBundle> {
  const report = await requireReport(db, reportId);
  const [bundle] = await loadBundles(db, [report]);
  return bundle;
}

/* ------------------------------- Case events ------------------------------- */

export interface NewEvent {
  reportId: string;
  type: CaseEventType;
  actor: Actor | null;
  actorRole: UserRole;
  occurredAt: IsoDateTime;
  subjectId?: string | null;
  anchoredValue?: string | null;
  statusTo?: "in_progress" | "rejected" | null;
  reason?: string | null;
  note: string;
}

/** Append the next event in a report's timeline (sequence is gap-free). */
export async function appendEvent(tx: Db, input: NewEvent): Promise<CaseEventRow> {
  const [last] = await tx
    .select({ max: sql<number | null>`max(${schema.caseEvents.sequence})` })
    .from(schema.caseEvents)
    .where(eq(schema.caseEvents.reportId, input.reportId));
  const sequence =
    last?.max === null || last?.max === undefined ? 0 : Number(last.max) + 1;
  const row = {
    id: newId(),
    reportId: input.reportId,
    sequence,
    type: input.type,
    actorId: input.actor ? actorUserId(input.actor) : null,
    actorRole: input.actorRole,
    occurredAt: input.occurredAt,
    subjectId: input.subjectId ?? null,
    anchoredValue: input.anchoredValue ?? null,
    statusTo: input.statusTo ?? null,
    reason: input.reason ?? null,
    note: input.note,
    receipt: null,
  };
  await tx.insert(schema.caseEvents).values(row);
  return row;
}

/** Update the report's status and `updatedAt`. */
export async function setStatus(
  tx: Db,
  reportId: string,
  status: ReportRow["status"],
  at: IsoDateTime,
): Promise<void> {
  await tx
    .update(schema.reports)
    .set({ status, updatedAt: at })
    .where(eq(schema.reports.id, reportId));
}

export async function touch(tx: Db, reportId: string, at: IsoDateTime): Promise<void> {
  await tx
    .update(schema.reports)
    .set({ updatedAt: at })
    .where(eq(schema.reports.id, reportId));
}

/* ------------------------------- References -------------------------------- */

export const formatReference = (year: number, number: number): string =>
  `BB-${year}-${String(number).padStart(6, "0")}`;

/** The next free `BB-YYYY-NNNNNN` for this year. */
export async function nextReference(tx: Db, at: IsoDateTime): Promise<string> {
  const year = new Date(at).getUTCFullYear();
  const [latest] = await tx
    .select({ reference: schema.reports.reference })
    .from(schema.reports)
    .where(and(like(schema.reports.reference, `BB-${year}-%`)))
    .orderBy(desc(schema.reports.reference))
    .limit(1);
  const last = latest ? Number(latest.reference.slice(-6)) : 0;
  return formatReference(year, last + 1);
}
