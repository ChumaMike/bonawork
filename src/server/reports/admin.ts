/**
 * School administrator actions: assessment (acknowledge), progress, decline,
 * interim protection and repair claims. Each validates the move with
 * `canTransition` / `PERMISSION_FOR_STATUS`, writes the record and its case
 * event in one transaction, then anchors (see `anchor.ts`).
 */
import { eq, sql } from "drizzle-orm";
import {
  PERMISSION_FOR_STATUS,
  canTransition,
  can,
  computeCommitment,
  newSalt,
  type InterimProtectionDocument,
  type IsoDateTime,
  type LedgerPort,
  type RepairClaimDocument,
  type ReportStatus,
} from "@/shared";
import type { ReportRow } from "../../../database/schema";
import { schema, type Db } from "../db";
import type { EvidenceStore } from "../evidence/store";
import type { CheckedUpload } from "../evidence/validate";
import { HttpError } from "../http";
import { anchor, type AnchorMode, type AnchorSpec } from "./anchor";
import {
  appendEvent,
  newId,
  nowIso,
  requireReport,
  setStatus,
  touch,
  type Actor,
} from "./common";
import { attachEvidence } from "./evidence";

interface Deps {
  db: Db;
  ledger: LedgerPort;
  store: EvidenceStore;
}

interface BaseInput {
  reportIdOrReference: string;
  actor: Actor;
  at?: IsoDateTime;
  anchorMode?: AnchorMode;
}

/** Load the report and check the actor may act on it as its school's administrator. */
async function requireOwnReport(tx: Db, input: BaseInput): Promise<ReportRow> {
  const report = await requireReport(tx, input.reportIdOrReference);
  if (
    input.actor.role === "school_admin" &&
    input.actor.institutionId !== report.institutionId
  ) {
    throw new HttpError("forbidden", "This report belongs to another institution.");
  }
  return report;
}

function requireMove(actor: Actor, report: ReportRow, to: ReportStatus): void {
  const permission = PERMISSION_FOR_STATUS[to];
  if (!can(actor.role, permission)) {
    throw new HttpError("forbidden", `Your role (${actor.role}) cannot ${permission}.`);
  }
  if (!canTransition(report.status, to)) {
    throw new HttpError(
      "invalid_transition",
      `A report that is ${report.status.replace("_", " ")} cannot become ${to.replace("_", " ")}.`,
    );
  }
}

/** `POST /api/issues/:id/assessment`: submitted → acknowledged, `acknowledgeReport`. */
export async function startAssessment(deps: Deps, input: BaseInput & { note: string }) {
  const at = input.at ?? nowIso();
  return deps.db.transaction(async (tx) => {
    const report = await requireOwnReport(tx, input);
    requireMove(input.actor, report, "acknowledged");
    await setStatus(tx, report.id, "acknowledged", at);
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: "report_acknowledged",
      actor: input.actor,
      actorRole: input.actor.role,
      occurredAt: at,
      note: input.note.trim(),
    });
    await anchor(
      tx,
      deps.ledger,
      [
        {
          reportId: report.id,
          operation: "acknowledgeReport",
          payload: { reportId: report.id },
          targetKind: "event",
          targetId: event.id,
          eventId: event.id,
        },
      ],
      input.anchorMode ?? "sync",
      at,
    );
    return report.id;
  });
}

/** `POST /api/issues/:id/progress`: → in_progress, off-chain only. */
export async function recordProgress(deps: Deps, input: BaseInput & { note: string }) {
  const at = input.at ?? nowIso();
  return deps.db.transaction(async (tx) => {
    const report = await requireOwnReport(tx, input);
    requireMove(input.actor, report, "in_progress");
    await setStatus(tx, report.id, "in_progress", at);
    await appendEvent(tx, {
      reportId: report.id,
      type: "status_changed",
      actor: input.actor,
      actorRole: input.actor.role,
      occurredAt: at,
      statusTo: "in_progress",
      note: input.note.trim(),
    });
    return report.id;
  });
}

/** `POST /api/issues/:id/decline`: → rejected, off-chain only, reason required and public. */
export async function declineReport(deps: Deps, input: BaseInput & { reason: string }) {
  const at = input.at ?? nowIso();
  const reason = input.reason.trim();
  if (!reason)
    throw new HttpError("invalid_input", "A reason is required to decline a report.");
  return deps.db.transaction(async (tx) => {
    const report = await requireOwnReport(tx, input);
    requireMove(input.actor, report, "rejected");
    await setStatus(tx, report.id, "rejected", at);
    await appendEvent(tx, {
      reportId: report.id,
      type: "status_changed",
      actor: input.actor,
      actorRole: input.actor.role,
      occurredAt: at,
      statusTo: "rejected",
      reason,
      note: `Declined by the school: ${reason}`,
    });
    return report.id;
  });
}

