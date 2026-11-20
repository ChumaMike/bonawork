import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16384;

const scrypt = (password: string, salt: string, length: number, cost: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, length, { N: cost }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );

/** `scrypt$N$salt$hash` — every part needed to verify later is in the string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt, KEY_LENGTH, COST);
  return `scrypt$${COST}$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, salt, expected.length, Number(cost));
  return key.length === expected.length && timingSafeEqual(key, expected);
}
