/**
 * Helpers for the procurement HTTP tests: every route as a function of
 * (ids, body, headers), and one call that walks a case from report to a
 * matched invoice. Test code only; nothing in the app imports this file.
 */
import type {
  ApproveWorkOrderInput,
  OrderLine,
  ReceiptLine,
  SubmitInvoiceInput,
  UserRole,
} from "@/shared";
import type { SubmissionReceipt } from "@/data/types";
import * as assistant from "@/app/api/assistant/route";
import * as issue from "@/app/api/issues/[id]/route";
import * as assessment from "@/app/api/issues/[id]/assessment/route";
import * as documents from "@/app/api/issues/[id]/documents/[recordId]/route";
import * as goodsReceipt from "@/app/api/issues/[id]/goods-receipt/route";
import * as invoices from "@/app/api/issues/[id]/invoices/route";
import * as procurement from "@/app/api/issues/[id]/procurement/route";
import * as release from "@/app/api/issues/[id]/release/route";
import * as repairClaim from "@/app/api/issues/[id]/repair-claim/route";
import * as verification from "@/app/api/issues/[id]/verification/route";
import * as workOrder from "@/app/api/issues/[id]/work-order/route";
import * as acknowledgement from "@/app/api/issues/[id]/work-order/acknowledgement/route";
import * as issues from "@/app/api/issues/route";
import * as receipts from "@/app/api/receipts/[reference]/route";
import * as reports from "@/app/api/reports/route";
import * as school from "@/app/api/schools/[schoolId]/route";
import * as queue from "@/app/api/work/queue/route";
import { createSessionToken } from "../auth/session";
import { schema } from "../db";
import {
  body,
  formRequest,
  jsonRequest,
  params,
  png,
  type TestWorld,
} from "../test/harness";

export type Headers = Record<string, string>;
export const SIGNED_OUT: Headers = {};

export const DEMO_SCHOOL = "thandolwethu-primary";
export const ADMIN = "admin@thandolwethu.demo";
export const REVIEWER = "reviewer@vaalridge.demo";
export const REPORTER = "lindiwe@community.demo";
export const OTHER_REPORTER = "palesa@community.demo";
export const DISTRICT = "district@vaalridge.demo";
export const OTHER_ADMIN = "admin@khanyisa.demo";

const get = (path: string, headers: Headers) =>
  jsonRequest("GET", path, undefined, headers);
const post = (path: string, payload: unknown, headers: Headers) =>
  jsonRequest("POST", path, payload, headers);

/** Every route the procurement tests call. Each returns the raw `Response`. */
export const api = {
  queue: (headers: Headers) => queue.GET(get("/api/work/queue", headers)),
  trail: (id: string, headers: Headers) =>
    procurement.GET(get(`/api/issues/${id}/procurement`, headers), params({ id })),
  approve: (id: string, order: unknown, headers: Headers) =>
    workOrder.POST(post(`/api/issues/${id}/work-order`, order, headers), params({ id })),
  acknowledge: (id: string, headers: Headers) =>
    acknowledgement.POST(
      post(`/api/issues/${id}/work-order/acknowledgement`, undefined, headers),
      params({ id }),
    ),
  invoice: (id: string, invoice: unknown, headers: Headers) =>
    invoices.POST(post(`/api/issues/${id}/invoices`, invoice, headers), params({ id })),
  receive: (id: string, receipt: unknown, headers: Headers) =>
    goodsReceipt.POST(
      post(`/api/issues/${id}/goods-receipt`, receipt, headers),
      params({ id }),
    ),
  release: (id: string, headers: Headers) =>
    release.POST(post(`/api/issues/${id}/release`, undefined, headers), params({ id })),

  issue: (id: string, headers: Headers) =>
    issue.GET(get(`/api/issues/${id}`, headers), params({ id })),
  issues: (headers: Headers, query = "") =>
    issues.GET(get(`/api/issues${query}`, headers)),
  school: (schoolId: string, headers: Headers) =>
    school.GET(get(`/api/schools/${schoolId}`, headers), params({ schoolId })),
  document: (id: string, recordId: string, headers: Headers) =>
    documents.GET(
      get(`/api/issues/${id}/documents/${recordId}`, headers),
      params({ id, recordId }),
    ),
  receipt: (reference: string, headers: Headers) =>
    receipts.GET(get(`/api/receipts/${reference}`, headers), params({ reference })),
  assistant: (question: string, headers: Headers) =>
    assistant.POST(post("/api/assistant", { history: [], question }, headers)),

  report: (fields: Record<string, string>, headers: Headers) =>
    reports.POST(
      formRequest(
        "POST",
        "/api/reports",
        {
          schoolId: DEMO_SCHOOL,
          category: "buildings",
          location: "Admin block",
          anonymous: "false",
          ...fields,
        },
        [png(`procurement-${fields.title}`)],
        headers,
      ),
    ),
  assess: (id: string, headers: Headers) =>
    assessment.POST(
      post(`/api/issues/${id}/assessment`, { note: "Confirmed by the school." }, headers),
      params({ id }),
    ),
  claim: (id: string, headers: Headers) =>
    repairClaim.POST(
      formRequest(
        "POST",
        `/api/issues/${id}/repair-claim`,
        { note: "The school says the work is done." },
        [],
        headers,
      ),
      params({ id }),
    ),
  verify: (id: string, headers: Headers, outcome: "verified" | "disputed" = "verified") =>
    verification.POST(
      formRequest(
        "POST",
        `/api/issues/${id}/verification`,
        { outcome, note: "Checked on site by the reviewer." },
        [],
        headers,
      ),
      params({ id }),
    ),
};

