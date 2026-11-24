import { describe, expect, it } from "vitest";
import {
  addVat,
  canonicalJson,
  compareLine,
  extractPrices,
  formatRand,
  hashAssessment,
  hashCanonical,
  keywordMatcher,
  keywords,
  levelFor,
  medianCents,
  overallLevel,
  parseRandPrice,
  percentAbove,
  pickListedPrice,
  searchQuery,
  vatInclusiveCents,
  type CandidateOffer,
  type PriceCheckAssessment,
} from ".";

describe("parseRandPrice", () => {
  it.each([
    ["R899", 89_900],
    ["R 899", 89_900],
    ["R899.00", 89_900],
    ["R899,00", 89_900],
    ["R1 299,00", 129_900],
    ["R 1 299,00", 129_900],
    ["R1 299.00", 129_900],
    ["R1,299.00", 129_900],
    ["R1.299,00", 129_900],
    ["R1,299", 129_900],
    ["R1299.99", 129_999],
    ["R12,50", 1_250],
    ["R1 299,00", 129_900],
    ["R12 345 678.90", 1_234_567_890],
    ["From R289.00", 28_900],
    ["Price: R 45,95 incl. VAT", 4_595],
  ])("%s -> %i cents", (text, cents) => {
    expect(parseRandPrice(text)).toBe(cents);
  });

  it.each([
    ["no price here"],
    ["ZAR"],
    ["Rands only"],
    ["R"],
    ["BR899"],
    ["R1234567890"],
  ])("%s -> null", (text) => {
    expect(parseRandPrice(text)).toBeNull();
  });

  it("does not join a size to the price", () => {
    expect(parseRandPrice("R899 100mm pipe")).toBe(89_900);
  });

  it("labels was, now, from and save amounts", () => {
    expect(
      extractPrices("Was R1 199.00 Now R1 049.00 Save R150 From R10 R20 off").map(
        (p) => p.context,
      ),
    ).toEqual(["was", "now", "save", "from", "save"]);
  });
});

describe("pickListedPrice", () => {
  it("prefers the Now price", () => {
    expect(pickListedPrice("Was R1 199.00 Now R1 049.00")).toBe(104_900);
    expect(pickListedPrice("Was: R500 Now: R450")).toBe(45_000);
  });
  it("skips was and save amounts without a now price", () => {
    expect(pickListedPrice("Was R1 199.00 Save R150.00 R1 049.00")).toBe(104_900);
  });
  it("accepts a From price", () => {
    expect(pickListedPrice("From R289.00")).toBe(28_900);
  });
  it("skips implausible amounts such as an empty cart or R1", () => {
    expect(pickListedPrice("Cart R0.00 R1 R4.99 then R899.00")).toBe(89_900);
    expect(pickListedPrice("R600 000.00")).toBeNull();
    expect(pickListedPrice("Cart R0.00")).toBeNull();
  });
});

describe("VAT", () => {
  it("adds 15%, rounded half up to the cent", () => {
    expect(addVat(100_000)).toBe(115_000);
    expect(addVat(10)).toBe(12); // 11.5 -> 12
    expect(addVat(3)).toBe(3); // 3.45 -> 3
  });
  it("leaves a VAT-inclusive price alone", () => {
    expect(vatInclusiveCents(95_000, true)).toBe(95_000);
    expect(vatInclusiveCents(95_000, false)).toBe(109_250);
  });
  it("compares an ex-VAT line after adding VAT", () => {
    const offers = [offer(100_000)];
    // R1 000 ex VAT is R1 150 with VAT: 15% above, ok. Read as incl. VAT it would be 0%.
    const ex = compareLine(
      { lineId: "a", unitPriceCents: 100_000, vatInclusive: false },
      offers,
    );
    expect(ex.percentAbove).toBe(15);
    expect(ex.note).toContain("R1 150.00 (with 15% VAT added)");
    const inc = compareLine(
      { lineId: "a", unitPriceCents: 100_000, vatInclusive: true },
      offers,
    );
    expect(inc.percentAbove).toBe(0);
  });
  it("can move a line across a boundary", () => {
    // 1 100 ex VAT = 1 265 incl.: 26.5% above 1 000.
    const r = compareLine({ lineId: "a", unitPriceCents: 110_000, vatInclusive: false }, [
      offer(100_000),
    ]);
    expect(r.level).toBe("check");
  });
});

function offer(priceCents: number, n = 0): CandidateOffer {
  return {
    retailer: "Builders",
    url: `https://www.builders.co.za/p/${n}-${priceCents}`,
    title: "Item",
    priceCents,
    fetchedAt: "2026-11-24T10:00:00.000Z",
  };
}

