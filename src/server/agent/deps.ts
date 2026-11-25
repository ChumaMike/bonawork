/**
 * The process-wide dependencies of the Bona Agent routes. Every one of them
 * works with its key missing: no AI key gives the code-written answer, no
 * Firecrawl key gives "no shop price" (or the recorded sample when asked).
 */
import { aiDeps } from "../ai/provider";
import { env } from "../env";
import { checkInvoicePrices } from "../price-check/service";
import { createDemoSearch } from "../price-check/fixtures";
import type { ScoutDeps } from "./repair-scout";

export function agentAi() {
  return aiDeps(env());
}

/** Live shop prices with a Firecrawl key; the recorded sample when asked for; else none. */
export function scoutDeps(demo: boolean): ScoutDeps {
  const live = Boolean(env().FIRECRAWL_API_KEY);
  const priceMode = live ? "live" : demo ? "sample" : "off";
  const search = priceMode === "sample" ? createDemoSearch() : undefined;
  return {
    ai: agentAi(),
    priceMode,
    checkPrices: (invoice) => checkInvoicePrices(invoice, search ? { search } : {}),
  };
}
