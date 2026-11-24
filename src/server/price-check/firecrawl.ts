import { z } from "zod";

/**
 * A minimal Firecrawl client: one call, `POST /v2/search` with a markdown
 * scrape of each result, restricted to South African hardware shops.
 * Request and response shapes from https://docs.firecrawl.dev/api-reference/endpoint/search
 *
 * Everything Firecrawl returns is page content from the open web and is
 * treated as untrusted data: it is validated, cut to size, and only ever
 * searched for prices and keywords. It is never passed to a model.
 */

export const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v2";
export const FIRECRAWL_TIMEOUT_MS = 10_000;
/** At most this many results per invoice line. */
export const FIRECRAWL_RESULT_LIMIT = 3;
/** Page text beyond this is dropped before parsing. */
export const MAX_PAGE_CHARS = 20_000;

/** The shops searched, by hostname. */
export const SA_RETAILERS = {
  "builders.co.za": "Builders",
  "buco.co.za": "BUCO",
  "cashbuild.co.za": "Cashbuild",
  "leroymerlin.co.za": "Leroy Merlin",
  "plumblink.co.za": "Plumblink",
} as const;
export type RetailerDomain = keyof typeof SA_RETAILERS;
export const RETAILER_DOMAINS = Object.keys(SA_RETAILERS) as RetailerDomain[];

/** The shop a URL belongs to, or null when it is not one of `SA_RETAILERS`. */
export function retailerOf(url: string): string | null {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const domain of RETAILER_DOMAINS) {
    if (host === domain || host.endsWith(`.${domain}`)) return SA_RETAILERS[domain];
  }
  return null;
}

/** The body sent to `POST /v2/search`. */
export interface FirecrawlSearchRequest {
  query: string;
  limit: number;
  country: string;
  includeDomains: string[];
  timeout: number;
  scrapeOptions: { formats: { type: "markdown" }[]; onlyMainContent: boolean };
}

const text = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => (s ?? "").slice(0, max));

const WebResultSchema = z.object({
  url: z.string().max(2048),
  title: text(300),
  description: text(1000),
  markdown: text(MAX_PAGE_CHARS),
});

/** The part of the search response this client reads. Unknown fields are ignored. */
export const FirecrawlSearchResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({ web: z.array(z.unknown()).nullish() }).nullish(),
  warning: z.string().nullish(),
});

export interface WebResult {
  url: string;
  retailer: string;
  title: string;
  description: string;
  markdown: string;
}

export class FirecrawlError extends Error {
  constructor(
    readonly kind: "not_configured" | "timeout" | "http" | "invalid_response" | "network",
    message: string,
  ) {
    super(message);
    this.name = "FirecrawlError";
  }
}

export type SearchFn = (query: string) => Promise<WebResult[]>;

export interface FirecrawlOptions {
  apiKey: string | undefined;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

export function buildSearchRequest(query: string): FirecrawlSearchRequest {
  return {
    query,
    limit: FIRECRAWL_RESULT_LIMIT,
    country: "ZA",
    includeDomains: [...RETAILER_DOMAINS],
    timeout: FIRECRAWL_TIMEOUT_MS,
    scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true },
  };
}

/** Keep only well-formed results from the listed shops, at most `FIRECRAWL_RESULT_LIMIT`. */
export function readSearchResponse(body: unknown): WebResult[] {
  const parsed = FirecrawlSearchResponseSchema.safeParse(body);
  if (!parsed.success || !parsed.data.success) {
    throw new FirecrawlError(
      "invalid_response",
      "Firecrawl returned an unexpected response.",
    );
  }
  const results: WebResult[] = [];
  for (const raw of parsed.data.data?.web ?? []) {
    const item = WebResultSchema.safeParse(raw);
    if (!item.success) continue;
    const retailer = retailerOf(item.data.url);
    if (!retailer) continue;
    results.push({ ...item.data, retailer });
    if (results.length === FIRECRAWL_RESULT_LIMIT) break;
  }
  return results;
}

/** A search function over Firecrawl. Throws `FirecrawlError` on any failure. */
export function createFirecrawlSearch(options: FirecrawlOptions): SearchFn {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? FIRECRAWL_BASE_URL;
  const timeoutMs = options.timeoutMs ?? FIRECRAWL_TIMEOUT_MS;

  return async (query) => {
    if (!options.apiKey) {
      throw new FirecrawlError("not_configured", "FIRECRAWL_API_KEY is not set.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildSearchRequest(query)),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new FirecrawlError(
          "timeout",
          `Firecrawl did not answer within ${timeoutMs} ms.`,
        );
      }
      throw new FirecrawlError(
        "network",
        `Firecrawl could not be reached: ${String(error)}`,
      );
    }
    try {
      if (!response.ok) {
        throw new FirecrawlError("http", `Firecrawl answered ${response.status}.`);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        if (controller.signal.aborted) {
          throw new FirecrawlError(
            "timeout",
            `Firecrawl did not answer within ${timeoutMs} ms.`,
          );
        }
        throw new FirecrawlError("invalid_response", "Firecrawl did not return JSON.");
      }
      return readSearchResponse(body);
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Wrap a search so each query is fetched once per process. Failures are not
 * cached, so the next check tries again.
 */
export function withMemoryCache(
  search: SearchFn,
  cache = new Map<string, Promise<WebResult[]>>(),
) {
  const cached: SearchFn = (query) => {
    const key = query.trim().toLowerCase();
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = search(query);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
    return pending;
  };
  return Object.assign(cached, { clear: () => cache.clear(), size: () => cache.size });
}
