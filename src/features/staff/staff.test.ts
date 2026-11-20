import { describe, expect, it } from "vitest";
import type { Issue, IssueStatus, TimelineEvent } from "@/data/types";
import { ISSUE_STATUSES } from "@/data/types";
import { getMessages } from "@/i18n";
import { ANSWERS, groupQueue, nextToReply, queueRow } from "./queue";
import { allAnswered, checksLine, composeReviewNote } from "./review-note";

const m = getMessages();
const NOW = Date.parse("2026-11-18T10:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function event(type: TimelineEvent["type"], days: number, note: string): TimelineEvent {
  return {
    id: `${type}-${days}`,
    type,
    note,
    actor: type === "reported" ? "community" : "school_admin",
    occurredAt: ago(days),
    ledger: { source: "none" },
  };
}

function issue(id: string, status: IssueStatus, over: Partial<Issue> = {}): Issue {
  return {
    id,
    reference: `BB-2026-${id.padStart(6, "0")}`,
    schoolId: "school",
    schoolName: "Sample Primary",
    schoolTown: "Sampletown",
    category: "water",
    title: `Report ${id}`,
    location: "Gate",
    status,
    createdAt: ago(1),
    updatedAt: ago(0),
    endorsements: 3,
    endorsedByMe: false,
    hasInterimProtection: false,
    evidenceCount: 0,
    description: "Water runs all day.",
    authority: { name: "School", responsibility: "Repairs", level: "school" },
    interimProtection: null,
    review: null,
    timeline: [event("reported", 1, "Reported.")],
    evidence: [],
    ...over,
  };
}

describe("the school's short list", () => {
  it("never offers a school a way to verify, and has no resolved status", () => {
    for (const status of ISSUE_STATUSES) {
      const offered: string[] = [...ANSWERS[status].main, ...ANSWERS[status].other];
      expect(offered).not.toContain("verify");
      expect(ANSWERS[status].main.length).toBeLessThanOrEqual(2);
    }
    expect(Object.keys(ANSWERS)).not.toContain("resolved");
    // A claim waits for a reviewer: the school has nothing left to answer.
    expect(ANSWERS.repair_claimed).toEqual({ main: [], other: [] });
    expect(ANSWERS.independently_verified).toEqual({ main: [], other: [] });
  });

  it("groups by urgency, oldest first, and marks the late ones", () => {
    const groups = groupQueue(
      [
        issue("1", "reported", { createdAt: ago(1) }),
        issue("2", "reported", { createdAt: ago(3) }),
        issue("3", "disputed", { createdAt: ago(30) }),
        issue("4", "being_addressed", {
          timeline: [
            event("reported", 9, "Reported."),
            event("progress_recorded", 2, "Glass ordered."),
          ],
        }),
        issue("5", "repair_claimed", {
          timeline: [
            event("reported", 9, "Reported."),
            event("repair_claimed", 1, "All fixed."),
          ],
        }),
        issue("6", "independently_verified"),
        issue("7", "declined"),
      ],
      m,
      NOW,
    );
    expect(groups.reply.map((row) => row.issue.id)).toEqual(["3", "2", "1"]);
    expect(groups.reply.map((row) => row.late)).toEqual([true, true, false]);
    expect(groups.reply[1].line).toBe("Waiting 3 days");
    expect(groups.reply[2].line).toBe("Waiting 1 day");
    expect(groups.fixing[0].line).toBe("Glass ordered.");
    expect(groups.review[0].line).toBe("You said fixed yesterday");
    expect(groups.closed.map((row) => row.issue.id).sort()).toEqual(["6", "7"]);
  });

  it("marks a report with many people affected and no protection as urgent", () => {
    const crowded = issue("8", "under_assessment", { endorsements: 25 });
    expect(queueRow(crowded, m, NOW).late).toBe(true);
    const safe = issue("9", "under_assessment", {
      endorsements: 25,
      interimProtection: { description: "Fenced off.", recordedAt: ago(1) },
    });
    expect(queueRow(safe, m, NOW)).toMatchObject({
      late: false,
      line: m.admin.noUpdateYet,
    });
  });

  it("walks on to the next report that needs a reply", () => {
    const { reply } = groupQueue(
      [
        issue("a", "reported", { createdAt: ago(5) }),
        issue("b", "reported", { createdAt: ago(4) }),
        issue("c", "reported", { createdAt: ago(3) }),
      ],
      m,
      NOW,
    );
    expect(nextToReply(reply, "a")).toEqual({ id: "b", more: 2 });
    expect(nextToReply(reply, "c")).toEqual({ id: "a", more: 2 });
    // A report that was just answered has left the group.
    expect(nextToReply(reply, "elsewhere")).toEqual({ id: "a", more: 3 });
    expect(nextToReply(reply.slice(0, 1), "a")).toBeNull();
  });
});

describe("the reviewer's note", () => {
  it("only counts the checks as done when all three are answered", () => {
    expect(allAnswered([true, null, false])).toBe(false);
    expect(allAnswered([true, false, false])).toBe(true);
  });

  it("folds the three answers into the note as its last line", () => {
    expect(checksLine([true, false, false], m.reviewer)).toBe(
      "At the school: yes. Repair matches the claim: no. Safe to use: no.",
    );
    expect(
      composeReviewNote(
        "  One pane is still broken.  ",
        [true, false, false],
        m.reviewer,
      ),
    ).toBe(
      "One pane is still broken.\nAt the school: yes. Repair matches the claim: no. Safe to use: no.",
    );
  });
});