/** Headers that sign in any user by id, including ones a test inserted itself. */
export function signIn(world: TestWorld, userId: string): Headers {
  return { cookie: `bona_session=${createSessionToken(userId, world.ctx.secret)}` };
}

/** Insert an account for a test and return its id and sign-in headers. */
export async function addAccount(
  world: TestWorld,
  account: {
    id: string;
    role: UserRole;
    displayName: string;
    supplier?: { ref: string; name: string };
    institutionId?: string | null;
  },
): Promise<{ id: string; headers: Headers }> {
  await world.ctx.db.insert(schema.users).values({
    id: account.id,
    email: `${account.id}@procurement.test`,
    passwordHash: "not-a-hash",
    role: account.role,
    institutionId: account.institutionId ?? null,
    displayName: account.displayName,
    publicLabel: account.role,
    supplierRef: account.supplier?.ref ?? null,
    supplierName: account.supplier?.name ?? null,
    createdAt: "2026-11-01T08:00:00.000Z",
  });
  return { id: account.id, headers: signIn(world, account.id) };
}

export const withoutPrices = (lines: OrderLine[]): ReceiptLine[] =>
  lines.map(({ sku, description, quantity }) => ({ sku, description, quantity }));
export const sumOf = (lines: OrderLine[]): number =>
  lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);

export const invoiceFor = (
  invoiceNumber: string,
  lines: OrderLine[],
  totalCents = sumOf(lines),
): SubmitInvoiceInput => ({
  invoiceNumber,
  orderVersion: 1,
  lines,
  totalCents,
  aiDrafted: false,
});

export interface Cast {
  reporter: Headers;
  admin: Headers;
  buyer: Headers;
  supplier: Headers;
  receiver: Headers;
  reviewer: Headers;
  approver: Headers;
}

/** A new report at the demo school, assessed by the school. Returns its id and reference. */
export async function openAssessedCase(
  cast: Pick<Cast, "reporter" | "admin">,
  title: string,
): Promise<{ id: string; reference: string }> {
  const created = await api.report(
    { title, description: `${title}. Reported for a procurement test.` },
    cast.reporter,
  );
  if (created.status !== 201) throw new Error(`report: ${created.status}`);
  const receipt = await body<SubmissionReceipt>(created);
  const assessed = await api.assess(receipt.issueId, cast.admin);
  if (assessed.status !== 200) throw new Error(`assessment: ${assessed.status}`);
  return { id: receipt.issueId, reference: receipt.reference };
}

/** Order approved, acknowledged and fully delivered: where demo case A starts. */
export async function orderAndDeliver(
  cast: Cast,
  id: string,
  order: ApproveWorkOrderInput,
): Promise<void> {
  for (const [step, response] of [
    ["work order", await api.approve(id, order, cast.buyer)],
    ["acknowledgement", await api.acknowledge(id, cast.supplier)],
    [
      "goods receipt",
      await api.receive(id, { lines: withoutPrices(order.lines) }, cast.receiver),
    ],
  ] as const) {
    if (response.status >= 300) {
      throw new Error(`${step}: ${response.status} ${await response.text()}`);
    }
  }
}

/** Every key of a JSON value, at any depth. */
export function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into);
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      into.add(key);
      keysOf(inner, into);
    }
  }
  return into;
}
