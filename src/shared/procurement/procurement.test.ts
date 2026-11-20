import { describe, expect, it } from "vitest";
import { REPORT_STATUSES } from "../domain";
import { USER_ROLES } from "../roles";
import {
  MATCH_REASON_CODES,
  MATCHED_EXPLANATION,
  MoneyTrailSchema,
  RELEASE_BLOCKER_CODES,
  formatRand,
  matchThreeWay,
  normaliseInvoiceNumber,
  reasonSentence,
  redactMoneyTrail,
  redactReasons,
  releaseGate,
  ruleExplanation,
  visibilityFor,
  type MatchInput,
  type MatchReason,
  type MoneyTrail,
  type ReleaseGateInput,
} from "./index";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

/* ------------------------------- matchThreeWay ------------------------------ */

const pans = {
  sku: "PAN-01",
  description: "Toilet pan",
  quantity: 4,
  unitPriceCents: 105_000,
};
const cisterns = {
  sku: "CIS-02",
  description: "Cistern",
  quantity: 2,
  unitPriceCents: 80_000,
};
const TOTAL = 4 * 105_000 + 2 * 80_000; // 580 000 cents

/** An order, an invoice and a receipt that agree exactly. */
function exact(): MatchInput {
  return {
    order: {
      version: 1,
      acknowledgedVersion: 1,
      supplierRef: "SUP-0042",
      lines: [pans, cisterns],
      totalCents: TOTAL,
    },
    invoice: {
      invoiceNumber: "INV-001",
      orderVersion: 1,
      supplierRef: "SUP-0042",
      lines: [pans, cisterns],
      totalCents: TOTAL,
    },
    priorInvoiceNumbers: [],
    receipts: [
      {
        orderVersion: 1,
        lines: [
          { sku: "PAN-01", description: "Toilet pan", quantity: 4 },
          { sku: "CIS-02", description: "Cistern", quantity: 2 },
        ],
      },
    ],
  };
}

type Row = [name: string, change: (input: MatchInput) => void, expected: MatchReason[]];

const reason = (
  code: MatchReason["code"],
  sku: string | null = null,
  expected: number | null = null,
  actual: number | null = null,
): MatchReason => ({ code, sku, expected, actual });

