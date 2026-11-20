import { and, eq, sql } from "drizzle-orm";
import { can, type IsoDateTime } from "@/shared";
import { schema, type Db } from "../db";
import { HttpError } from "../http";
import { newId, nowIso, requireReport, type Actor } from "./common";

export interface EndorsementResult {
  endorsements: number;
  endorsedByMe: boolean;
}

/**
 * `PUT /api/issues/:id/endorsement` — "I'm affected too". One per user per
 * report, never on your own report, never by staff. Endorsements are not
 * evidence and are not written on-chain.
 */
export async function setEndorsement(
  db: Db,
  input: {
    reportIdOrReference: string;
    actor: Actor;
    affected: boolean;
    at?: IsoDateTime;
  },
): Promise<EndorsementResult> {
  if (!can(input.actor.role, "report:endorse")) {
    throw new HttpError("forbidden", "Only community members can endorse a report.");
  }
  const at = input.at ?? nowIso();
  return db.transaction(async (tx) => {
    const report = await requireReport(tx, input.reportIdOrReference);
    if (report.reporterId === input.actor.id) {
      throw new HttpError("forbidden", "You cannot endorse your own report.");
    }
    const [existing] = await tx
      .select({ id: schema.endorsements.id })
      .from(schema.endorsements)
      .where(
        and(
          eq(schema.endorsements.reportId, report.id),
          eq(schema.endorsements.userId, input.actor.id),
        ),
      )
      .limit(1);
    if (input.affected && !existing) {
      await tx.insert(schema.endorsements).values({
        id: newId(),
        reportId: report.id,
        userId: input.actor.id,
        createdAt: at,
      });
    } else if (!input.affected && existing) {
      await tx.delete(schema.endorsements).where(eq(schema.endorsements.id, existing.id));
    }
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(schema.endorsements)
      .where(eq(schema.endorsements.reportId, report.id));
    const endorsements = Number(count);
    await tx
      .update(schema.reports)
      .set({ endorsementCount: endorsements })
      .where(eq(schema.reports.id, report.id));
    return { endorsements, endorsedByMe: input.affected };
  });
}
