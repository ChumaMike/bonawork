/**
 * "This looks like an existing report": token overlap within the same
 * school, same algorithm as the frontend fixture so the two behave alike.
 * Verified reports are excluded — a fault that returns after a verified
 * repair is new information (TS-02).
 */
import { and, eq, ne } from "drizzle-orm";
import type { ReportCategory } from "@/shared";
import type { ReportRow } from "../../../database/schema";
import { schema, type Db } from "../db";

const STOP_WORDS = new Set(
  "the and are has have with that this from they them there their were been for not but into near when since school".split(
    " ",
  ),
);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
    .map((word) => word.replace(/(ing|ed|s)$/, ""));
}

export function scoreSimilarity(
  report: Pick<ReportRow, "title" | "description" | "location" | "category">,
  wanted: Set<string>,
  category?: ReportCategory,
): number {
  const overlap = words(
    `${report.title} ${report.description} ${report.location}`,
  ).filter((w) => wanted.has(w)).length;
  if (overlap === 0) return 0;
  return overlap + (category && report.category === category ? 1 : 0);
}

export async function findSimilarReports(
  db: Db,
  input: {
    institutionId: string;
    text: string;
    category?: ReportCategory;
    limit?: number;
  },
): Promise<ReportRow[]> {
  const wanted = new Set(words(input.text));
  if (wanted.size === 0) return [];
  const candidates = await db
    .select()
    .from(schema.reports)
    .where(
      and(
        eq(schema.reports.institutionId, input.institutionId),
        ne(schema.reports.status, "verified"),
      ),
    );
  return candidates
    .map((report) => ({ report, score: scoreSimilarity(report, wanted, input.category) }))
    .filter((c) => c.score >= 1)
    .sort(
      (a, b) => b.score - a.score || b.report.updatedAt.localeCompare(a.report.updatedAt),
    )
    .slice(0, input.limit ?? 3)
    .map((c) => c.report);
}
