import {
  compareLine,
  hashAssessment,
  keywordMatcher,
  overallLevel,
  pickListedPrice,
  PriceCheckInvoiceSchema,
  searchQuery,
  type CandidateOffer,
  type ItemMatcher,
  type PriceCheckAssessment,
  type PriceCheckInvoice,
  type PriceCheckLineResult,
  type PriceCheckResult,
} from "@/shared/price-check";
import type { Invoice } from "@/shared/procurement";
import { env } from "../env";
import {
  createFirecrawlSearch,
  FirecrawlError,
  FIRECRAWL_RESULT_LIMIT,
  withMemoryCache,
  type SearchFn,
  type WebResult,
} from "./firecrawl";

/**
 * `checkInvoicePrices` compares each material line of an invoice with prices
 * at South African hardware shops. The result is advice for people: it never
 * approves, blocks or changes the three-way match. Any failure (no key,
 * timeout, bad response, nothing comparable) makes a line `unavailable`.
 */

export interface PriceCheckDeps {
  /** Defaults to Firecrawl with FIRECRAWL_API_KEY, cached per process. */
  search?: SearchFn;
  /** Defaults to keyword overlap. The seam for a later AI matcher. */
  matcher?: ItemMatcher;
  now?: () => Date;
}

let defaultSearch: SearchFn | null = null;

function processSearch(): SearchFn {
  defaultSearch ??= withMemoryCache(
    createFirecrawlSearch({ apiKey: env().FIRECRAWL_API_KEY }),
  );
  return defaultSearch;
}

const UNAVAILABLE_NOTES: Record<FirecrawlError["kind"] | "unknown", string> = {
  not_configured: "Shop prices are not set up here, so this line was not compared.",
  timeout: "The shop price search took too long, so this line was not compared.",
  http: "The shop price search failed, so this line was not compared.",
  network: "The shop price search could not be reached, so this line was not compared.",
  invalid_response:
    "The shop price search gave an unreadable answer, so this line was not compared.",
  unknown: "The shop price search failed, so this line was not compared.",
};

function unavailable(lineId: string, note: string): PriceCheckLineResult {
  return {
    lineId,
    level: "unavailable",
    medianCents: null,
    percentAbove: null,
    offers: [],
    note,
  };
}

/** Turn search results into offers: same item, a believable price, one of the listed shops. */
export function offersFromResults(
  description: string,
  results: readonly WebResult[],
  matcher: ItemMatcher,
  fetchedAt: string,
): CandidateOffer[] {
  const offers: CandidateOffer[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (seen.has(r.url)) continue;
    const title = (r.title || r.description).trim().slice(0, 200);
    if (!title || !matcher.match(description, title).matches) continue;
    const priceCents = pickListedPrice(r.markdown) ?? pickListedPrice(r.description);
    if (priceCents === null) continue;
    seen.add(r.url);
    offers.push({ retailer: r.retailer, url: r.url, title, priceCents, fetchedAt });
    if (offers.length === FIRECRAWL_RESULT_LIMIT) break;
  }
  return offers;
}

export async function checkInvoicePrices(
  invoice: PriceCheckInvoice,
  deps: PriceCheckDeps = {},
): Promise<PriceCheckResult> {
  const { lines } = PriceCheckInvoiceSchema.parse(invoice);
  const search = deps.search ?? processSearch();
  const matcher = deps.matcher ?? keywordMatcher;
  const checkedAt = (deps.now?.() ?? new Date()).toISOString();

  const results = await Promise.all(
    lines.map(async (line): Promise<PriceCheckLineResult> => {
      if (line.kind === "service") {
        return unavailable(
          line.lineId,
          "Labour and services have no shop price, so this line was not compared.",
        );
      }
      const query = searchQuery(line.description);
      if (!query) return unavailable(line.lineId, UNAVAILABLE_NOTES.unknown);
      let found: WebResult[];
      try {
        found = await search(query);
      } catch (error) {
        const kind = error instanceof FirecrawlError ? error.kind : "unknown";
        return unavailable(line.lineId, UNAVAILABLE_NOTES[kind]);
      }
      return compareLine(
        line,
        offersFromResults(line.description, found, matcher, checkedAt),
      );
    }),
  );

  const assessment: PriceCheckAssessment = {
    lines: results,
    overall: overallLevel(results.map((r) => r.level)),
    checkedAt,
  };
  return { ...assessment, sourcesHash: await hashAssessment(assessment) };
}

/**
 * The price-check input for a stored invoice. Stored lines carry no VAT flag
 * or kind, so the caller states them: `vatInclusive` for the whole invoice,
 * and the SKUs that are labour or other services.
 */
export function priceCheckInputFromInvoice(
  invoice: Pick<Invoice, "lines">,
  options: { vatInclusive: boolean; serviceSkus?: readonly string[] },
): PriceCheckInvoice {
  const services = new Set(options.serviceSkus ?? []);
  return {
    lines: invoice.lines.map((l) => ({
      lineId: l.sku,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      vatInclusive: options.vatInclusive,
      kind: services.has(l.sku) ? "service" : "material",
    })),
  };
}
