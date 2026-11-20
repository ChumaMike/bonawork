import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  createSessionToken,
  sessionCookie,
  sessionFor,
  toSession,
} from "@/server/auth/session";
import { getContext } from "@/server/context";
import { schema } from "@/server/db";
import { HttpError, ok, parseJson, route } from "@/server/http";
import { DEMO_ACCOUNTS } from "@/server/seed";

/**
 * One account per role for the demo. The sign-in screen offers these as
 * one-tap cards, so a presenter can switch people without typing. They are
 * the accounts in docs/hackathon/DEMO_GUIDE.md.
 */
const DEMO_LOGINS = [
  "zanele@community.demo",
  "admin@thandolwethu.demo",
  "district@vaalridge.demo",
  "reviewer@vaalridge.demo",
];

/** Both handlers only exist while `DEMO_RESET_ENABLED=true`; otherwise 404. */
function requireDemoMode(): void {
  if (process.env.DEMO_RESET_ENABLED !== "true") {
    throw new HttpError("not_found", "Not found.");
  }
}

const DemoLogin = z.object({ email: z.string().trim().toLowerCase().email() });

/** `GET /api/demo/accounts` — the accounts a visitor may sign in as during the demo. */
export const GET = route(async () => {
  requireDemoMode();
  const accounts = DEMO_LOGINS.flatMap((email) => {
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.email === email);
    return account
      ? [{ email: account.email, role: account.role, displayName: account.displayName }]
      : [];
  });
  return ok({ accounts });
});

/**
 * `POST /api/demo/accounts` `{ email }` — sign in as one of those accounts
 * without a password. Any other address is refused, so the shortcut cannot be
 * used to reach an account that is not on the demo list.
 */
export const POST = route(async (request) => {
  requireDemoMode();
  const { email } = await parseJson(request, DemoLogin);
  if (!DEMO_LOGINS.includes(email)) {
    throw new HttpError("unauthenticated", "That is not one of the demo accounts.");
  }
  const ctx = await getContext();
  const [user] = await ctx.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user)
    throw new HttpError("unauthenticated", "That demo account is not seeded yet.");
  const token = createSessionToken(user.id, ctx.secret);
  return ok(toSession(sessionFor(user)), 200, {
    "set-cookie": sessionCookie(token, ctx.env.NODE_ENV === "production"),
  });
});
