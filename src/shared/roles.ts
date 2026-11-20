import { z } from "zod";

/**
 * Authenticated roles. An unauthenticated visitor has no role and can only
 * use public pages and BonaBlock Verify.
 */
export const USER_ROLES = [
  "reporter",
  "school_admin",
  "district_official",
  "independent_reviewer",
] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PERMISSIONS = [
  "report:create",
  "report:endorse",
  "report:read:own",
  "report:read:school",
  "report:read:all",
  "report:acknowledge",
  "case:update",
  "protection:record",
  "repair:claim",
  "repair:verify",
  "evidence:upload",
  "evidence:read",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * The single source of truth for who may do what. The backend enforces it;
 * the frontend may read it only to hide controls the user cannot use.
 *
 * Invariant: no role holds both `repair:claim` and `repair:verify`.
 * "A repair claim is not verification." BonaRegistry enforces the same rule
 * on-chain (`SchoolAdminCannotVerify`).
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  reporter: ["report:create", "report:endorse", "report:read:own", "evidence:upload"],
  school_admin: [
    "report:read:school",
    "report:acknowledge",
    "case:update",
    "protection:record",
    "repair:claim",
    "evidence:upload",
    "evidence:read",
  ],
  district_official: ["report:read:all", "evidence:read", "audit:read"],
  independent_reviewer: [
    "report:read:all",
    "repair:verify",
    "evidence:upload",
    "evidence:read",
    "audit:read",
  ],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** BonaRegistry's `Role` enum. The numbers are the values in the ABI. */
export const CHAIN_ROLE_CODE = { registrar: 1, school_admin: 2, reviewer: 3 } as const;
export type ChainRole = keyof typeof CHAIN_ROLE_CODE;

/**
 * Which on-chain key signs for each user role. A reporter never holds a key:
 * the platform's registrar key anchors on their behalf. A district official
 * has no on-chain role. The backend picks the key from the signed-in user's
 * role — never from anything in the request.
 */
export const CHAIN_ROLE_FOR_USER_ROLE: Record<UserRole, ChainRole | null> = {
  reporter: "registrar",
  school_admin: "school_admin",
  district_official: null,
  independent_reviewer: "reviewer",
};
