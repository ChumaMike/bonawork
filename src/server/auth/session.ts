/**
 * Cookie sessions for the synthetic demo accounts.
 *
 * The cookie `bona_session` carries `base64url(payload).base64url(hmac)`,
 * signed with HMAC-SHA256 under `AUTH_SECRET`. Nothing in it is trusted
 * without the signature, and the user is always re-read from the database so
 * a role change takes effect immediately.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { ROLE_PERMISSIONS, can, type Permission, type UserRole } from "@/shared";
import type { Db } from "../db";
import { schema } from "../db";
import { HttpError } from "../http";

export const SESSION_COOKIE = "bona_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEV_SECRET = "bona-development-secret-do-not-use-in-production-0000";
let warned = false;

/** The wire shape of `GET /api/auth/session`. */
export interface Session {
  user: { id: string; displayName: string; role: UserRole; institutionId: string | null };
  permissions: Permission[];
}

/** What the services need to know about the caller (never sent to the client). */
export interface SessionActor {
  id: string;
  role: UserRole;
  publicLabel: string;
  institutionId: string | null;
}

export interface AuthenticatedSession extends Session {
  actor: SessionActor;
}

export function toSession(session: AuthenticatedSession): Session {
  return { user: session.user, permissions: session.permissions };
}

export function sessionFor(user: {
  id: string;
  displayName: string;
  role: UserRole;
  institutionId: string | null;
  publicLabel: string;
}): AuthenticatedSession {
  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      institutionId: user.institutionId,
    },
    permissions: [...ROLE_PERMISSIONS[user.role]],
    actor: {
      id: user.id,
      role: user.role,
      publicLabel: user.publicLabel,
      institutionId: user.institutionId,
    },
  };
}

/** The signing secret: `AUTH_SECRET`, or a fixed development secret outside production. */
export function sessionSecret(env: { AUTH_SECRET?: string; NODE_ENV: string }): string {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  if (!warned && env.NODE_ENV !== "test") {
    warned = true;
    console.warn("[auth] AUTH_SECRET is not set; using the fixed development secret.");
  }
  return DEV_SECRET;
}

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export function createSessionToken(
  userId: string,
  secret: string,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: now + SESSION_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** The user id a token names, or null if it is forged, malformed or expired. */
export function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.sub !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < now) return null;
    return parsed.sub;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string | null, secure: boolean): string {
  const base = `${SESSION_COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  return token ? `${base}; Max-Age=${SESSION_TTL_MS / 1000}` : `${base}; Max-Age=0`;
}

export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

/** The signed-in user for this request, or null. */
export async function readSession(
  request: Request,
  db: Db,
  secret: string,
): Promise<AuthenticatedSession | null> {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const userId = verifySessionToken(token, secret);
  if (!userId) return null;
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return user ? sessionFor(user) : null;
}

export function requireSession(
  session: AuthenticatedSession | null,
): AuthenticatedSession {
  if (!session) throw new HttpError("unauthenticated", "Sign in to continue.");
  return session;
}

export function requirePermission<S extends Session>(
  session: S,
  permission: Permission,
): S {
  if (!can(session.user.role, permission)) {
    throw new HttpError(
      "forbidden",
      `Your role (${session.user.role}) cannot ${permission}.`,
    );
  }
  return session;
}

/**
 * A school administrator may only act on their own institution. Roles with
 * `report:read:all` (district officials, reviewers) pass for any institution.
 */
export function requireInstitution<S extends Session>(
  session: S,
  institutionId: string,
): S {
  if (can(session.user.role, "report:read:all")) return session;
  if (session.user.institutionId !== institutionId) {
    throw new HttpError("forbidden", "This report belongs to another institution.");
  }
  return session;
}
