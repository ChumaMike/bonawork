/**
 * The two places Bona AI meets the procurement trail over HTTP: the mismatch
 * explanation and "what is blocking payment?". In tests there is no model
 * provider, so the code-written path answers; what is checked here is who is
 * allowed to hear what.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MismatchExplanation, MoneyTrail } from "@/shared";
import type { AssistantMessage } from "@/data/types";
import { POST as explanation } from "@/app/api/issues/[id]/match/[matchId]/explanation/route";
import {
  APPROVER_EMAIL,
  PROCUREMENT_CASE_A_REFERENCE,
  PROCUREMENT_CASE_B_REFERENCE,
  RECEIVER_EMAIL,
  SUPPLIER_EMAIL,
} from "../seed";
import {
  body,
  createTestWorld,
  jsonRequest,
  params,
  type TestWorld,
} from "../test/harness";
import { REPORTER, SIGNED_OUT, api, type Headers } from "./testkit";

let world: TestWorld;
let approver: Headers;
let supplier: Headers;
let receiver: Headers;
let reporter: Headers;

const explain = (id: string, matchId: string, headers: Headers) =>
  explanation(
    jsonRequest(
      "POST",
      `/api/issues/${id}/match/${matchId}/explanation`,
      undefined,
      headers,
    ),
    params({ id, matchId }),
  );
const ask = async (question: string, headers: Headers) =>
  body<AssistantMessage>(await api.assistant(question, headers));

beforeAll(async () => {
  world = await createTestWorld();
  approver = world.as(APPROVER_EMAIL);
  supplier = world.as(SUPPLIER_EMAIL);
  receiver = world.as(RECEIVER_EMAIL);
  reporter = world.as(REPORTER);
}, 60_000);

afterAll(async () => {
  await world.close();
});

describe("mismatch explanation route", () => {
  it("explains a blocked invoice from the rule engine's reasons, for a reader who may see prices", async () => {
    const trail = await body<MoneyTrail>(
      await api.trail(PROCUREMENT_CASE_B_REFERENCE, approver),
    );
    const blocked = trail.invoices[0].match;
    expect(blocked?.outcome).toBe("blocked");

    const response = await explain(PROCUREMENT_CASE_B_REFERENCE, blocked!.id, approver);
    expect(response.status).toBe(200);
    const answer = await body<MismatchExplanation>(response);
    expect(answer.source).toBe("rules");
    expect(answer.text).toMatch(/^Invoice blocked/);
    expect(answer.text).not.toMatch(/\bpaid\b|resolved/i);
  });

  it("keeps prices out of the explanation for a role that may not see them", async () => {
    const trail = await body<MoneyTrail>(
      await api.trail(PROCUREMENT_CASE_B_REFERENCE, approver),
    );
    const answer = await body<MismatchExplanation>(
      await explain(PROCUREMENT_CASE_B_REFERENCE, trail.invoices[0].match!.id, receiver),
    );
    expect(answer.text).toMatch(/^Invoice blocked/);
    expect(answer.text).not.toMatch(/165|195|8 980|9 040/);
  });

  it("refuses the public and a reporter, and an unknown match", async () => {
    const trail = await body<MoneyTrail>(
      await api.trail(PROCUREMENT_CASE_B_REFERENCE, approver),
    );
    const matchId = trail.invoices[0].match!.id;
    expect(
      (await explain(PROCUREMENT_CASE_B_REFERENCE, matchId, SIGNED_OUT)).status,
    ).toBe(401);
    expect((await explain(PROCUREMENT_CASE_B_REFERENCE, matchId, reporter)).status).toBe(
      403,
    );
    expect(
      (
        await explain(
          PROCUREMENT_CASE_B_REFERENCE,
          "00000000-0000-4000-8000-0000000000aa",
          approver,
        )
      ).status,
    ).toBe(404);
  });
});

describe("what is blocking payment?", () => {
  const question = `What is blocking payment on ${PROCUREMENT_CASE_A_REFERENCE}?`;

  it("tells the payment approver what the gate is waiting for", async () => {
    const answer = await ask(question, approver);
    expect(answer.role).toBe("assistant");
    expect(answer.text).toMatch(/invoice|verif/i);
    expect(answer.actions?.[0].href).toMatch(/^\/issues\//);
  });

  it("tells the public nothing about the order", async () => {
    const [publicAnswer, approverAnswer] = [
      await ask(question, SIGNED_OUT),
      await ask(question, approver),
    ];
    expect(publicAnswer.text).not.toBe(approverAnswer.text);
    expect(publicAnswer.text).not.toMatch(
      /R\s?\d|Emseni|Zulu|Dlamini|invoice does not match/i,
    );
    const reporterAnswer = await ask(question, reporter);
    expect(reporterAnswer.text).toBe(publicAnswer.text);
  });

  it("answers the supplier about its own order", async () => {
    const answer = await ask(question, supplier);
    expect(answer.text).not.toBe((await ask(question, SIGNED_OUT)).text);
  });
});

describe("asking the ledger about a release", () => {
  const probe = async (id: string, headers: Headers) => {
    const { POST } = await import("@/app/api/issues/[id]/release/probe/route");
    return POST(
      jsonRequest("POST", `/api/issues/${id}/release/probe`, undefined, headers),
      params({ id }),
    );
  };

  it("answers with the ledger's own refusal while the repair is unverified", async () => {
    const response = await probe(PROCUREMENT_CASE_A_REFERENCE, approver);
    expect(response.status).toBe(200);
    const answer = await body<{
      allowed: boolean;
      revert: string | null;
      source: string;
    }>(response);
    // Case A has no invoice yet, so the ledger refuses before it reaches the repair.
    expect(answer.allowed).toBe(false);
    expect(answer.revert).toBe("NoInvoice");
    expect(answer.source).toBe("simulated");
  });

  it("is only for the payment approver, and writes nothing", async () => {
    expect((await probe(PROCUREMENT_CASE_A_REFERENCE, SIGNED_OUT)).status).toBe(401);
    expect((await probe(PROCUREMENT_CASE_A_REFERENCE, supplier)).status).toBe(403);
    expect((await probe(PROCUREMENT_CASE_A_REFERENCE, reporter)).status).toBe(403);
    const before = await body<MoneyTrail>(
      await api.trail(PROCUREMENT_CASE_A_REFERENCE, approver),
    );
    await probe(PROCUREMENT_CASE_A_REFERENCE, approver);
    const after = await body<MoneyTrail>(
      await api.trail(PROCUREMENT_CASE_A_REFERENCE, approver),
    );
    expect(after.steps.length).toBe(before.steps.length);
    expect(after.releaseAuthorisedAt).toBeNull();
  });
});
