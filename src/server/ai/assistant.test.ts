import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_CASE_REFERENCE } from "../seed";
import { createTestWorld, type TestWorld } from "../test/harness";
import { askAssistant, assistantMode, statusLine, type Generate } from "./assistant";

let world: TestWorld;

beforeAll(async () => {
  world = await createTestWorld();
}, 60_000);

afterAll(async () => {
  await world.close();
});

const model = "anthropic/claude-haiku-5-5";

describe("Bona AI", () => {
  it("falls back to a keyword match without a provider and grounds it in records", async () => {
    const reply = await askAssistant(
      { db: world.ctx.db, generate: null, model },
      { question: "The girls toilets at Thandolwethu are not flushing" },
    );
    expect(reply.role).toBe("assistant");
    expect(reply.text).toContain("keyword match");
    expect(reply.issues?.[0].reference).toBe(DEMO_CASE_REFERENCE);
    expect(reply.actions?.map((a) => a.label)).toEqual(["I'm affected too", "Report it"]);
    expect(reply.actions?.[0].href).toBe(`/issues/${reply.issues?.[0].id}`);
    expect(reply.actions?.[1].href).toContain("schoolId=");
  });

  it("answers a reference lookup and an unknown reference deterministically", async () => {
    const known = await askAssistant(
      { db: world.ctx.db, generate: null, model },
      { question: `What happened to ${DEMO_CASE_REFERENCE}?` },
    );
    expect(known.issues?.[0].reference).toBe(DEMO_CASE_REFERENCE);
    const unknown = await askAssistant(
      { db: world.ctx.db, generate: null, model },
      { question: "Where is BB-2026-999999?" },
    );
    expect(unknown.issues).toBeUndefined();
    expect(unknown.text).toContain("BB-2026-999999");
  });

  it("uses the provider's text and only cites issues it was given", async () => {
    const seen: Parameters<Generate>[0][] = [];
    const generate: Generate = async (input) => {
      seen.push(input);
      const id = input.prompt.match(/id=([0-9a-f-]{36})/)?.[1];
      return JSON.stringify({
        text: "This looks like the girls' toilet report that is already open. Open it and tap I'm affected too.",
        issueIds: [id, "00000000-0000-4000-8000-999999999999"],
        mentionSchool: true,
      });
    };
    const reply = await askAssistant(
      { db: world.ctx.db, generate, model },
      {
        question: "girls toilets at Thandolwethu broken",
        history: [{ id: "u1", role: "user", text: "hi" }],
      },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].model).toBe(model);
    expect(seen[0].timeoutMs).toBe(8000);
    expect(seen[0].system).toMatch(/Never invent/);
    expect(seen[0].prompt).toContain(DEMO_CASE_REFERENCE);
    expect(seen[0].prompt).not.toContain("Lindiwe");
    expect(reply.text).toContain("already open");
    expect(reply.issues).toHaveLength(1);
    expect(reply.issues?.[0].reference).toBe(DEMO_CASE_REFERENCE);
    expect(reply.school?.name).toBe("Thandolwethu Primary School");
  });

  it("falls back when the provider throws, times out or returns something unusable", async () => {
    const failing: Generate = async () => {
      throw new Error("HTTP 500 from the gateway");
    };
    const malformed: Generate = async () => "I am not JSON";
    const wrongShape: Generate = async () => JSON.stringify({ answer: 42 });
    for (const generate of [failing, malformed, wrongShape]) {
      const reply = await askAssistant(
        { db: world.ctx.db, generate, model },
        { question: "girls toilets broken at Thandolwethu" },
      );
      expect(reply.text).toContain("unavailable");
      expect(reply.issues?.[0].reference).toBe(DEMO_CASE_REFERENCE);
    }
  });
});

describe("assistantMode", () => {
  const base = { AI_MODE: "auto" as const, AI_MODEL: "google/gemini-2.5-flash-lite" };
  it("uses the gateway on Vercel without a key, through the project's OIDC token", () => {
    expect(assistantMode({ ...base, VERCEL: "1" })).toBe("gateway");
  });
  it("uses the gateway anywhere with a key", () => {
    expect(assistantMode({ ...base, AI_GATEWAY_API_KEY: "k" })).toBe("gateway");
  });
  it("falls back locally without a key, and always when switched off", () => {
    expect(assistantMode(base)).toBe("fallback");
    expect(
      assistantMode({ ...base, AI_MODE: "off", VERCEL: "1", AI_GATEWAY_API_KEY: "k" }),
    ).toBe("fallback");
  });
});

describe("statusLine", () => {
  it("states a claimed repair in fixed English, whatever language the model used", () => {
    const line = statusLine([
      { reference: "BB-2026-000042", status: "repair_claimed" } as Parameters<
        typeof statusLine
      >[0][number],
    ]);
    expect(line).toBe(
      "BB-2026-000042: Repair claimed. The school says this is fixed. An independent reviewer has not checked it yet.",
    );
  });
});
