/**
 * The procurement trail as a signed-in person may see it (`MoneyTrail`), and
 * the two loaders the AI routes use.
 *
 * Every function here checks who is asking before it returns anything, and
 * filters by the visibility matrix in `@/shared` (`visibilityFor`):
 *
 * - buyer, payment approver, district official: everything, with names;
 * - supplier: its own orders only, with its own prices and its own name;
 * - receiving officer, school administrator, reviewer: names, scope and
 *   quantities, no prices;
 * - reporter and signed-out visitors: nothing (the public trail on the issue
 *   is built elsewhere, from case events only).
 */
import { inArray } from "drizzle-orm";
import {
  CURRENCY,
  can,
  redactMoneyTrail,
  redactReasons,
  visibilityFor,
  type MatchOutcome,
  type MatchReason,
  type MoneyTrail,
  type MoneyTrailStep,
  type ProcurementStage,
  type ProcurementVisibility,
  type ReleaseGate,
} from "@/shared";
import { schema, type Db } from "../db";
import { HttpError } from "../http";
import { requireReport } from "../reports/common";
import { toLedgerRecord } from "../view";
import { financeActor, financeNote, isFinanceEventType } from "./notes";
import {
  gateFor,
  loadOrderState,
  requireInstitutionAccess,
  requireOrderAccess,
  stageOf,
  type OrderState,
  type Viewer,
} from "./state";

/** Only the context's database is needed; the AI routes pass their `ServerContext`. */
type HasDb = { db: Db };

/** Signed in, and a role that may read procurement data at all. */
function requireReader(viewer: Viewer): NonNullable<Viewer> {
  if (!viewer) throw new HttpError("unauthenticated", "Sign in to continue.");
  if (!can(viewer.role, "procurement:read")) {
    throw new HttpError(
      "forbidden",
      `Your role (${viewer.role}) cannot procurement:read.`,
    );
  }
  return viewer;
}

/**
 * The order state of a case for this reader. Throws the usual errors:
 * 401 signed out, 403 wrong role, another supplier's order or another
 * institution's case, 404 unknown report. Null when the case has no work order.
 */
async function stateForReader(
  db: Db,
  reportIdOrReference: string,
  viewer: Viewer,
): Promise<{ state: OrderState | null; reader: NonNullable<Viewer> }> {
  const reader = requireReader(viewer);
  const report = await requireReport(db, reportIdOrReference);
  requireInstitutionAccess(reader, report.institutionId);
  const state = await loadOrderState(db, report);
  if (state) requireOrderAccess(reader, state.order);
  return { state, reader };
}

async function displayNames(db: Db, state: OrderState): Promise<Map<string, string>> {
  const ids = [...new Set(state.events.flatMap((e) => (e.actorId ? [e.actorId] : [])))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));
  return new Map(rows.map((u) => [u.id, u.displayName]));
}

