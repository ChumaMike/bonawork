import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bonaChainFactoryViewsAbi, institutionFinanceEventsAbi } from "./bona-chain";
import { bonaRegistryAbi } from "./bona-registry";

/*
 * The verifier keeps its own copy of the ABI entries it needs and never imports
 * the contracts package. This test reads the generated JSON as data, only to
 * prove the copies have not drifted from the compiled contracts.
 */

type Entry = { type: string; name?: string };

function generated(file: string): Entry[] {
  const path = fileURLToPath(
    new URL(`../../../contracts/abi/chain/${file}`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as Entry[];
}

const events = (abi: readonly Entry[]) =>
  abi
    .filter((entry) => entry.type === "event")
    .sort((a, b) => (a.name! < b.name! ? -1 : 1));

describe("the verifier's copy of the BonaWork ABIs", () => {
  it("holds the eight InstitutionFinance events exactly as compiled", () => {
    expect(events(institutionFinanceEventsAbi)).toEqual(
      events(generated("finance.json")),
    );
    expect(institutionFinanceEventsAbi.map((event) => event.name).sort()).toEqual([
      "GoodsReceiptRecorded",
      "InvoiceSubmitted",
      "MatchRecorded",
      "PaymentDisputeClosed",
      "PaymentDisputeOpened",
      "ReleaseAuthorised",
      "WorkOrderAcknowledged",
      "WorkOrderApproved",
    ]);
  });

  it("holds the factory's kindOf and isGenuine views exactly as compiled", () => {
    const wanted = generated("factory.json").filter(
      (entry) =>
        entry.type === "function" && ["kindOf", "isGenuine"].includes(entry.name ?? ""),
    );
    expect([...bonaChainFactoryViewsAbi]).toEqual(wanted);
  });

  it("decodes InstitutionOperations events with the BonaRegistry copy: they are identical", () => {
    // The ABI JSON names enum types after their contract; everything a log is
    // decoded by (names, types, indexed flags, order) must be the same.
    const shape = (abi: readonly Entry[]) =>
      JSON.parse(
        JSON.stringify(events(abi), (key, value) =>
          key === "internalType" ? undefined : value,
        ),
      ) as unknown;
    const operations = shape(generated("operations.json")) as Entry[];
    const registry = (shape(bonaRegistryAbi as readonly Entry[]) as Entry[]).filter(
      (event) => operations.some((other) => other.name === event.name),
    );
    expect(operations).toHaveLength(7);
    expect(registry).toEqual(operations);
  });
});
