import { eq } from "drizzle-orm";
import {
  computeCommitment,
  newSalt,
  can,
  type IsoDateTime,
  type LedgerPort,
  type ReportCategory,
  type ReportDocument,
} from "@/shared";
import type { ReportRow } from "../../../database/schema";
import { schema, type Db } from "../db";
import type { EvidenceStore } from "../evidence/store";
import type { CheckedUpload } from "../evidence/validate";
import { HttpError } from "../http";
import { anchor, type AnchorMode, type AnchorSpec } from "./anchor";
import {
  actorUserId,
  appendEvent,
  newId,
  nextReference,
  nowIso,
  requireInstitutionRow,
  type Actor,
} from "./common";
import { attachEvidence } from "./evidence";

export interface CreateReportInput {
  actor: Actor;
  institutionIdOrSlug: string;
  category: ReportCategory;
  title: string;
  description: string;
  location: string;
  anonymous: boolean;
  uploads: CheckedUpload[];
  /* Seeding only. */
  at?: IsoDateTime;
  id?: string;
  reference?: string;
  anchorMode?: AnchorMode;
}

/**
 * `POST /api/reports`: write the report, its salted commitment document, the
 * `report_registered` event and the evidence, then `registerReport` and
 * `registerEvidence` per file.
 */
export async function createReport(
  deps: { db: Db; ledger: LedgerPort; store: EvidenceStore },
  input: CreateReportInput,
): Promise<ReportRow> {
  if (!can(input.actor.role, "report:create")) {
    throw new HttpError("forbidden", "Only a community reporter can open a report.");
  }
  const at = input.at ?? nowIso();
  const institution = await requireInstitutionRow(deps.db, input.institutionIdOrSlug);
  const id = input.id ?? newId();
  const document: ReportDocument = {
    type: "report",
    reportId: id,
    institutionId: institution.id,
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    createdAt: at,
    salt: newSalt(),
  };
  const commitment = await computeCommitment(document);

  return deps.db.transaction(async (tx) => {
    const report: ReportRow = {
      id,
      reference: input.reference ?? (await nextReference(tx, at)),
      institutionId: institution.id,
      category: input.category,
      title: document.title,
      description: document.description,
      location: input.location.trim(),
      status: "submitted",
      endorsementCount: 0,
      hasInterimProtection: false,
      reporterId: input.anonymous ? null : actorUserId(input.actor),
      commitment,
      receipt: null,
      createdAt: at,
      updatedAt: at,
    };
    await tx.insert(schema.reports).values(report);
    await tx.insert(schema.commitmentDocuments).values({
      recordId: id,
      reportId: id,
      type: "report",
      commitment,
      document,
      createdAt: at,
    });
    const event = await appendEvent(tx, {
      reportId: id,
      type: "report_registered",
      actor: input.anonymous ? null : input.actor,
      actorRole: "reporter",
      occurredAt: at,
      anchoredValue: commitment,
      note: input.anonymous
        ? "Reported anonymously."
        : `Reported by ${input.actor.publicLabel}.`,
    });
    const specs: AnchorSpec[] = [
      {
        reportId: id,
        operation: "registerReport",
        payload: { reportId: id, institutionId: institution.id, commitment },
        targetKind: "report",
        targetId: id,
        eventId: event.id,
      },
    ];
    const attached = await attachEvidence(tx, deps.store, {
      report,
      uploads: input.uploads,
      purpose: "problem",
      actor: input.actor,
      at,
    });
    specs.push(...attached.specs);
    await anchor(tx, deps.ledger, specs, input.anchorMode ?? "sync", at);
    const [fresh] = await tx
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.id, id));
    return fresh;
  });
}
