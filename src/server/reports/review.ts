/**
 * Independent review: verify or dispute a repair claim. The reviewer must
 * hold `repair:verify` and must not be staff of the report's institution; the
 * ledger enforces the same separation on-chain (`SchoolAdminCannotVerify`).
 */
import { desc, eq } from "drizzle-orm";
import {
  CHAIN_ROLE_FOR_USER_ROLE,
  PERMISSION_FOR_STATUS,
  canTransition,
  can,
  computeCommitment,
  newSalt,
  type ChainRole,
  type ContractErrorName,
  type IsoDateTime,
  type LedgerPort,
  type ReviewDocument,
} from "@/shared";
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
  type Actor,
} from "./common";
import { attachEvidence } from "./evidence";

export interface VerificationInput {
  reportIdOrReference: string;
  actor: Actor;
  outcome: "verified" | "disputed";
  note: string;
  uploads: CheckedUpload[];
  at?: IsoDateTime;
  anchorMode?: AnchorMode;
}

/** `POST /api/issues/:id/verification`. */
export async function submitVerification(
  deps: { db: Db; ledger: LedgerPort; store: EvidenceStore },
  input: VerificationInput,
): Promise<string> {
  const { actor } = input;
  const permission = PERMISSION_FOR_STATUS[input.outcome];
  if (!can(actor.role, permission)) {
    throw new HttpError(
      "forbidden",
      `Your role (${actor.role}) cannot ${permission}. A repair claim is not verification.`,
    );
  }
  const at = input.at ?? nowIso();
  return deps.db.transaction(async (tx) => {
    const report = await requireReport(tx, input.reportIdOrReference);
    if (actor.institutionId && actor.institutionId === report.institutionId) {
      throw new HttpError(
        "forbidden",
        "A reviewer attached to this school cannot review it.",
      );
    }
    if (!canTransition(report.status, input.outcome)) {
      throw new HttpError(
        "invalid_transition",
        `Only a report with a repair claim can be ${input.outcome}; this one is ${report.status.replace("_", " ")}.`,
      );
    }
    const [claim] = await tx
      .select()
      .from(schema.repairClaims)
      .where(eq(schema.repairClaims.reportId, report.id))
      .orderBy(desc(schema.repairClaims.index))
      .limit(1);
    if (!claim || claim.outcome !== "pending") {
      throw new HttpError("invalid_transition", "This claim already has a decision.");
    }
    const attached = await attachEvidence(tx, deps.store, {
      report,
      uploads: input.uploads,
      purpose: "review",
      actor,
      at,
    });
    const id = newId();
    const document: ReviewDocument = {
      type: "review",
      reviewId: id,
      reportId: report.id,
      claimId: claim.id,
      outcome: input.outcome,
      findings: input.note.trim(),
      evidenceDigests: attached.rows.map((r) => r.digest),
      createdAt: at,
      salt: newSalt(),
    };
    const commitment = await computeCommitment(document);
    await tx.insert(schema.independentReviews).values({
      id,
      reportId: report.id,
      claimId: claim.id,
      reviewerId: actor.id,
      outcome: input.outcome,
      findings: document.findings,
      evidenceIds: attached.rows.map((r) => r.id),
      createdAt: at,
      commitment,
      receipt: null,
    });
    await tx.insert(schema.commitmentDocuments).values({
      recordId: id,
      reportId: report.id,
      type: "review",
      commitment,
      document,
      createdAt: at,
    });
    await tx
      .update(schema.repairClaims)
      .set({ outcome: input.outcome })
      .where(eq(schema.repairClaims.id, claim.id));
    await setStatus(tx, report.id, input.outcome, at);
    const event = await appendEvent(tx, {
      reportId: report.id,
      type: input.outcome === "verified" ? "repair_verified" : "repair_disputed",
      actor,
      actorRole: actor.role,
      occurredAt: at,
      subjectId: id,
      anchoredValue: commitment,
      note: document.findings,
    });
    const specs: AnchorSpec[] = [
      ...attached.specs,
      {
        reportId: report.id,
        operation: input.outcome === "verified" ? "verifyRepair" : "disputeRepair",
        payload: { reportId: report.id, reviewCommitment: commitment },
        targetKind: "review",
        targetId: id,
        eventId: event.id,
      },
    ];
    await anchor(tx, deps.ledger, specs, input.anchorMode ?? "sync", at);
    return report.id;
  });
}

export interface ProbeResult {
  allowed: boolean;
  revert: ContractErrorName | null;
  /** The caller's on-chain role, or `none` when the account has no chain role. */
  chainRole: ChainRole | "none";
}

/**
 * `POST /api/issues/:id/verification/probe`: ask the ledger whether the
 * caller's chain role could verify this report now. Never writes.
 */
export async function probeVerification(
  deps: { db: Db; ledger: LedgerPort },
  input: { reportIdOrReference: string; actor: Actor },
): Promise<ProbeResult> {
  if (input.actor.role === "reporter") {
    throw new HttpError("forbidden", "Only staff roles can probe verification.");
  }
  const report = await requireReport(deps.db, input.reportIdOrReference);
  const chainRole = CHAIN_ROLE_FOR_USER_ROLE[input.actor.role];
  if (!chainRole) return { allowed: false, revert: "Unauthorized", chainRole: "none" };
  const result = await deps.ledger.probeVerify({ reportId: report.id, as: chainRole });
  return { ...result, chainRole };
}