describe("median, percent and level", () => {
  it("takes the median", () => {
    expect(medianCents([])).toBeNull();
    expect(medianCents([5])).toBe(5);
    expect(medianCents([3, 1, 2])).toBe(2);
    expect(medianCents([1, 2, 3, 4])).toBe(3); // 2.5 rounds half up
    expect(medianCents([100, 200])).toBe(150);
  });

  it("rounds the percent half away from zero", () => {
    expect(percentAbove(185_000, 95_000)).toBe(95);
    expect(percentAbove(100_500, 100_000)).toBe(1); // 0.5
    expect(percentAbove(99_500, 100_000)).toBe(-1);
    expect(percentAbove(100_000, 100_000)).toBe(0);
  });

  it("puts the boundaries exactly where stated", () => {
    expect(levelFor(125_000, 100_000)).toBe("ok"); // exactly 25%
    expect(levelFor(125_001, 100_000)).toBe("check");
    expect(levelFor(175_000, 100_000)).toBe("check"); // exactly 75%
    expect(levelFor(175_001, 100_000)).toBe("high");
    expect(levelFor(50_000, 100_000)).toBe("ok"); // below is fine
  });

  it("does not let a rounded percent decide the level", () => {
    // 25.4% rounds to 25 but is over the line.
    const r = compareLine({ lineId: "a", unitPriceCents: 125_400, vatInclusive: true }, [
      offer(100_000),
    ]);
    expect(r.percentAbove).toBe(25);
    expect(r.level).toBe("check");
  });

  it("is unavailable without offers", () => {
    const r = compareLine({ lineId: "a", unitPriceCents: 1, vatInclusive: true }, []);
    expect(r).toMatchObject({
      level: "unavailable",
      medianCents: null,
      percentAbove: null,
      offers: [],
    });
  });

  it("writes the demo sentence", () => {
    const r = compareLine({ lineId: "c", unitPriceCents: 185_000, vatInclusive: true }, [
      offer(104_900, 1),
      offer(89_900, 2),
      offer(95_000, 3),
    ]);
    expect(r.level).toBe("high");
    expect(r.note).toBe(
      "R1 850.00 is 95% above the median of 3 shop prices (R950.00). Ask for a cost breakdown.",
    );
    expect(r.offers.map((o) => o.priceCents)).toEqual([89_900, 95_000, 104_900]);
    expect(r.offers[0]).not.toHaveProperty("fetchedAt");
  });

  it("orders offers the same way whatever order they arrive in", () => {
    const a = compareLine({ lineId: "x", unitPriceCents: 1_000, vatInclusive: true }, [
      offer(900, 1),
      offer(900, 2),
    ]);
    const b = compareLine({ lineId: "x", unitPriceCents: 1_000, vatInclusive: true }, [
      offer(900, 2),
      offer(900, 1),
    ]);
    expect(a).toEqual(b);
  });

  it("takes the worst level overall", () => {
    expect(overallLevel([])).toBe("unavailable");
    expect(overallLevel(["unavailable", "ok"])).toBe("ok");
    expect(overallLevel(["ok", "high", "check", "unavailable"])).toBe("high");
  });

  it("formats rand", () => {
    expect(formatRand(185_000)).toBe("R1 850.00");
    expect(formatRand(5)).toBe("R0.05");
    expect(formatRand(123_456_789)).toBe("R1 234 567.89");
  });
});

describe("keyword matching", () => {
  it("normalises words and sizes", () => {
    expect(keywords("PVC Sewer Pipe, 110 mm x 6 m (each)")).toEqual([
      "pvc",
      "sewer",
      "pipe",
      "110mm",
      "6m",
    ]);
    expect(keywords("Cistern 9 Litre")).toEqual(["cistern", "9l"]);
    expect(keywords("Pipe 1,5 m")).toEqual(["pipe", "1.5m"]);
    expect(searchQuery("Toilet cistern 9 litre white")).toBe("toilet cistern 9l white");
  });

  it("matches the same item", () => {
    expect(
      keywordMatcher.match("PVC sewer pipe 110mm x 6m", "Sewer Pipe PVC 110 mm 6 m")
        .matches,
    ).toBe(true);
    expect(
      keywordMatcher.match("Dual flush valve", "Universal Dual Flush Valves").matches,
    ).toBe(true);
  });

  it("rejects a different size", () => {
    const v = keywordMatcher.match(
      "PVC sewer pipe 110mm x 6m",
      "PVC Sewer Pipe 50mm x 6m",
    );
    expect(v.matches).toBe(false);
    expect(v.missingUnits).toEqual(["110mm"]);
    expect(keywordMatcher.match("Copper pipe 15mm", "Copper Pipe 22mm").matches).toBe(
      false,
    );
  });

  it("rejects too little overlap", () => {
    expect(
      keywordMatcher.match("Toilet cistern white", "Garden hose white").matches,
    ).toBe(false);
    expect(keywordMatcher.match("the and of", "anything").matches).toBe(false);
  });
});

describe("manifest hash", () => {
  const assessment: PriceCheckAssessment = {
    lines: [
      {
        lineId: "a",
        level: "ok",
        medianCents: 100,
        percentAbove: 0,
        offers: [],
        note: "n",
      },
    ],
    overall: "ok",
    checkedAt: "2026-11-24T10:00:00.000Z",
  };

  it("sorts keys", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}',
    );
  });

  it("hashes the same assessment to the same value whatever the key order", async () => {
    const shuffled = {
      checkedAt: assessment.checkedAt,
      overall: assessment.overall,
      lines: assessment.lines,
    };
    const h = await hashAssessment(assessment);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    expect(await hashAssessment(shuffled)).toBe(h);
    expect(await hashCanonical(assessment)).toBe(h);
  });

  it("changes when anything changes", async () => {
    const h = await hashAssessment(assessment);
    expect(
      await hashAssessment({ ...assessment, checkedAt: "2026-11-24T10:00:01.000Z" }),
    ).not.toBe(h);
  });

  it("ignores a stray sourcesHash field", async () => {
    const h = await hashAssessment(assessment);
    expect(
      await hashAssessment({
        ...assessment,
        sourcesHash: "0xabc",
      } as PriceCheckAssessment),
    ).toBe(h);
  });
});
