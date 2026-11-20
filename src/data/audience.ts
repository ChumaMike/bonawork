"use client";

import type { IconName } from "@/components/ui/icon";
import { can } from "@/shared";
import { useSession } from "./session";
import type { SessionRole } from "./types";

/**
 * Who the screens are talking to. Reporting a problem, "I'm affected too" and
 * adding evidence to a report are community actions: anyone who is signed out,
 * or signed in as a community reporter. Staff (school administrators, district
 * officials, independent reviewers, and the four procurement roles: buyer,
 * supplier, receiving officer, payment approver) get their own workspace instead, so the
 * public screens hide those actions from them. The backend refuses the same
 * actions for staff (`ROLE_PERMISSIONS`); this only keeps the screens honest.
 */
export type Audience =
  | { status: "loading"; role: null; community: true }
  | { status: "ready"; role: null; community: true }
  | { status: "ready"; role: SessionRole; community: boolean };

export function isCommunityRole(role: SessionRole | null): boolean {
  return role === null || can(role, "report:create");
}

/**
 * Whether this person may read the staff version of a case's procurement
 * trail. Everyone else, signed in or not, gets the public trail: steps,
 * roles, times and proof. The backend decides this again on every request.
 */
export function canReadProcurement(role: SessionRole | null): boolean {
  return role !== null && can(role, "procurement:read");
}

export function useAudience(): Audience {
  const { status, session } = useSession();
  if (status === "loading") return { status, role: null, community: true };
  const role = session?.user.role ?? null;
  if (role === null) return { status, role, community: true };
  return { status, role, community: isCommunityRole(role) };
}

/** Where each staff role works. A community reporter has no workspace. */
export const WORKSPACE: Record<
  Exclude<SessionRole, "reporter">,
  { href: string; icon: IconName }
> = {
  school_admin: { href: "/admin", icon: "school" },
  independent_reviewer: { href: "/reviewer", icon: "shieldCheck" },
  district_official: { href: "/issues", icon: "list" },
  buyer: { href: "/buyer", icon: "file" },
  supplier: { href: "/supplier", icon: "building" },
  receiving_officer: { href: "/receiving", icon: "check" },
  payment_approver: { href: "/payments", icon: "lock" },
};

export function workspaceFor(role: SessionRole | null) {
  return role && role !== "reporter" ? WORKSPACE[role] : null;
}
