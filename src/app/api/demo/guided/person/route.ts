import { z } from "zod";
import { DEMO_PEOPLE } from "@/features/demo/steps";
import { getContext } from "@/server/context";
import { readDemoCookie, requireDemoMode, signInAsPerson } from "@/server/demo/guided";
import { HttpError, ok, parseJson, route } from "@/server/http";

const Body = z.object({ person: z.enum(DEMO_PEOPLE) });

/**
 * `POST /api/demo/guided/person` `{ person }`: "Demo: switch person". Signs
 * this browser in as the School, Funder, Contractor or Reviewer demo account
 * without a password, or signs out for "public". Only during a guided demo
 * (the `bona_demo` cookie) and only while demo mode is on.
 */
export const POST = route(async (request) => {
  requireDemoMode();
  const { person } = await parseJson(request, Body);
  const ctx = await getContext();
  if (!readDemoCookie(request, ctx.secret)) {
    throw new HttpError("forbidden", "Start the demo first.");
  }
  const { session, cookie } = await signInAsPerson(ctx, person);
  return ok({ person, session }, 200, {
    "set-cookie": cookie,
    "cache-control": "no-store",
  });
});