/** The trail for one reader, already filtered. Null for a reader with no visibility. */
export async function toMoneyTrail(
  db: Db,
  state: OrderState,
  reader: NonNullable<Viewer>,
): Promise<MoneyTrail | null> {
  const visibility: ProcurementVisibility = visibilityFor(reader.role);
  if (visibility === "none") return null;
  const names = await displayNames(db, state);
  const acknowledged = state.order.acknowledgedVersion === state.order.currentVersion;

  const steps: MoneyTrailStep[] = state.events.flatMap((event) => {
    if (!isFinanceEventType(event.type)) return [];
    const actor = financeActor(event.type, event.actorRole);
    // A supplier sees its own name on its own steps and roles everywhere else.
    const named =
      actor !== "system" &&
      event.actorId !== null &&
      (visibility !== "own_orders" || event.actorId === reader.id);
    const step: MoneyTrailStep = {
      eventId: event.id,
      type: event.type,
      actor,
      occurredAt: event.occurredAt,
      note: financeNote(event.type, event.note),
      ledger: toLedgerRecord(event.receipt),
      actorName: named ? (names.get(event.actorId!) ?? null) : null,
    };
    if (event.type === "match_recorded") {
      const outcome = state.matches.find((m) => m.id === event.subjectId)?.outcome;
      if (outcome) step.outcome = outcome;
    }
    return [step];
  });

  const trail: MoneyTrail = {
    issueId: state.report.id,
    reference: state.report.reference,
    workOrderId: state.order.id,
    stage: stageOf(state),
    pricesVisible: true,
    order: {
      id: state.order.id,
      version: state.order.currentVersion,
      description: state.current.scope,
      supplierName: state.order.supplierName,
      supplierRef: state.order.supplierRef,
      lines: state.current.lines,
      totalCents: state.current.totalCents,
      currency: CURRENCY,
      approvedAt: state.current.createdAt,
      acknowledged,
      acknowledgedAt: acknowledged ? state.order.acknowledgedAt : null,
    },
    invoices: state.invoices.map((invoice) => {
      const match = state.matches.filter((m) => m.invoiceId === invoice.id).at(-1);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderVersion: invoice.orderVersion,
        lines: invoice.lines,
        totalCents: invoice.statedTotalCents,
        aiDrafted: invoice.aiDrafted,
        submittedAt: invoice.createdAt,
        match: match
          ? {
              id: match.id,
              outcome: match.outcome,
              reasons: match.reasons,
              recordedAt: match.createdAt,
            }
          : null,
      };
    }),
    receipts: state.receipts.map((receipt) => ({
      id: receipt.id,
      orderVersion: receipt.orderVersion,
      lines: receipt.lines,
      evidenceCount: receipt.evidenceDigests.length,
      recordedAt: receipt.createdAt,
    })),
    // The same-person check only means something for the person who would authorise.
    gate: gateFor(state, reader.role === "payment_approver" ? reader.id : null),
    releaseAuthorisedAt: state.release?.createdAt ?? null,
    steps,
  };
  return redactMoneyTrail(trail, visibility);
}

/**
 * `GET /api/issues/:id/procurement`, and the body of every procurement write.
 * 404 when the case has no work order.
 */
export async function loadMoneyTrail(
  ctx: HasDb,
  reportIdOrReference: string,
  viewer: Viewer,
): Promise<MoneyTrail> {
  const { state, reader } = await stateForReader(ctx.db, reportIdOrReference, viewer);
  const trail = state ? await toMoneyTrail(ctx.db, state, reader) : null;
  if (!trail) throw new HttpError("not_found", "This case has no work order yet.");
  return trail;
}

export interface MatchForViewer {
  matchId: string;
  invoiceId: string;
  outcome: MatchOutcome;
  /** Price reasons have lost their numbers when the viewer may not see prices. */
  reasons: MatchReason[];
  /** False when the amounts were removed for this viewer. */
  pricesVisible: boolean;
}

/**
 * One rule-engine result, for the explanation route. Throws the usual errors:
 * 401 signed out, 403 a role or supplier that may not read this case, 404 an
 * unknown report, a case with no work order, or a match that is not on it.
 */
export async function loadMatchForViewer(
  ctx: HasDb,
  issueId: string,
  matchId: string,
  viewer: Viewer,
): Promise<MatchForViewer> {
  const { state, reader } = await stateForReader(ctx.db, issueId, viewer);
  const match = state?.matches.find((m) => m.id === matchId);
  if (!match) throw new HttpError("not_found", `Unknown match result: ${matchId}`);
  const pricesVisible = visibilityFor(reader.role) !== "no_prices";
  return {
    matchId: match.id,
    invoiceId: match.invoiceId,
    outcome: match.outcome,
    reasons: pricesVisible ? match.reasons : redactReasons(match.reasons),
    pricesVisible,
  };
}

export interface GateForViewer {
  gate: ReleaseGate;
  stage: ProcurementStage;
}

/**
 * The release gate and stage of a case, for the assistant. Null when the
 * viewer may not see finance data (signed out, a reporter, another
 * supplier, another institution) and when the case has no work order.
 * Throws only for an unknown report.
 */
export async function loadGateForViewer(
  ctx: HasDb,
  issueId: string,
  viewer: Viewer,
): Promise<GateForViewer | null> {
  if (!viewer || !can(viewer.role, "procurement:read")) {
    // Still a 404 for a report that does not exist, without touching finance tables.
    await requireReport(ctx.db, issueId);
    return null;
  }
  try {
    const { state, reader } = await stateForReader(ctx.db, issueId, viewer);
    if (!state) return null;
    return {
      gate: gateFor(state, reader.role === "payment_approver" ? reader.id : null),
      stage: stageOf(state),
    };
  } catch (error) {
    if (error instanceof HttpError && error.code === "forbidden") return null;
    throw error;
  }
}
