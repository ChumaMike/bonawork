import { z } from "zod";
import { detectStep, factsFrom, isFinished } from "@/features/demo/steps";
import { getContext } from "@/server/context";
import {
  demoCookieHeader,
  encodeDemoCookie,
  loadGuidedDemo,
  readDemoCookie,
  requireDemoMode,
  signInAsPerson,
  startGuidedDemo,
} from "@/server/demo/guided";
import { demoModeOn } from "@/server/demo/limits";
import { ok, parseJson, route } from "@/server/http";

export const maxDuration = 30;

/**
 * `GET /api/demo/guided`: public. `{ enabled, demo }`: whether the guided
 * demo is on, and this browser's demo case with its status, budget and escrow
 * (read from Solana devnet), or null when this browser has not started one.
 */
export const GET = route(async (request) => {
  if (!demoModeOn()) return ok({ enabled: false, demo: null });
  const ctx = await getContext();
  const cookie = readDemoCookie(request, ctx.secret);
  const demo = cookie ? await loadGuidedDemo(ctx, cookie) : null;
  return ok({ enabled: true, demo }, 200, { "cache-control": "no-store" });
});

const Body = z.object({ restart: z.boolean().default(false) });

/**
 * `POST /api/demo/guided` `{ restart? }`: starts this browser's guided demo,
 * or picks up its case. A new case signs the visitor in as the School. New
 * cases are capped per browser, per IP and per hour (src/server/demo/limits.ts);
 * past the caps the visitor keeps their case or watches the latest shared one.
 */
export const POST = route(async (request) => {
  const limits = requireDemoMode();
  const { restart } = await parseJson(request, Body);
  const ctx = await getContext();
  const existing = readDemoCookie(request, ctx.secret);
  let existingFinished = false;
  if (existing) {
    const current = await loadGuidedDemo(ctx, existing);
    existingFinished = current ? isFinished(detectStep(factsFrom(current, true))) : true;
  }
  const outcome = await startGuidedDemo(ctx, {
    request,
    existing,
    restart,
    limits,
    existingFinished,
  });
  const secure = ctx.env.NODE_ENV === "production";
  const headers = new Headers();
  headers.append(
    "set-cookie",
    demoCookieHeader(encodeDemoCookie(outcome.cookie, ctx.secret), secure),
  );
  if (outcome.created) {
    headers.append("set-cookie", (await signInAsPerson(ctx, "school")).cookie);
  }
  headers.set("cache-control", "no-store");
  return ok(
    {
      enabled: true,
      created: outcome.created,
      notice: outcome.notice,
      demo: await loadGuidedDemo(ctx, outcome.cookie),
    },
    outcome.created ? 201 : 200,
    headers,
  );
});
