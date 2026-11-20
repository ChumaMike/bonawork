import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifyPassword } from "@/server/auth/password";
import {
  createSessionToken,
  sessionCookie,
  sessionFor,
  toSession,
} from "@/server/auth/session";
import { getContext } from "@/server/context";
import { schema } from "@/server/db";
import { HttpError, ok, parseJson, route } from "@/server/http";
import { begin } from "@/server/request";

const Credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** The signed-in session, or `null`. */
export const GET = route(async (request) => {
  const { session } = await begin(request);
  return ok(session ? toSession(session) : null);
});

/** Sign in with a demo account. */
export const POST = route(async (request) => {
  const { email, password } = await parseJson(request, Credentials);
  const ctx = await getContext();
  const [user] = await ctx.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError("unauthenticated", "Unknown email address or wrong password.");
  }
  const token = createSessionToken(user.id, ctx.secret);
  return ok(toSession(sessionFor(user)), 200, {
    "set-cookie": sessionCookie(token, ctx.env.NODE_ENV === "production"),
  });
});

/** Sign out. */
export const DELETE = route(async () => {
  const ctx = await getContext();
  return ok(null, 200, {
    "set-cookie": sessionCookie(null, ctx.env.NODE_ENV === "production"),
  });
});
