import { describe, expect, it } from "vitest";
import type { EvidenceItem, TimelineEvent } from "@/data/types";
import { matchEvidence } from "./timeline";

const at = (minute: number) => `2026-11-06T10:${String(minute).padStart(2, "0")}:00.000Z`;

function event(id: string, minute: number): TimelineEvent {
  return {
    id,
    type: "evidence_added",
    note: "",
    actor: "school",
    occurredAt: at(minute),
    ledger: { state: "not_anchored" },
  } as unknown as TimelineEvent;
}

function item(version: number, minute: number): EvidenceItem {
  return { id: `ev-${version}`, version, addedAt: at(minute) } as unknown as EvidenceItem;
}

describe("matchEvidence", () => {
  it("gives two files sent together their own numbers", () => {
    const matched = matchEvidence(
      [event("a", 5), event("b", 5), event("c", 1)],
      [item(5, 5), item(4, 5), item(1, 1)],
    );
    expect(matched.get("c")?.version).toBe(1);
    expect(matched.get("a")?.version).toBe(4);
    expect(matched.get("b")?.version).toBe(5);
  });

  it("leaves an entry unnamed when no item lines up in time", () => {
    expect(matchEvidence([event("a", 9)], [item(1, 1)]).has("a")).toBe(false);
  });
});
