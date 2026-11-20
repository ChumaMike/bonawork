/**
 * The procurement trail through the HTTP routes: the seeded demo cases, the
 * whole path from report to release instruction, every refusal, and the
 * separation of duties.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ApproveWorkOrderInput,
  MoneyTrail,
  OrderLine,
  UserRole,
  WorkQueueItem,
} from "@/shared";
import type { Issue } from "@/data/types";
import { schema } from "../db";
import {
  APPROVER_EMAIL,
  BUYER_EMAIL,
  DEMO_CASE_REFERENCE,
  DEMO_SUPPLIER_REF,
  PROCUREMENT_CASE_A_REFERENCE,
  PROCUREMENT_CASE_B_REFERENCE,
  RECEIVER_EMAIL,
  SUPPLIER_EMAIL,
} from "../seed";
import { body, createTestWorld, type TestWorld } from "../test/harness";
import { FINANCE_NOTE_CONSTANTS } from "./notes";
import {
  ADMIN,
  DISTRICT,
  OTHER_ADMIN,
  REPORTER,
  REVIEWER,
  SIGNED_OUT,
  addAccount,
  api,
  invoiceFor,
  openAssessedCase,
  orderAndDeliver,
  sumOf,
  withoutPrices,
  type Cast,
  type Headers,
} from "./testkit";

let world: TestWorld;
let cast: Cast;
let rival: { id: string; headers: Headers };

const lines: OrderLine[] = [
  {
    sku: "GUTTER-3M",
    description: "Gutter length, 3 m",
    quantity: 8,
    unitPriceCents: 31_500,
  },
  { sku: "BRACKET", description: "Gutter bracket", quantity: 24, unitPriceCents: 2_250 },
  { sku: "LABOUR", description: "Fit and seal", quantity: 1, unitPriceCents: 240_000 },
];
const TOTAL = sumOf(lines); // 546 000 cents
const order: ApproveWorkOrderInput = {
  supplierRef: DEMO_SUPPLIER_REF,
  description: "Replace the gutters on the admin block.",
  lines,
};

interface ErrorBody {
  error: { code: string; message: string; blockers?: { code: string }[] };
}
const trailOf = (response: Response) => body<MoneyTrail>(response);
const errorOf = async (response: Response) =>
  ((await response.json()) as ErrorBody).error;
const queueOf = async (headers: Headers) =>
  (await body<WorkQueueItem[]>(await api.queue(headers))).map((i) => [
    i.reference,
    i.action,
  ]);

async function setRole(userId: string, role: UserRole): Promise<void> {
  await world.ctx.db
    .update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userId));
}
async function userId(email: string): Promise<string> {
  const [user] = await world.ctx.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return user.id;
}

beforeAll(async () => {
  world = await createTestWorld();
  cast = {
    reporter: world.as(REPORTER),
    admin: world.as(ADMIN),
    buyer: world.as(BUYER_EMAIL),
    supplier: world.as(SUPPLIER_EMAIL),
    receiver: world.as(RECEIVER_EMAIL),
    reviewer: world.as(REVIEWER),
    approver: world.as(APPROVER_EMAIL),
  };
  rival = await addAccount(world, {
    id: "00000000-0000-4000-8000-090000000101",
    role: "supplier",
    displayName: "Rival Supplier",
    supplier: { ref: "SUP-RIVAL-01", name: "Rival Roofing" },
  });
}, 60_000);

afterAll(async () => {
  await world.close();
});

describe("seeded procurement cases", () => {
  it("leaves the pinned demo case without a work order", async () => {
    const demo = await body<Issue>(await api.issue(DEMO_CASE_REFERENCE, SIGNED_OUT));
    expect(demo.status).toBe("repair_claimed");
    expect(demo.publicTrail).toEqual([]);
    expect((await api.trail(DEMO_CASE_REFERENCE, cast.buyer)).status).toBe(404);
  });

  it("seeds case A ready for a live invoice", async () => {
    const issue = await body<Issue>(
      await api.issue(PROCUREMENT_CASE_A_REFERENCE, SIGNED_OUT),
    );
    expect(issue.status).toBe("repair_claimed");
    expect(issue.schoolName).toBe("Thandolwethu Primary School");
    expect(issue.publicTrail?.map((s) => [s.type, s.actor])).toEqual([
      ["work_order_approved", "buyer"],
      ["work_order_acknowledged", "supplier"],
      ["goods_receipt_recorded", "receiving_officer"],
    ]);
    const trail = await trailOf(
      await api.trail(PROCUREMENT_CASE_A_REFERENCE, cast.buyer),
    );
    expect(trail.stage).toBe("order_acknowledged");
    expect(trail.order).toMatchObject({
      version: 1,
      acknowledged: true,
      supplierRef: DEMO_SUPPLIER_REF,
      totalCents: 420_000,
    });
    expect(trail.invoices).toEqual([]);
    expect(trail.receipts).toHaveLength(1);
    expect(trail.gate.blockers.map((b) => b.code)).toEqual([
      "repair_not_verified",
      "no_matching_invoice",
    ]);
    expect(await queueOf(cast.supplier)).toEqual([
      [PROCUREMENT_CASE_A_REFERENCE, "submit_invoice"],
    ]);
  });

  it("seeds case B through to an authorised release, with a blocked first invoice", async () => {
    const trail = await trailOf(
      await api.trail(PROCUREMENT_CASE_B_REFERENCE, cast.approver),
    );
    expect(trail.stage).toBe("release_authorised");
    expect(trail.releaseAuthorisedAt).not.toBeNull();
    expect(trail.invoices.map((i) => [i.invoiceNumber, i.match?.outcome])).toEqual([
      ["INV-2026-0931", "blocked"],
      ["INV-2026-0931-A", "matched"],
    ]);
    expect(trail.invoices[0].match?.reasons).toEqual([
      {
        code: "unit_price_mismatch",
        sku: "VALVE-BALL-25",
        expected: 16_500,
        actual: 19_500,
      },
      { code: "total_mismatch", sku: null, expected: 898_000, actual: 904_000 },
    ]);
    expect(trail.steps.map((s) => s.type)).toEqual([
      "work_order_approved",
      "work_order_acknowledged",
      "goods_receipt_recorded",
      "invoice_submitted",
      "match_recorded",
      "invoice_submitted",
      "match_recorded",
      "release_authorised",
    ]);
    expect(trail.steps.map((s) => s.actorName)).toEqual([
      "Ms Naledi Dlamini",
      "Mr Themba Zulu",
      "Mrs Ayanda Ngcobo",
      "Mr Themba Zulu",
      null,
      "Mr Themba Zulu",
      null,
      "Mr Pieter van Wyk",
    ]);
    const issue = await body<Issue>(
      await api.issue(PROCUREMENT_CASE_B_REFERENCE, SIGNED_OUT),
    );
    expect(issue.status).toBe("independently_verified");
    expect(issue.publicTrail?.filter((s) => s.type === "match_recorded")).toMatchObject([
      { actor: "system", outcome: "blocked" },
      { actor: "system", outcome: "matched" },
    ]);
  });
});

describe("the demo path on case A", () => {
  const A = PROCUREMENT_CASE_A_REFERENCE;
  const ordered: OrderLine[] = [
    {
      sku: "LED-TUBE-18W",
      description: "LED tube light fitting, 18 W",
      quantity: 12,
      unitPriceCents: 18_500,
    },
    {
      sku: "DB-BREAKER-20A",
      description: "Distribution board circuit breaker, 20 A",
      quantity: 2,
      unitPriceCents: 24_000,
    },
    {
      sku: "LABOUR-ELEC",
      description: "Electrician: fit, test and certify",
      quantity: 1,
      unitPriceCents: 150_000,
    },
  ];

  it("blocks a wrong invoice with its reasons, then matches the right one", async () => {
    const wrong = ordered.map((line) =>
      line.sku === "LED-TUBE-18W" ? { ...line, quantity: 14 } : line,
    );
    const blocked = await api.invoice(A, invoiceFor("INV-7001", wrong), cast.supplier);
    expect(blocked.status).toBe(201);
    const first = await trailOf(blocked);
    expect(first.stage).toBe("invoice_blocked");
    expect(first.invoices.at(-1)?.match).toMatchObject({
      outcome: "blocked",
      reasons: [
        { code: "excess_quantity", sku: "LED-TUBE-18W", expected: 12, actual: 14 },
        { code: "quantity_mismatch", sku: "LED-TUBE-18W", expected: 12, actual: 14 },
        { code: "total_mismatch", sku: null, expected: 420_000, actual: 457_000 },
      ],
    });

    // The same number again is one more reason, even with the right lines.
    const reused = await trailOf(
      await api.invoice(A, invoiceFor(" inv-7001 ", ordered), cast.supplier),
    );
    expect(reused.invoices.at(-1)?.match?.reasons).toEqual([
      { code: "duplicate_invoice", sku: null, expected: null, actual: null },
    ]);

    const right = await api.invoice(A, invoiceFor("INV-7002", ordered), cast.supplier);
    expect(right.status).toBe(201);
    const matched = await trailOf(right);
    expect(matched.invoices.at(-1)?.match).toMatchObject({
      outcome: "matched",
      reasons: [],
    });
    // Case A is already repair_claimed, so the next step is the reviewer's.
    expect(matched.stage).toBe("awaiting_verification");
    expect(await queueOf(cast.supplier)).toEqual([]);
  });

  it("keeps the release locked until the reviewer verifies, then authorises it once", async () => {
    expect(await queueOf(cast.approver)).toEqual([[A, "authorise_release"]]);
    const locked = await api.release(A, cast.approver);
    expect(locked.status).toBe(409);
    expect(await errorOf(locked)).toMatchObject({
      code: "conflict",
      blockers: [{ code: "repair_not_verified" }],
    });

    const verified = await api.verify(A, cast.reviewer);
    expect(verified.status).toBe(200);
    expect((await body<Issue>(verified)).status).toBe("independently_verified");
    const ready = await trailOf(await api.trail(A, cast.approver));
    expect(ready.stage).toBe("ready_for_release");
    expect(ready.gate).toEqual({ open: true, blockers: [] });

    const released = await api.release(A, cast.approver);
    expect(released.status).toBe(201);
    const done = await trailOf(released);
    expect(done.stage).toBe("release_authorised");
    expect(done.steps.at(-1)).toMatchObject({
      type: "release_authorised",
      actor: "payment_approver",
      actorName: "Mr Pieter van Wyk",
    });

    const second = await api.release(A, cast.approver);
    expect(second.status).toBe(409);
    expect((await errorOf(second)).blockers).toEqual([{ code: "already_released" }]);
    expect(await queueOf(cast.approver)).toEqual([]);

    // Nothing more can be added to a released order.
    expect(
      (await api.invoice(A, invoiceFor("INV-7003", ordered), cast.supplier)).status,
    ).toBe(409);
    expect(
      (await api.receive(A, { lines: withoutPrices(ordered) }, cast.receiver)).status,
    ).toBe(409);

    // The release changed nothing about the report itself.
    const issue = await body<Issue>(await api.issue(A, SIGNED_OUT));
    expect(issue.status).toBe("independently_verified");
    expect(issue.publicTrail?.at(-1)).toMatchObject({
      type: "release_authorised",
      actor: "payment_approver",
    });
    for (const step of issue.publicTrail ?? []) {
      expect(FINANCE_NOTE_CONSTANTS).toContain(step.note);
      expect(step.note).not.toMatch(/\bpaid\b/i);
    }
  });
});

describe("the whole path through the routes", () => {
  let id: string;
  let reference: string;

  it("goes from a report to a release instruction, one role per step", async () => {
    ({ id, reference } = await openAssessedCase(
      cast,
      "Gutters on the admin block have fallen",
    ));
    expect(await queueOf(cast.buyer)).toContainEqual([reference, "approve_order"]);

    const approved = await api.approve(id, order, cast.buyer);
    expect(approved.status).toBe(201);
    const first = await trailOf(approved);
    expect(first).toMatchObject({
      issueId: id,
      reference,
      stage: "order_approved",
      pricesVisible: true,
      order: {
        version: 1,
        supplierName: "Emseni Building and Electrical Supplies",
        totalCents: TOTAL,
        currency: "ZAR",
        acknowledged: false,
      },
    });
    expect(first.steps).toHaveLength(1);
    expect((await api.approve(id, order, cast.buyer)).status).toBe(409);
    expect(await queueOf(cast.supplier)).toContainEqual([reference, "acknowledge_order"]);

    const acknowledged = await api.acknowledge(id, cast.supplier);
    expect(acknowledged.status).toBe(200);
    expect((await trailOf(acknowledged)).stage).toBe("order_acknowledged");
    expect((await api.acknowledge(id, cast.supplier)).status).toBe(409);
    expect(await queueOf(cast.receiver)).toContainEqual([reference, "record_receipt"]);

    const received = await api.receive(
      id,
      { lines: withoutPrices(lines), evidenceDigests: [`0x${"ab".repeat(32)}`] },
      cast.receiver,
    );
    expect(received.status).toBe(201);
    const afterReceipt = await trailOf(received);
    expect(afterReceipt.pricesVisible).toBe(false);
    expect(afterReceipt.receipts).toMatchObject([{ orderVersion: 1, evidenceCount: 1 }]);
    expect(JSON.stringify(afterReceipt)).not.toMatch(/unitPriceCents|totalCents/);

    const invoiced = await api.invoice(id, invoiceFor("INV-GUT-1", lines), cast.supplier);
    expect(invoiced.status).toBe(201);
    const matched = await trailOf(invoiced);
    expect(matched.stage).toBe("invoice_matched");
    expect(matched.invoices[0]).toMatchObject({
      invoiceNumber: "INV-GUT-1",
      totalCents: TOTAL,
      match: { outcome: "matched", reasons: [] },
    });

    const early = await api.release(id, cast.approver);
    expect(early.status).toBe(409);
    expect((await errorOf(early)).blockers).toEqual([{ code: "repair_not_verified" }]);

    expect((await api.claim(id, cast.admin)).status).toBe(200);
    expect((await trailOf(await api.trail(id, cast.approver))).stage).toBe(
      "awaiting_verification",
    );
    expect((await api.verify(id, cast.reviewer)).status).toBe(200);

    const released = await api.release(id, cast.approver);
    expect(released.status).toBe(201);
    const done = await trailOf(released);
    expect(done.stage).toBe("release_authorised");
    expect(done.steps.map((s) => s.type)).toEqual([
      "work_order_approved",
      "work_order_acknowledged",
      "goods_receipt_recorded",
      "invoice_submitted",
      "match_recorded",
      "release_authorised",
    ]);
    expect((await api.release(id, cast.approver)).status).toBe(409);
  });

  it("gives each reader the view the matrix allows", async () => {
    for (const headers of [
      cast.buyer,
      cast.approver,
      world.as(DISTRICT),
      cast.supplier,
    ]) {
      const trail = await trailOf(await api.trail(id, headers));
      expect(trail.pricesVisible).toBe(true);
      expect(trail.order.totalCents).toBe(TOTAL);
    }
    for (const headers of [cast.receiver, cast.admin, cast.reviewer]) {
      const trail = await trailOf(await api.trail(id, headers));
      expect(trail.pricesVisible).toBe(false);
      expect(trail.order.supplierName).toBe("Emseni Building and Electrical Supplies");
      expect(JSON.stringify(trail)).not.toMatch(
        /unitPriceCents|totalCents|31500|240000|546000/,
      );
    }
    // A supplier sees its own name on its own steps, and roles for everyone else.
    const own = await trailOf(await api.trail(id, cast.supplier));
    expect(own.steps.map((s) => s.actorName)).toEqual([
      null,
      "Mr Themba Zulu",
      null,
      "Mr Themba Zulu",
      null,
      null,
    ]);
  });

  it("returns a finance document's body only to a reader who may see what is in it", async () => {
    const full = await trailOf(await api.trail(id, cast.buyer));
    const eventOf = (type: string) => full.steps.find((s) => s.type === type)!.eventId;
    interface Doc {
      kind: string;
      commitment: string;
      receipt: unknown;
      document?: Record<string, unknown>;
    }
    const read = (eventId: string, headers: Headers) =>
      api.document(id, eventId, headers).then((r) => body<Doc>(r));

    for (const type of [
      "work_order_approved",
      "invoice_submitted",
      "goods_receipt_recorded",
      "match_recorded",
      "release_authorised",
    ]) {
      for (const headers of [
        SIGNED_OUT,
        cast.reporter,
        rival.headers,
        world.as(OTHER_ADMIN),
      ]) {
        const doc = await read(eventOf(type), headers);
        expect(Object.keys(doc).sort(), type).toEqual([
          "commitment",
          "kind",
          "receipt",
          "recordId",
        ]);
        expect(doc.commitment).toMatch(/^0x[0-9a-f]{64}$/);
      }
      for (const headers of [
        cast.buyer,
        cast.approver,
        world.as(DISTRICT),
        cast.supplier,
      ]) {
        expect((await read(eventOf(type), headers)).document, type).toBeDefined();
      }
    }
    expect(
      (await read(eventOf("work_order_approved"), cast.buyer)).document,
    ).toMatchObject({
      type: "work_order",
      totalCents: TOTAL,
      currency: "ZAR",
    });
    // Roles without prices: only the documents that state none.
    for (const headers of [cast.receiver, cast.admin, cast.reviewer]) {
      expect(
        (await read(eventOf("goods_receipt_recorded"), headers)).document,
      ).toBeDefined();
      expect((await read(eventOf("release_authorised"), headers)).document).toMatchObject(
        {
          decision: "authorised",
        },
      );
      for (const type of ["work_order_approved", "invoice_submitted", "match_recorded"]) {
        expect((await read(eventOf(type), headers)).document, type).toBeUndefined();
      }
    }
    // The report's own document is as public as it always was.
    expect((await read(id, SIGNED_OUT)).document).toMatchObject({ type: "report" });
  });
});

describe("refusals", () => {
  let id: string;
  const everyone = () =>
    ({
      reporter: cast.reporter,
      school_admin: cast.admin,
      district_official: world.as(DISTRICT),
      independent_reviewer: cast.reviewer,
      buyer: cast.buyer,
      supplier: cast.supplier,
      receiving_officer: cast.receiver,
      payment_approver: cast.approver,
    }) satisfies Record<UserRole, Headers>;

  beforeAll(async () => {
    ({ id } = await openAssessedCase(cast, "Staff room door does not lock"));
    await orderAndDeliver(cast, id, order);
  });

  const writes: [
    name: string,
    allowed: UserRole,
    call: (headers: Headers) => Promise<Response>,
  ][] = [
    ["work order", "buyer", (h) => api.approve(id, order, h)],
    ["acknowledgement", "supplier", (h) => api.acknowledge(id, h)],
    ["invoice", "supplier", (h) => api.invoice(id, invoiceFor("INV-NO", lines), h)],
    [
      "goods receipt",
      "receiving_officer",
      (h) => api.receive(id, { lines: withoutPrices(lines) }, h),
    ],
    ["release", "payment_approver", (h) => api.release(id, h)],
  ];

  it.each(writes)(
    "%s: 401 signed out, 403 for every other role",
    async (_name, allowed, call) => {
      expect((await call(SIGNED_OUT)).status).toBe(401);
      for (const [role, headers] of Object.entries(everyone())) {
        if (role === allowed) continue;
        const refused = await call(headers);
        expect(refused.status, role).toBe(403);
        expect((await errorOf(refused)).code).toBe("forbidden");
      }
    },
  );

  it("reading: 401 signed out, 403 for a reporter, 404 without a work order", async () => {
    expect((await api.trail(id, SIGNED_OUT)).status).toBe(401);
    expect((await api.trail(id, cast.reporter)).status).toBe(403);
    expect((await api.queue(SIGNED_OUT)).status).toBe(401);
    expect((await api.queue(cast.reporter)).status).toBe(403);
    expect((await api.trail("BB-2026-000047", cast.buyer)).status).toBe(404);
    expect((await api.trail("BB-2026-999999", cast.buyer)).status).toBe(404);
    // Staff with nothing to do get an empty queue, not an error.
    for (const headers of [cast.admin, cast.reviewer, world.as(DISTRICT)]) {
      const response = await api.queue(headers);
      expect(response.status).toBe(200);
      expect(await body(response)).toEqual([]);
    }
  });

  it("a supplier cannot read or act on another supplier's order", async () => {
    expect((await api.trail(id, rival.headers)).status).toBe(403);
    expect((await api.acknowledge(id, rival.headers)).status).toBe(403);
    expect(
      (await api.invoice(id, invoiceFor("INV-RIVAL", lines), rival.headers)).status,
    ).toBe(403);
    expect(await body(await api.queue(rival.headers))).toEqual([]);
    expect((await api.trail(id, cast.supplier)).status).toBe(200);
  });

  it("staff of another school cannot read this school's trail", async () => {
    expect((await api.trail(id, world.as(OTHER_ADMIN))).status).toBe(403);
    expect((await api.trail(id, cast.admin)).status).toBe(200);
  });

  it("refuses bad input with 422 and wrong states with 409 or 404", async () => {
    const fresh = await openAssessedCase(cast, "Hall floor tiles are lifting");
    const bad: [string, unknown][] = [
      [
        "a fraction of a cent",
        { ...order, lines: [{ ...lines[0], unitPriceCents: 315.5 }] },
      ],
      ["a fractional quantity", { ...order, lines: [{ ...lines[0], quantity: 1.5 }] }],
      ["a negative price", { ...order, lines: [{ ...lines[0], unitPriceCents: -1 }] }],
      ["no lines", { ...order, lines: [] }],
      ["the same line twice", { ...order, lines: [lines[0], lines[0]] }],
      ["an unknown supplier", { ...order, supplierRef: "SUP-NOBODY" }],
      [
        "a total too large to record",
        { ...order, lines: [{ ...lines[0], unitPriceCents: 2_000_000_000 }] },
      ],
    ];
    for (const [name, payload] of bad) {
      const refused = await api.approve(fresh.id, payload, cast.buyer);
      expect(refused.status, name).toBe(422);
    }
    // No work order yet: nothing to acknowledge, invoice, receive or release.
    expect((await api.acknowledge(fresh.id, cast.supplier)).status).toBe(404);
    expect(
      (await api.invoice(fresh.id, invoiceFor("INV-X", lines), cast.supplier)).status,
    ).toBe(404);
    expect(
      (await api.receive(fresh.id, { lines: withoutPrices(lines) }, cast.receiver))
        .status,
    ).toBe(404);
    expect((await api.release(fresh.id, cast.approver)).status).toBe(404);

    // An order on a report the school has not assessed is refused.
    const created = await api.report(
      { title: "Unassessed report", description: "Nobody has looked at this yet." },
      cast.reporter,
    );
    const unassessed = await body<{ issueId: string }>(created);
    expect((await api.approve(unassessed.issueId, order, cast.buyer)).status).toBe(409);

    // Invoice input: a float total, and an invoice before the acknowledgement.
    expect((await api.approve(fresh.id, order, cast.buyer)).status).toBe(201);
    expect(
      (
        await api.invoice(
          fresh.id,
          { ...invoiceFor("INV-F", lines), totalCents: 10.5 },
          cast.supplier,
        )
      ).status,
    ).toBe(422);
    expect(
      (await api.invoice(fresh.id, invoiceFor("INV-EARLY", lines), cast.supplier)).status,
    ).toBe(409);
    // A delivery of something that was never ordered.
    expect(
      (
        await api.receive(
          fresh.id,
          { lines: [{ sku: "PAINT", description: "Paint", quantity: 1 }] },
          cast.receiver,
        )
      ).status,
    ).toBe(422);
  });

  it("separation of duties: the same person cannot take a second duty on a case", async () => {
    const buyerId = await userId(BUYER_EMAIL);
    const reviewerId = await userId(REVIEWER);
    const adminId = await userId(ADMIN);
    const receiverId = await userId(RECEIVER_EMAIL);
    try {
      // The buyer who approved the order is moved to receiving: refused on this case.
      await setRole(buyerId, "receiving_officer");
      const received = await api.receive(id, { lines: withoutPrices(lines) }, cast.buyer);
      expect(received.status).toBe(403);
      expect((await errorOf(received)).message).toContain("Separation of duties");
      await setRole(buyerId, "buyer");

      // The receiving officer is moved to supplier: still not the bound supplier.
      await setRole(receiverId, "supplier");
      expect((await api.acknowledge(id, cast.receiver)).status).toBe(403);
      await setRole(receiverId, "receiving_officer");

      // Take the case to a matched invoice and a verified repair.
      expect(
        (await api.invoice(id, invoiceFor("INV-SEP-1", lines), cast.supplier)).status,
      ).toBe(201);
      expect((await api.claim(id, cast.admin)).status).toBe(200);
      expect((await api.verify(id, cast.reviewer)).status).toBe(200);

      // Whoever approved, received, reviewed or claimed cannot also authorise.
      for (const [who, personId, headers, role] of [
        ["the buyer", buyerId, cast.buyer, "buyer"],
        ["the receiving officer", receiverId, cast.receiver, "receiving_officer"],
        ["the reviewer", reviewerId, cast.reviewer, "independent_reviewer"],
        ["the school administrator", adminId, cast.admin, "school_admin"],
      ] as const) {
        await setRole(personId, "payment_approver");
        const refused = await api.release(id, headers);
        await setRole(personId, role);
        expect(refused.status, who).toBe(409);
        expect((await errorOf(refused)).blockers, who).toEqual([{ code: "same_person" }]);
      }

      // A different person may.
      expect((await api.release(id, cast.approver)).status).toBe(201);
    } finally {
      await setRole(buyerId, "buyer");
      await setRole(receiverId, "receiving_officer");
      await setRole(reviewerId, "independent_reviewer");
      await setRole(adminId, "school_admin");
    }
  });
});
