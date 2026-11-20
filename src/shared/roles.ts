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
  /** Approves the work order for a reported problem. */
  "buyer",
  /** Acknowledges the order and submits the invoice for it. */
  "supplier",
  /** Records what was actually delivered. */
  "receiving_officer",
  /** Authorises the release instruction. Never moves money. */
  "payment_approver",
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
  "order:approve",
  "order:acknowledge",
  "invoice:submit",
  "receipt:record",
  "release:authorise",
  /** A supplier reads its own orders only; the backend applies that scope. */
  "procurement:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * The single source of truth for who may do what. The backend enforces it;
 * the frontend may read it only to hide controls the user cannot use.
 *
 * Invariant: no role holds both `repair:claim` and `repair:verify`.
 * "A repair claim is not verification." BonaRegistry enforces the same rule
 * on-chain (`SchoolAdminCannotVerify`).
 *
 * Invariant: no role holds two of `order:approve`, `invoice:submit`,
 * `receipt:record` and `release:authorise`, and the role that authorises a
 * release holds neither `repair:claim` nor `repair:verify`. InstitutionFinance
 * enforces the same separation on-chain (`SeparationOfDuties`).
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
    "procurement:read",
  ],
  district_official: [
    "report:read:all",
    "evidence:read",
    "audit:read",
    "procurement:read",
  ],
  independent_reviewer: [
    "report:read:all",
    "repair:verify",
    "evidence:upload",
    "evidence:read",
    "audit:read",
    "procurement:read",
  ],
  buyer: ["order:approve", "procurement:read"],
  supplier: ["order:acknowledge", "invoice:submit", "procurement:read"],
  receiving_officer: ["receipt:record", "procurement:read"],
  payment_approver: ["release:authorise", "procurement:read"],
};

/** The four finance steps that must each sit with a different role. */
export const SEPARATED_FINANCE_PERMISSIONS = [
  "order:approve",
  "invoice:submit",
  "receipt:record",
  "release:authorise",
] as const satisfies readonly Permission[];

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * The on-chain `Role` enum. The numbers are the values in the ABI. BonaRegistry
 * knows 1 to 3; BonaChainFactory keeps those and adds 4 to 7.
 */
export const CHAIN_ROLE_CODE = {
  registrar: 1,
  school_admin: 2,
  reviewer: 3,
  buyer: 4,
  supplier: 5,
  receiver: 6,
  payment_approver: 7,
} as const;
export type ChainRole = keyof typeof CHAIN_ROLE_CODE;

/** The chain roles that sign finance writes (InstitutionFinance). */
export const FINANCE_CHAIN_ROLES = [
  "buyer",
  "supplier",
  "receiver",
  "payment_approver",
] as const satisfies readonly ChainRole[];
export type FinanceChainRole = (typeof FINANCE_CHAIN_ROLES)[number];
/** The chain roles BonaRegistry and InstitutionOperations know. */
export type OperationsChainRole = Exclude<ChainRole, FinanceChainRole>;

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
  buyer: "buyer",
  supplier: "supplier",
  receiving_officer: "receiver",
  payment_approver: "payment_approver",
};
