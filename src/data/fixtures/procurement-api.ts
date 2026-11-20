/**
 * DEVELOPMENT FIXTURE — the procurement half of the fixture `BonaApi`.
 *
 * It keeps the same rules as the backend so the screens are built against
 * them: each write needs its own permission, a supplier only ever sees its
 * own orders, the rule engine (`matchThreeWay`) runs after every invoice and
 * every goods receipt, and a release is refused while `releaseGate` is shut.
 * No real money moves: the last step is a release instruction.
 */
import type { ZodType } from "zod";
import {
  ApproveWorkOrderInputSchema,
  can,
  CURRENCY,
  MATCH_ENGINE_VERSION,
  matchThreeWay,
  RecordGoodsReceiptInputSchema,
  ruleExplanation,
  SubmitInvoiceInputSchema,
  type Invoice,
  type IsoDateTime,
  type Permission,
} from "@/shared";
import { linesTotal } from "@/features/procurement/money";
import type { BonaApi } from "../api";
import { ApiError } from "../errors";
import { ReleaseBlockedError } from "../http-api";
import type { Issue, MoneyTrail, PublicTrailStep, Session } from "../types";
import { draftInvoiceFromText } from "./invoice-text";
import { gateFor, latestMatch, queueFor, trailFor } from "./procurement-rules";
import { SAMPLE_SUPPLIERS, type FixtureCase } from "./procurement-seed";
import { FINANCE_NOTE, sampleDigest } from "./seed";

type FinanceStep = keyof typeof FINANCE_NOTE;
type User = Session["user"];

/** What the procurement methods need from the fixture they live in. */
export interface ProcurementContext {
  wait(): Promise<void>;
  now(): IsoDateTime;
  save(): void;
  session(): Session | null;
  issues(): Issue[];
  find(idOrReference: string): Issue | undefined;
  cases(): Record<string, FixtureCase>;
  /** Record one step on the public trail. It is never a timeline entry. */
  addStep(
    issue: Issue,
    type: FinanceStep,
    actor: PublicTrailStep["actor"],
    at: IsoDateTime,
    outcome?: PublicTrailStep["outcome"],
  ): PublicTrailStep;
}

export type ProcurementMethods = Pick<
  BonaApi,
  | "listWorkQueue"
  | "getMoneyTrail"
  | "approveWorkOrder"
  | "acknowledgeOrder"
  | "draftInvoice"
  | "submitInvoice"
  | "recordGoodsReceipt"
  | "explainMismatch"
  | "authoriseRelease"
>;