const rows: Row[] = [
  ["an exact match", () => {}, []],
  [
    "invoice lines in a different order",
    (i) => {
      i.invoice.lines = [cisterns, pans];
    },
    [],
  ],
  [
    "two receipts that add up to the order",
    (i) => {
      i.receipts = [
        {
          orderVersion: 1,
          lines: [{ sku: "PAN-01", description: "Toilet pan", quantity: 1 }],
        },
        {
          orderVersion: 1,
          lines: [
            { sku: "PAN-01", description: "Toilet pan", quantity: 3 },
            { sku: "CIS-02", description: "Cistern", quantity: 2 },
          ],
        },
      ];
    },
    [],
  ],
  [
    "a different invoice number from an earlier one",
    (i) => {
      i.priorInvoiceNumbers = ["INV-000"];
    },
    [],
  ],
  [
    "an invoice against an older order version",
    (i) => {
      i.order.version = 2;
      i.order.acknowledgedVersion = 2;
      i.receipts[0]!.orderVersion = 2;
    },
    [reason("order_version_changed", null, 2, 1)],
  ],
  [
    "an order nobody acknowledged",
    (i) => {
      i.order.acknowledgedVersion = null;
    },
    [reason("order_not_acknowledged")],
  ],
  [
    "an acknowledgement of an older version",
    (i) => {
      i.order.version = 2;
      i.invoice.orderVersion = 2;
      i.receipts[0]!.orderVersion = 2;
    },
    [reason("order_not_acknowledged")],
  ],
  [
    "another supplier's reference",
    (i) => {
      i.invoice.supplierRef = "SUP-9999";
    },
    [reason("wrong_supplier")],
  ],
  [
    "a reused invoice number",
    (i) => {
      i.priorInvoiceNumbers = ["INV-001"];
    },
    [reason("duplicate_invoice")],
  ],
  [
    "a reused invoice number in another case and spacing",
    (i) => {
      i.invoice.invoiceNumber = "  inv - 001 ";
      i.priorInvoiceNumbers = ["INV-001"];
    },
    [reason("duplicate_invoice")],
  ],
  [
    "no goods receipt at all",
    (i) => {
      i.receipts = [];
    },
    [reason("missing_receipt")],
  ],
  [
    "a goods receipt for an older version only",
    (i) => {
      i.order.version = 2;
      i.order.acknowledgedVersion = 2;
      i.invoice.orderVersion = 2;
    },
    [reason("missing_receipt")],
  ],
  [
    "a line the order does not have",
    (i) => {
      const extra = {
        sku: "TAP-09",
        description: "Tap",
        quantity: 1,
        unitPriceCents: 20_000,
      };
      i.invoice.lines = [pans, cisterns, extra];
      i.invoice.totalCents = TOTAL + 20_000;
    },
    [reason("unknown_line", "TAP-09"), reason("total_mismatch", null, TOTAL, 600_000)],
  ],
  [
    "a line the invoice leaves out",
    (i) => {
      i.invoice.lines = [pans];
      i.invoice.totalCents = 420_000;
    },
    [reason("missing_line", "CIS-02"), reason("total_mismatch", null, TOTAL, 420_000)],
  ],
  [
    "more invoiced than received",
    (i) => {
      i.receipts[0]!.lines = [
        { sku: "PAN-01", description: "Toilet pan", quantity: 3 },
        { sku: "CIS-02", description: "Cistern", quantity: 2 },
      ];
    },
    [reason("excess_quantity", "PAN-01", 3, 4)],
  ],
  [
    "a line that was never received",
    (i) => {
      i.receipts[0]!.lines = [{ sku: "PAN-01", description: "Toilet pan", quantity: 4 }];
    },
    [reason("excess_quantity", "CIS-02", 0, 2)],
  ],
  [
    "fewer invoiced than ordered",
    (i) => {
      i.invoice.lines = [{ ...pans, quantity: 3 }, cisterns];
      i.invoice.totalCents = TOTAL - 105_000;
    },
    [
      reason("quantity_mismatch", "PAN-01", 4, 3),
      reason("total_mismatch", null, TOTAL, TOTAL - 105_000),
    ],
  ],
  [
    "more invoiced than ordered and received",
    (i) => {
      i.invoice.lines = [{ ...pans, quantity: 5 }, cisterns];
      i.invoice.totalCents = TOTAL + 105_000;
    },
    [
      reason("excess_quantity", "PAN-01", 4, 5),
      reason("quantity_mismatch", "PAN-01", 4, 5),
      reason("total_mismatch", null, TOTAL, TOTAL + 105_000),
    ],
  ],
  [
    "a higher unit price",
    (i) => {
      i.invoice.lines = [{ ...pans, unitPriceCents: 125_000 }, cisterns];
      i.invoice.totalCents = TOTAL + 80_000;
    },
    [
      reason("unit_price_mismatch", "PAN-01", 105_000, 125_000),
      reason("total_mismatch", null, TOTAL, TOTAL + 80_000),
    ],
  ],
  [
    "a unit price one cent out (no tolerance)",
    (i) => {
      i.invoice.lines = [pans, { ...cisterns, unitPriceCents: 80_001 }];
      i.invoice.totalCents = TOTAL + 2;
    },
    [
      reason("unit_price_mismatch", "CIS-02", 80_000, 80_001),
      reason("total_mismatch", null, TOTAL, TOTAL + 2),
    ],
  ],
  [
    "a stated total that is not the sum of the lines",
    (i) => {
      i.invoice.totalCents = TOTAL + 100;
    },
    [reason("total_mismatch", null, TOTAL, TOTAL + 100)],
  ],
  [
    "an order total the invoice lines do not reach",
    (i) => {
      i.order.totalCents = TOTAL + 5_000;
    },
    [reason("total_mismatch", null, TOTAL + 5_000, TOTAL)],
  ],
  [
    "everything wrong at once, in the stable order",
    (i) => {
      i.order.version = 2;
      i.order.acknowledgedVersion = 1;
      i.invoice.supplierRef = "SUP-9999";
      i.priorInvoiceNumbers = ["inv-001"];
      i.receipts = [];
      i.invoice.lines = [
        { sku: "ZINC-03", description: "Zinc sheet", quantity: 1, unitPriceCents: 1 },
        { ...pans, quantity: 6, unitPriceCents: 1 },
        { sku: "ACID-04", description: "Cleaner", quantity: 1, unitPriceCents: 1 },
      ];
      i.invoice.totalCents = 9;
    },
    [
      reason("order_version_changed", null, 2, 1),
      reason("order_not_acknowledged"),
      reason("wrong_supplier"),
      reason("duplicate_invoice"),
      reason("missing_receipt"),
      reason("unknown_line", "ACID-04"),
      reason("unknown_line", "ZINC-03"),
      reason("missing_line", "CIS-02"),
      reason("quantity_mismatch", "PAN-01", 4, 6),
      reason("unit_price_mismatch", "PAN-01", 105_000, 1),
      reason("total_mismatch", null, 8, 9),
    ],
  ],
];

