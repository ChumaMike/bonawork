import { and, eq } from "drizzle-orm";
import {
  EVIDENCE_KIND_ROLE,
  can,
  type EvidenceKind,
  type IsoDateTime,
  type LedgerPort,
} from "@/shared";
import type { EvidenceRow, ReportRow } from "../../../database/schema";
import { schema, type Db } from "../db";
import type { EvidenceStore } from "../evidence/store";
import type { CheckedUpload } from "../evidence/validate";
import { HttpError } from "../http";
import { anchor, type AnchorMode, type AnchorSpec } from "./anchor";
import {
  actorUserId,
  appendEvent,
  nowIso,
  requireReport,
  touch,
  type Actor,
} from "./common";

/** Frontend evidence purposes and the on-chain kind each one is. */
export type EvidencePurpose = "problem" | "progress" | "repair_claim" | "review";
export const PURPOSE_KIND: Record<EvidencePurpose, EvidenceKind> = {
  problem: "report",
  progress: "report",
  repair_claim: "repair",
  review: "review",
};

export interface AttachInput {
  report: ReportRow;
  uploads: CheckedUpload[];
  purpose: EvidencePurpose;
  actor: Actor;
  at: IsoDateTime;
}

/**
 * Store the files, insert their commitments and one `evidence_registered`
 * event each, and return the anchoring specs (`registerEvidence` per file).
 * Runs inside the caller's transaction.
 */
export async function attachEvidence(
  tx: Db,
  store: EvidenceStore,
  input: AttachInput,
): Promise<{ rows: EvidenceRow[]; specs: AnchorSpec[] }> {
  const kind = PURPOSE_KIND[input.purpose];
  const existing = await tx
    .select({
      digest: schema.evidenceCommitments.digest,
      version: schema.evidenceCommitments.version,
    })
    .from(schema.evidenceCommitments)
    .where(eq(schema.evidenceCommitments.reportId, input.report.id));
  const digests = new Set(existing.map((e) => e.digest));
  let version = existing.reduce((max, e) => Math.max(max, e.version), 0);
  const rows: EvidenceRow[] = [];
  const specs: AnchorSpec[] = [];
  for (const upload of input.uploads) {
    if (digests.has(upload.digest)) {
      throw new HttpError("conflict", "This file is already attached to this case.");
    }
    digests.add(upload.digest);
    version += 1;
    const storageKey = await store.put(upload.bytes, upload.mediaType);
    const row: EvidenceRow = {
      id: crypto.randomUUID(),
      reportId: input.report.id,
      version,
      algorithm: "sha256",
      digest: upload.digest,
      kind,
      purpose: input.purpose,
      sizeBytes: upload.sizeBytes,
      mediaType: upload.mediaType,
      uploadedBy: actorUserId(input.actor),
      uploadedByRole: input.actor.role,
      storageKey,
      createdAt: input.at,
      receipt: null,
    };
    await tx.insert(schema.evidenceCommitments).values(row);
    const event = await appendEvent(tx, {
      reportId: input.report.id,
      type: "evidence_registered",
      actor: input.actor,
      actorRole: input.actor.role,
      occurredAt: input.at,
      subjectId: row.id,
      anchoredValue: row.digest,
      note: `${input.actor.publicLabel} added a ${describe(row.mediaType)} as evidence.`,
    });
    rows.push(row);
    specs.push({
      reportId: input.report.id,
      operation: "registerEvidence",
      payload: { reportId: input.report.id, digest: row.digest, kind },
      targetKind: "evidence",
      targetId: row.id,
      eventId: event.id,
    });
  }
  return { rows, specs };
}

const describe = (mediaType: string) =>
  mediaType === "application/pdf" ? "document" : "photo";

export interface AddEvidenceInput {
  reportIdOrReference: string;
  actor: Actor;
  purpose: EvidencePurpose;
  uploads: CheckedUpload[];
  at?: IsoDateTime;
  anchorMode?: AnchorMode;
}

/** `POST /api/issues/:id/evidence`. */
export async function addEvidence(
  deps: { db: Db; ledger: LedgerPort; store: EvidenceStore },
  input: AddEvidenceInput,
): Promise<EvidenceRow[]> {
  const { actor } = input;
  if (!can(actor.role, "evidence:upload")) {
    throw new HttpError("forbidden", "Your role cannot upload evidence.");
  }
  const kind = PURPOSE_KIND[input.purpose];
  if (EVIDENCE_KIND_ROLE[kind] !== actor.role) {
    throw new HttpError(
      "forbidden",
      `Only a ${EVIDENCE_KIND_ROLE[kind].replace("_", " ")} may add ${input.purpose} evidence.`,
    );
  }
  if (input.uploads.length === 0) {
    throw new HttpError("invalid_input", "Attach at least one file.");
  }
  const at = input.at ?? nowIso();
  return deps.db.transaction(async (tx) => {
    const report = await requireReport(tx, input.reportIdOrReference);
    if (actor.role === "school_admin" && actor.institutionId !== report.institutionId) {
      throw new HttpError("forbidden", "This report belongs to another institution.");
    }
    if (report.status === "verified") {
      throw new HttpError(
        "invalid_transition",
        "A verified report accepts no further changes.",
      );
    }
    const { rows, specs } = await attachEvidence(tx, deps.store, {
      report,
      uploads: input.uploads,
      purpose: input.purpose,
      actor,
      at,
    });
    await touch(tx, report.id, at);
    await anchor(tx, deps.ledger, specs, input.anchorMode ?? "sync", at);
    // Re-read: the anchoring may have attached receipts.
    return tx
      .select()
      .from(schema.evidenceCommitments)
      .where(and(eq(schema.evidenceCommitments.reportId, report.id)))
      .then((all) => all.filter((e) => rows.some((r) => r.id === e.id)));
  });
}