export function createProcurementMethods(ctx: ProcurementContext): ProcurementMethods {
  function requirePermission(permission: Permission): User {
    const current = ctx.session();
    if (!current) throw new ApiError("unauthenticated", "Sign in first.");
    if (!can(current.user.role, permission)) {
      throw new ApiError("forbidden", "Your role cannot do this.");
    }
    return current.user;
  }

  function issueOf(issueId: string): Issue {
    const issue = ctx.find(issueId);
    if (!issue) throw new ApiError("not_found", "We could not find that report.");
    return issue;
  }

  /**
   * The case as this person may see it. A report without a work order is
   * "not found"; another supplier's order is refused.
   */
  function caseOf(issue: Issue, user: User): FixtureCase {
    const record = ctx.cases()[issue.id];
    if (!record) {
      throw new ApiError("not_found", "This report has no work order yet.");
    }
    if (user.role === "supplier" && record.order.supplierId !== user.id) {
      throw new ApiError("forbidden", "This work order is not yours.");
    }
    return record;
  }

  /** A receiving officer records deliveries at their own school, and nowhere else. */
  function atOwnSchool(issue: Issue, user: User): void {
    if (user.institutionId !== null && user.institutionId !== issue.schoolId) {
      throw new ApiError("forbidden", "This delivery is at another school.");
    }
  }

  function stillOpen(record: FixtureCase): void {
    if (record.release) {
      throw new ApiError(
        "conflict",
        "A release was already authorised for this order. It cannot be changed.",
      );
    }
  }

  function parse<T>(schema: ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new ApiError("invalid_input", "Some of the details are missing or wrong.");
    }
    return result.data;
  }

  function uniqueSkus(lines: readonly { sku: string }[]): void {
    if (new Set(lines.map((line) => line.sku)).size !== lines.length) {
      throw new ApiError("invalid_input", "Each line needs its own item code.");
    }
  }

  /** Write one step on the trail and remember, for staff, who took it. */
  function step(
    issue: Issue,
    record: FixtureCase,
    type: FinanceStep,
    actor: PublicTrailStep["actor"],
    name: string | null,
    at: IsoDateTime,
    outcome?: PublicTrailStep["outcome"],
  ): PublicTrailStep {
    const written = ctx.addStep(issue, type, actor, at, outcome);
    record.actorNames[written.eventId] = name;
    return written;
  }

  /** Run the rule engine over one invoice and record what it found. */
  function runMatch(
    issue: Issue,
    record: FixtureCase,
    invoice: Invoice,
    after: IsoDateTime,
  ) {
    const position = record.invoices.findIndex((other) => other.id === invoice.id);
    const verdict = matchThreeWay({
      order: record.order,
      invoice,
      priorInvoiceNumbers: record.invoices
        .slice(0, position)
        .map((earlier) => earlier.invoiceNumber),
      receipts: record.receipts,
    });
    // One millisecond after the step that caused it, so the trail keeps them in order.
    const at = new Date(Date.parse(after) + 1).toISOString();
    const id = `${issue.id}-match-${record.matches.length + 1}`;
    const seen = record.receipts.findLast(
      (receipt) => receipt.orderVersion === record.order.version,
    );
    record.matches.push({
      id,
      workOrderId: record.order.id,
      reportId: issue.id,
      invoiceId: invoice.id,
      receiptId: seen?.id ?? null,
      orderVersion: record.order.version,
      outcome: verdict.outcome,
      reasons: verdict.reasons,
      engineVersion: MATCH_ENGINE_VERSION,
      createdAt: at,
      commitment: sampleDigest(id),
      receipt: null,
    });
    // The public may know which way the rules decided, and nothing about why.
    step(issue, record, "match_recorded", "system", null, at, verdict.outcome);
  }

  function trail(record: FixtureCase, issue: Issue, user: User): MoneyTrail {
    const visible = trailFor(record, issue, user);
    if (!visible) throw new ApiError("forbidden", "This work order is not yours.");
    return structuredClone(visible);
  }

  return {
    async listWorkQueue() {
      await ctx.wait();
      const user = requirePermission("procurement:read");
      return structuredClone(queueFor(user, ctx.issues(), ctx.cases()));
    },

    async getMoneyTrail(issueId) {
      await ctx.wait();
      const user = requirePermission("procurement:read");
      const issue = ctx.find(issueId);
      const record = issue ? ctx.cases()[issue.id] : undefined;
      if (!issue || !record) return null;
      // Null too for an order this person may not see, as the port says.
      const visible = trailFor(record, issue, user);
      return visible ? structuredClone(visible) : null;
    },

    async approveWorkOrder(issueId, input) {
      await ctx.wait();
      const user = requirePermission("order:approve");
      const issue = issueOf(issueId);
      const order = parse(ApproveWorkOrderInputSchema, input);
      uniqueSkus(order.lines);
      const supplier = SAMPLE_SUPPLIERS.find(
        (candidate) => candidate.ref.toLowerCase() === order.supplierRef.toLowerCase(),
      );
      if (!supplier) {
        throw new ApiError(
          "invalid_input",
          "No supplier is registered with that reference.",
        );
      }
      const cases = ctx.cases();
      if (cases[issue.id]) {
        throw new ApiError("conflict", "This report already has a work order.");
      }
      if (issue.status === "declined") {
        throw new ApiError("conflict", "A declined report cannot have a work order.");
      }

      const at = ctx.now();
      const id = `${issue.id}-order`;
      const record: FixtureCase = {
        issueId: issue.id,
        order: {
          id,
          reportId: issue.id,
          institutionId: issue.schoolId,
          supplierId: supplier.userId,
          supplierName: supplier.name,
          supplierRef: supplier.ref,
          version: 1,
          description: order.description,
          lines: order.lines,
          totalCents: linesTotal(order.lines),
          currency: CURRENCY,
          approvedBy: user.id,
          approvedAt: at,
          acknowledgedVersion: null,
          acknowledgedBy: null,
          acknowledgedAt: null,
          commitment: sampleDigest(`${id}-v1`),
          receipt: null,
        },
        invoices: [],
        receipts: [],
        matches: [],
        release: null,
        reviewerId: null,
        actorNames: {},
      };
      cases[issue.id] = record;
      step(issue, record, "work_order_approved", "buyer", user.displayName, at);
      ctx.save();
      return trail(record, issue, user);
    },

    async acknowledgeOrder(issueId) {
      await ctx.wait();
      const user = requirePermission("order:acknowledge");
      const issue = issueOf(issueId);
      const record = caseOf(issue, user);
      stillOpen(record);
      if (record.order.acknowledgedVersion === record.order.version) {
        throw new ApiError("conflict", "This order is already acknowledged.");
      }
      const at = ctx.now();
      record.order.acknowledgedVersion = record.order.version;
      record.order.acknowledgedBy = user.id;
      record.order.acknowledgedAt = at;
      step(issue, record, "work_order_acknowledged", "supplier", user.displayName, at);
      ctx.save();
      return trail(record, issue, user);
    },

    async draftInvoice(issueId, text) {
      await ctx.wait();
      const user = requirePermission("invoice:submit");
      caseOf(issueOf(issueId), user);
      if (!text.trim()) {
        throw new ApiError("invalid_input", "Paste the invoice text first.");
      }
      // Reads the text into fields and writes nothing.
      return draftInvoiceFromText(text);
    },

    async submitInvoice(issueId, input) {
      await ctx.wait();
      const user = requirePermission("invoice:submit");
      const issue = issueOf(issueId);
      const record = caseOf(issue, user);
      stillOpen(record);
      const details = parse(SubmitInvoiceInputSchema, input);
      uniqueSkus(details.lines);
      const at = ctx.now();
      const id = `${issue.id}-invoice-${record.invoices.length + 1}`;
      const invoice: Invoice = {
        id,
        workOrderId: record.order.id,
        reportId: issue.id,
        orderVersion: details.orderVersion,
        invoiceNumber: details.invoiceNumber,
        // The reference of the account that submits, never one typed on the form.
        supplierRef:
          SAMPLE_SUPPLIERS.find((supplier) => supplier.userId === user.id)?.ref ??
          "unregistered",
        lines: details.lines,
        totalCents: details.totalCents,
        currency: CURRENCY,
        submittedBy: user.id,
        aiDrafted: details.aiDrafted,
        createdAt: at,
        commitment: sampleDigest(id),
        receipt: null,
      };
      record.invoices.push(invoice);
      step(issue, record, "invoice_submitted", "supplier", user.displayName, at);
      runMatch(issue, record, invoice, at);
      ctx.save();
      return trail(record, issue, user);
    },

    async recordGoodsReceipt(issueId, input) {
      await ctx.wait();
      const user = requirePermission("receipt:record");
      const issue = issueOf(issueId);
      const record = caseOf(issue, user);
      atOwnSchool(issue, user);
      stillOpen(record);
      const details = parse(RecordGoodsReceiptInputSchema, input);
      uniqueSkus(details.lines);
      const ordered = new Set(record.order.lines.map((line) => line.sku));
      if (details.lines.some((line) => !ordered.has(line.sku))) {
        throw new ApiError("invalid_input", "A receipt line is not on the order.");
      }
      const at = ctx.now();
      const id = `${issue.id}-receipt-${record.receipts.length + 1}`;
      record.receipts.push({
        id,
        workOrderId: record.order.id,
        reportId: issue.id,
        orderVersion: record.order.version,
        lines: details.lines,
        evidenceDigests: details.evidenceDigests ?? [],
        receivedBy: user.id,
        createdAt: at,
        commitment: sampleDigest(id),
        receipt: null,
      });
      step(
        issue,
        record,
        "goods_receipt_recorded",
        "receiving_officer",
        user.displayName,
        at,
      );
      // A match is current only while no later goods receipt exists: check the invoice again.
      const invoice = record.invoices.at(-1);
      if (invoice) runMatch(issue, record, invoice, at);
      ctx.save();
      return trail(record, issue, user);
    },

    async explainMismatch(issueId, matchId) {
      await ctx.wait();
      const user = requirePermission("procurement:read");
      const issue = issueOf(issueId);
      // Explained from the trail as this person sees it, so a role without prices gets none.
      const visible = trail(caseOf(issue, user), issue, user);
      const match = visible.invoices
        .map((invoice) => invoice.match)
        .find((candidate) => candidate?.id === matchId);
      if (!match) throw new ApiError("not_found", "We could not find that result.");
      return { text: ruleExplanation(match.reasons), source: "rules" };
    },

    async authoriseRelease(issueId) {
      await ctx.wait();
      const user = requirePermission("release:authorise");
      const issue = issueOf(issueId);
      const record = caseOf(issue, user);
      const gate = gateFor(record, issue, user.id);
      const match = latestMatch(record);
      if (!gate.open || !match) throw new ReleaseBlockedError(gate.blockers);
      const at = ctx.now();
      const id = `${issue.id}-release`;
      const review = issue.timeline.findLast((event) => event.type === "verified");
      record.release = {
        id,
        workOrderId: record.order.id,
        reportId: issue.id,
        matchId: match.id,
        reviewId: review?.id ?? `${issue.id}-review`,
        authorisedBy: user.id,
        createdAt: at,
        commitment: sampleDigest(id),
        receipt: null,
      };
      step(issue, record, "release_authorised", "payment_approver", user.displayName, at);
      ctx.save();
      return trail(record, issue, user);
    },
  };
}