describe("matchThreeWay", () => {
  it.each(rows)("%s", (_name, change, expected) => {
    const input = exact();
    change(input);
    const verdict = matchThreeWay(input);
    expect(verdict.reasons).toEqual(expected);
    expect(verdict.outcome).toBe(expected.length === 0 ? "matched" : "blocked");
  });

  it("reports reasons in the order of MATCH_REASON_CODES, whatever the input order", () => {
    for (const [, change] of rows) {
      const input = exact();
      change(input);
      const codes = matchThreeWay(input).reasons.map((r) =>
        MATCH_REASON_CODES.indexOf(r.code),
      );
      expect(codes).toEqual([...codes].sort((a, b) => a - b));
    }
  });

  it("is deterministic and does not change its input", () => {
    const input = exact();
    input.invoice.lines = [cisterns, { ...pans, quantity: 9 }];
    const before = JSON.stringify(input);
    const first = matchThreeWay(input);
    const second = matchThreeWay(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    [
      "a fractional unit price",
      (i: MatchInput) => (i.invoice.lines = [{ ...pans, unitPriceCents: 1050.5 }]),
    ],
    ["a fractional total", (i: MatchInput) => (i.invoice.totalCents = 5800.01)],
    [
      "a fractional quantity",
      (i: MatchInput) => (i.invoice.lines = [{ ...pans, quantity: 3.5 }]),
    ],
    ["a fractional order total", (i: MatchInput) => (i.order.totalCents = 0.1 + 0.2)],
    [
      "a fractional received quantity",
      (i: MatchInput) => (i.receipts[0]!.lines[0]!.quantity = 1.5),
    ],
    ["a NaN total", (i: MatchInput) => (i.invoice.totalCents = Number.NaN)],
    ["a negative total", (i: MatchInput) => (i.invoice.totalCents = -1)],
  ])("refuses %s instead of rounding it", (_name, change) => {
    const input = exact();
    change(input);
    expect(() => matchThreeWay(input)).toThrow(RangeError);
  });

  it("treats invoice numbers that differ only in case or spacing as the same", () => {
    expect(normaliseInvoiceNumber(" inv-001 ")).toBe(normaliseInvoiceNumber("INV-001"));
    expect(normaliseInvoiceNumber("INV 001")).toBe(normaliseInvoiceNumber("inv001"));
    expect(normaliseInvoiceNumber("INV-001")).not.toBe(normaliseInvoiceNumber("INV-002"));
  });
});

/* -------------------------------- releaseGate ------------------------------- */

function openGate(): ReleaseGateInput {
  return {
    reportStatus: "verified",
    orderVersion: 1,
    acknowledgedVersion: 1,
    latestMatch: { outcome: "matched", orderVersion: 1 },
    alreadyReleased: false,
    authoriserId: id(5),
    approverId: id(1),
    invoicerId: id(2),
    receiverIds: [id(3)],
    reviewerId: id(4),
  };
}

describe("releaseGate", () => {
  it("is open when everything holds", () => {
    expect(releaseGate(openGate())).toEqual({ open: true, blockers: [] });
  });

  it.each(REPORT_STATUSES.filter((status) => status !== "verified"))(
    "stays shut while the report is %s",
    (status) => {
      expect(releaseGate({ ...openGate(), reportStatus: status })).toEqual({
        open: false,
        blockers: [{ code: "repair_not_verified" }],
      });
    },
  );

  const shut: [string, Partial<ReleaseGateInput>, string][] = [
    ["no invoice has been matched", { latestMatch: null }, "no_matching_invoice"],
    [
      "the latest invoice is blocked",
      { latestMatch: { outcome: "blocked", orderVersion: 1 } },
      "no_matching_invoice",
    ],
    [
      "the match is for an older order version",
      {
        orderVersion: 2,
        acknowledgedVersion: 2,
        latestMatch: { outcome: "matched", orderVersion: 1 },
      },
      "no_matching_invoice",
    ],
    [
      "the order is not acknowledged",
      { acknowledgedVersion: null },
      "order_not_acknowledged",
    ],
    ["a release already exists", { alreadyReleased: true }, "already_released"],
    ["the authoriser approved the order", { authoriserId: id(1) }, "same_person"],
    ["the authoriser submitted the invoice", { authoriserId: id(2) }, "same_person"],
    ["the authoriser received the goods", { authoriserId: id(3) }, "same_person"],
    ["the authoriser reviewed the repair", { authoriserId: id(4) }, "same_person"],
    [
      "the authoriser claimed the repair for the school",
      { authoriserId: id(6), otherActorIds: [id(6)] },
      "same_person",
    ],
    [
      "the authoriser reviewed an earlier claim",
      { authoriserId: id(7), otherActorIds: [id(6), id(7)] },
      "same_person",
    ],
  ];
  it.each(shut)("is shut when %s", (_name, change, code) => {
    expect(releaseGate({ ...openGate(), ...change })).toEqual({
      open: false,
      blockers: [{ code }],
    });
  });

  it("returns every blocker, in the order of RELEASE_BLOCKER_CODES", () => {
    const gate = releaseGate({
      ...openGate(),
      reportStatus: "repair_claimed",
      latestMatch: null,
      acknowledgedVersion: null,
      alreadyReleased: true,
      authoriserId: id(1),
    });
    expect(gate.open).toBe(false);
    expect(gate.blockers.map((b) => b.code)).toEqual([...RELEASE_BLOCKER_CODES]);
  });

  it("stays open when other people acted for the school", () => {
    expect(releaseGate({ ...openGate(), otherActorIds: [id(6), id(7)] }).open).toBe(true);
  });

  it("does not treat a missing invoicer or reviewer as the authoriser", () => {
    const gate = releaseGate({ ...openGate(), invoicerId: null, reviewerId: null });
    expect(gate.blockers.map((b) => b.code)).not.toContain("same_person");
  });
});

/* ------------------------------ ruleExplanation ----------------------------- */

describe("ruleExplanation", () => {
  it.each([
    [0, "R0,00"],
    [5, "R0,05"],
    [99, "R0,99"],
    [100, "R1,00"],
    [420_000, "R4 200,00"],
    [105_050, "R1 050,50"],
    [123_456_789, "R1 234 567,89"],
  ])("formats %i cents as %s", (cents, text) => {
    expect(formatRand(cents)).toBe(text);
  });

  it("refuses to format a fraction of a cent", () => {
    expect(() => formatRand(10.5)).toThrow(RangeError);
  });

  // The wording of the reason table in docs/design/BONA_CHAIN_SCREENS.md.
  const sentences: [MatchReason, string][] = [
    [
      reason("order_version_changed", null, 2, 1),
      "The invoice is for version 1 of the order. The order is now version 2.",
    ],
    [reason("order_not_acknowledged"), "The order has not been acknowledged yet."],
    [
      reason("wrong_supplier"),
      "The supplier reference on the invoice is not the one on the order.",
    ],
    [reason("duplicate_invoice"), "This invoice number was already used on this order."],
    [reason("missing_receipt"), "No delivery has been recorded for this order yet."],
    [
      reason("unknown_line", "TAP-09"),
      "TAP-09: this line is on the invoice but not on the order.",
    ],
    [
      reason("missing_line", "CIS-02"),
      "CIS-02: this line is on the order but not on the invoice.",
    ],
    [
      reason("excess_quantity", "PAN-01", 3, 4),
      "PAN-01: 4 invoiced, but only 3 arrived.",
    ],
    [reason("quantity_mismatch", "PAN-01", 4, 3), "PAN-01: 3 invoiced, 4 ordered."],
    [
      reason("unit_price_mismatch", "PAN-01", 105_000, 125_000),
      "PAN-01: the unit price is R1 250,00. The order says R1 050,00.",
    ],
    [
      reason("unit_price_mismatch", "PAN-01"),
      "PAN-01: the unit price is not the one on the order.",
    ],
    [
      reason("total_mismatch", null, 420_000, 500_000),
      "The invoice total is R5 000,00. It should be R4 200,00.",
    ],
    [reason("total_mismatch"), "The invoice total is not the amount it should be."],
  ];
  it.each(sentences)("explains %j", (given, sentence) => {
    expect(reasonSentence(given)).toBe(sentence);
    expect(ruleExplanation([given])).toBe(sentence);
  });

  it("formats amounts with the formatter it is given", () => {
    expect(
      reasonSentence(reason("total_mismatch", null, 420_000, 500_000), (c) => `<${c}>`),
    ).toBe("The invoice total is <500000>. It should be <420000>.");
  });

  it("covers every reason code with a full sentence, with and without numbers", () => {
    for (const code of MATCH_REASON_CODES) {
      for (const given of [reason(code, "PAN-01", 2, 3), reason(code, "PAN-01")]) {
        const text = ruleExplanation([given]);
        expect(text, code).toMatch(/^[A-Z].*\.$/);
        expect(text, code).not.toMatch(/undefined|null|NaN/);
        expect(text, code).not.toContain(code);
      }
    }
  });

  it("writes the reasons in the order given", () => {
    const text = ruleExplanation([
      reason("missing_receipt"),
      reason("total_mismatch", null, 420_000, 500_000),
    ]);
    expect(text).toBe(
      "No delivery has been recorded for this order yet. The invoice total is R5 000,00. It should be R4 200,00.",
    );
  });

  it("never says paid or resolved", () => {
    const every = MATCH_REASON_CODES.flatMap((code) => [
      reason(code, "PAN-01", 2, 3),
      reason(code),
    ]);
    for (const text of [ruleExplanation(every), ruleExplanation([])]) {
      expect(text).not.toMatch(/\bpaid\b|\bresolved\b|\bpayment\b/i);
    }
  });

  it("leaves the amounts out when the reasons were redacted", () => {
    const text = ruleExplanation(
      redactReasons([
        reason("unit_price_mismatch", "PAN-01", 105_000, 125_000),
        reason("total_mismatch", null, 420_000, 500_000),
      ]),
    );
    expect(text).not.toMatch(/R\d/);
    expect(text).toContain("PAN-01");
  });

  it("says so when there is nothing to explain", () => {
    expect(ruleExplanation([])).toBe(MATCHED_EXPLANATION);
  });
});

/* -------------------------------- visibility -------------------------------- */

const now = "2026-11-20T08:00:00.000Z";

function trail(): MoneyTrail {
  return MoneyTrailSchema.parse({
    issueId: id(1),
    reference: "BB-2026-000123",
    workOrderId: id(2),
    stage: "invoice_blocked",
    pricesVisible: true,
    order: {
      id: id(2),
      version: 1,
      description: "Replace four toilet pans",
      supplierName: "Canary Plumbing",
      supplierRef: "SUP-0042",
      lines: [pans, cisterns],
      totalCents: TOTAL,
      currency: "ZAR",
      approvedAt: now,
      acknowledged: true,
      acknowledgedAt: now,
    },
    invoices: [
      {
        id: id(3),
        invoiceNumber: "INV-001",
        orderVersion: 1,
        lines: [{ ...pans, unitPriceCents: 125_000 }, cisterns],
        totalCents: 660_000,
        aiDrafted: false,
        submittedAt: now,
        match: {
          id: id(4),
          outcome: "blocked",
          reasons: [
            reason("excess_quantity", "PAN-01", 3, 4),
            reason("unit_price_mismatch", "PAN-01", 105_000, 125_000),
            reason("total_mismatch", null, TOTAL, 660_000),
          ],
          recordedAt: now,
        },
      },
      {
        id: id(5),
        invoiceNumber: "INV-002",
        orderVersion: 1,
        lines: [pans, cisterns],
        totalCents: TOTAL,
        aiDrafted: true,
        submittedAt: now,
        match: null,
      },
    ],
    receipts: [
      {
        id: id(6),
        orderVersion: 1,
        lines: [{ sku: "PAN-01", description: "Toilet pan", quantity: 4 }],
        evidenceCount: 1,
        recordedAt: now,
      },
    ],
    gate: { open: false, blockers: [{ code: "repair_not_verified" }] },
    releaseAuthorisedAt: null,
    steps: [
      {
        eventId: id(7),
        type: "work_order_approved",
        actor: "buyer",
        occurredAt: now,
        note: "A work order was approved.",
        ledger: { source: "none" },
        actorName: "Naledi Dlamini",
      },
    ],
  });
}

describe("procurement visibility", () => {
  it.each([
    ["buyer", "full"],
    ["payment_approver", "full"],
    ["district_official", "full"],
    ["supplier", "own_orders"],
    ["receiving_officer", "no_prices"],
    ["school_admin", "no_prices"],
    ["independent_reviewer", "no_prices"],
    ["reporter", "none"],
  ] as const)("gives %s the %s view", (role, visibility) => {
    expect(visibilityFor(role)).toBe(visibility);
  });

  it("gives a signed-out visitor nothing, and covers every role", () => {
    expect(visibilityFor(null)).toBe("none");
    for (const role of USER_ROLES) expect(visibilityFor(role)).toBeTruthy();
  });

  it("returns nothing at all for a viewer with no visibility", () => {
    expect(redactMoneyTrail(trail(), "none")).toBeNull();
  });

  it.each(["full", "own_orders"] as const)(
    "leaves the %s view unchanged",
    (visibility) => {
      expect(redactMoneyTrail(trail(), visibility)).toEqual(trail());
    },
  );

  it("removes every price, total and price number from the no-prices view", () => {
    const redacted = redactMoneyTrail(trail(), "no_prices")!;
    expect(redacted.pricesVisible).toBe(false);
    const text = JSON.stringify(redacted);
    expect(text).not.toMatch(/unitPriceCents|totalCents/);
    for (const amount of [105_000, 125_000, 80_000, TOTAL, 660_000]) {
      expect(text).not.toContain(String(amount));
    }
    expect(redacted.invoices[0]!.match!.reasons).toEqual([
      reason("excess_quantity", "PAN-01", 3, 4),
      reason("unit_price_mismatch", "PAN-01"),
      reason("total_mismatch"),
    ]);
    expect(MoneyTrailSchema.safeParse(redacted).success).toBe(true);
  });

  it("keeps names, scope, quantities and the gate in the no-prices view", () => {
    const redacted = redactMoneyTrail(trail(), "no_prices")!;
    expect(redacted.order.supplierName).toBe("Canary Plumbing");
    expect(redacted.order.description).toBe("Replace four toilet pans");
    expect(redacted.order.lines.map((l) => [l.sku, l.quantity])).toEqual([
      ["PAN-01", 4],
      ["CIS-02", 2],
    ]);
    expect(redacted.invoices.map((i) => i.invoiceNumber)).toEqual(["INV-001", "INV-002"]);
    expect(redacted.receipts).toEqual(trail().receipts);
    expect(redacted.steps[0]!.actorName).toBe("Naledi Dlamini");
    expect(redacted.gate).toEqual(trail().gate);
  });

  it("does not change the trail it was given", () => {
    const original = trail();
    redactMoneyTrail(original, "no_prices");
    expect(original).toEqual(trail());
  });
});