const PROTECTABLE: ReportStatus[] = [
  "acknowledged",
  "in_progress",
  "repair_claimed",
  "disputed",
];

/** `POST /api/issues/:id/protection`: status unchanged, `recordInterimProtection`. */
export async function recordInterimProtection(
  deps: Deps,
  input: BaseInput & { description: string },
) {
  const at = input.at ?? nowIso();
  if (!can(input.actor.role, "protection:record")) {
    throw new HttpError(
      "forbidden",
      "Only a school administrator can record interim protection.",
    );
  }
  return deps.db.transaction(async (tx) => {
    const report = await requireOwnReport(tx, input);
    if (!PROTECTABLE.includes(report.status)) {
      throw new HttpError(
        "invalid_transition",
        "Interim protection can be recorded once the report is acknowledged and until it is verified.",
      );
    }
    const id = newId();
    const document: InterimProtectionDocument = {
      type: "interim_protection",
      protectionId: id,
      reportId: report.id,
      measure: input.description.trim(),
      createdAt: at,
      salt: newSalt(),
    };
    const commitment = await computeCommitment(document);
    await tx.insert(schema.interimProtections).values({
      id,
      reportId: report.id,
      measure: document.measure,
      recordedBy: input.actor.id,
      createdAt: at,
      commitment,
      receipt: null,
    });
    await tx.insert(schema.commitmentDocuments).values({
      recordId: id,
      reportId: report.id,
      type: "interim_protection",
      commitment,
      document,
      createdAt: at,
    });
    await tx
      .update(schema.reports)
      .set({ hasInterimProtection: true, updatedAt: at })
      .where(eq(schema.reports.id, report.id));
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: "interim_protection_recorded",
      actor: input.actor,
      actorRole: input.actor.role,
      occurredAt: at,
      subjectId: id,
      anchoredValue: commitment,
      note: document.measure,
    });
    await anchor(
      tx,
      deps.ledger,
      [
        {
          reportId: report.id,
          operation: "recordInterimProtection",
          payload: { reportId: report.id, commitment },
          targetKind: "protection",
          targetId: id,
          eventId: event.id,
        },
      ],
      input.anchorMode ?? "sync",
      at,
    );
    return report.id;
  });
}

/** `POST /api/issues/:id/repair-claim`: → repair_claimed; `registerEvidence(repair)*`, `claimRepair`. */
export async function submitRepairClaim(
  deps: Deps,
  input: BaseInput & { note: string; uploads: CheckedUpload[] },
) {
  const at = input.at ?? nowIso();
  return deps.db.transaction(async (tx) => {
    const report = await requireOwnReport(tx, input);
    requireMove(input.actor, report, "repair_claimed");
    const attached = await attachEvidence(tx, deps.store, {
      report,
      uploads: input.uploads,
      purpose: "repair_claim",
      actor: input.actor,
      at,
    });
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)` })
      .from(schema.repairClaims)
      .where(eq(schema.repairClaims.reportId, report.id));
    const id = newId();
    const document: RepairClaimDocument = {
      type: "repair_claim",
      claimId: id,
      reportId: report.id,
      summary: input.note.trim(),
      evidenceDigests: attached.rows.map((r) => r.digest),
      createdAt: at,
      salt: newSalt(),
    };
    const commitment = await computeCommitment(document);
    await tx.insert(schema.repairClaims).values({
      id,
      reportId: report.id,
      index: Number(count),
      summary: document.summary,
      claimedBy: input.actor.id,
      outcome: "pending",
      createdAt: at,
      commitment,
      receipt: null,
    });
    await tx.insert(schema.commitmentDocuments).values({
      recordId: id,
      reportId: report.id,
      type: "repair_claim",
      commitment,
      document,
      createdAt: at,
    });
    await setStatus(tx, report.id, "repair_claimed", at);
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: "repair_claimed",
      actor: input.actor,
      actorRole: input.actor.role,
      occurredAt: at,
      subjectId: id,
      anchoredValue: commitment,
      note: document.summary,
    });
    const specs: AnchorSpec[] = [
      ...attached.specs,
      {
        reportId: report.id,
        operation: "claimRepair",
        payload: { reportId: report.id, commitment },
        targetKind: "claim",
        targetId: id,
        eventId: event.id,
      },
    ];
    await anchor(tx, deps.ledger, specs, input.anchorMode ?? "sync", at);
    await touch(tx, report.id, at);
    return report.id;
  });
}
