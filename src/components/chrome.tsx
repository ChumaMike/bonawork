"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { USING_FIXTURES } from "@/data/api";
import { useAudience, WORKSPACE, workspaceFor, type Audience } from "@/data/audience";
import { LandingFooter, LandingHeader } from "@/features/landing/vellure/landing-chrome";
import { useMessages } from "@/i18n";
import { cn } from "./ui/cn";
import { Icon, type IconName } from "./ui/icon";
/* What the top bar needs on the pages under the landing page. After the landing styles. */
import "./ui/page-shell.css";

/* ------------------------------------------------------------------------ */
/* School context: a school page tells the header which school it is in.    */
/* ------------------------------------------------------------------------ */

type SchoolContextValue = { id: string; name: string } | null;

let currentSchool: SchoolContextValue = null;
const schoolListeners = new Set<() => void>();

function subscribeSchool(listener: () => void) {
  schoolListeners.add(listener);
  return () => {
    schoolListeners.delete(listener);
  };
}

export function setSchoolContext(value: SchoolContextValue) {
  currentSchool = value;
  for (const listener of schoolListeners) listener();
}

export function useSchoolContext(): SchoolContextValue {
  return useSyncExternalStore(
    subscribeSchool,
    () => currentSchool,
    () => null,
  );
}

/**
 * Render inside a school page (or an issue page that belongs to a school) and
 * the header shows "At <school>" while that page is open.
 */
export function SchoolContext({ id, name }: { id: string; name: string }) {
  useEffect(() => {
    setSchoolContext({ id, name });
    return () => setSchoolContext(null);
  }, [id, name]);
  return null;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/* ------------------------------------------------------------------------ */
/* Header                                                                    */
/* ------------------------------------------------------------------------ */

type NavItem = { href: string; label: string; icon: IconName; primary?: boolean };

/**
 * What each person's menu holds. The community (signed out, or a community
 * reporter) gets reporting and their own reports. Staff get their workspace
 * and the public record, but not the community's actions.
 */
function navItemsFor(audience: Audience, m: ReturnType<typeof useMessages>) {
  const role = audience.community ? null : audience.role;
  const workspace = workspaceFor(role);
  if (!role || role === "reporter" || !workspace) {
    return {
      staff: false,
      header: [
        { href: "/issues", label: m.nav.issues, icon: "list" },
        { href: "/schools", label: m.nav.schools, icon: "school" },
        { href: "/assistant", label: m.nav.assistant, icon: "chat" },
        { href: "/track", label: m.nav.track, icon: "list" },
        { href: "/verify", label: m.nav.verify, icon: "shieldCheck" },
      ] satisfies NavItem[],
      bottom: [
        { href: "/", label: m.nav.home, icon: "home" },
        { href: "/report", label: m.nav.report, icon: "plus", primary: true },
        { href: "/track", label: m.nav.myReports, icon: "list" },
      ] satisfies NavItem[],
    };
  }
  const own: NavItem = {
    href: workspace.href,
    label: m.nav.workspace[role],
    icon: workspace.icon,
    primary: true,
  };
  return {
    staff: true,
    header: [
      ...(own.href === "/issues" ? [] : [own]),
      { href: "/issues", label: m.nav.issues, icon: "list" },
      { href: "/schools", label: m.nav.schools, icon: "school" },
      { href: "/verify", label: m.nav.verify, icon: "shieldCheck" },
    ] satisfies NavItem[],
    bottom: [
      { href: "/", label: m.nav.home, icon: "home" },
      own,
      { href: "/verify", label: m.nav.verify, icon: "file" },
    ] satisfies NavItem[],
  };
}

/** Pages that draw no navy band under the bar, so the bar is solid on them. */
const PLAIN_PAGES = new Set(["/sign-in"]);

/**
 * The one top bar of the site, the landing page's: the logo, the menu for the
 * person signed in, the account and one blue button. It lies over the navy
 * band at the top of each page and turns solid once the page is scrolled.
 */
export function SiteHeader() {
  const m = useMessages();
  const pathname = usePathname();
  const school = useSchoolContext();
  const nav = navItemsFor(useAudience(), m);
  return (
    <LandingHeader
      links={nav.header}
      showReport={!nav.staff}
      current={pathname}
      school={school}
      plain={PLAIN_PAGES.has(pathname)}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Phone bottom bar                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Phone navigation: three large targets within reach of the thumb, labels
 * always visible. Bona AI is reached through the floating Bona buddy.
 */
export function BottomNav() {
  const m = useMessages();
  const pathname = usePathname();
  const items: NavItem[] = navItemsFor(useAudience(), m).bottom;
  return (
    <nav
      aria-label={m.nav.main}
      data-testid="bottom-nav"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-sheet lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 px-1 text-sm leading-none font-semibold",
                  active ? "text-brand-strong" : "text-muted",
                )}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 top-0 h-1 rounded-b-full bg-brand"
                  />
                ) : null}
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full",
                    item.primary
                      ? "bg-brand text-on-brand"
                      : active
                        ? "bg-brand-soft"
                        : undefined,
                  )}
                >
                  <Icon name={item.icon} className="size-6" />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------------ */
/* Banner and footer                                                         */
/* ------------------------------------------------------------------------ */

/** Shown on every page while the app runs on development sample data. */
export function PreviewBanner() {
  const m = useMessages();
  if (!USING_FIXTURES) return null;
  // A landmark of its own, so no content sits outside the page's regions.
  return (
    <aside
      aria-label={m.preview.label}
      data-testid="preview-banner"
      className="no-print flex items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-sm font-medium text-canvas"
    >
      <Icon name="info" className="size-4" />
      <p>{m.preview.banner}</p>
    </aside>
  );
}

/** The procurement workspaces, in the order their roles act on a case. */
const PROCUREMENT_ROLES = [
  "buyer",
  "supplier",
  "receiving_officer",
  "payment_approver",
] as const;

export function SiteFooter() {
  const m = useMessages();
  const audience = useAudience();
  // Signed out: the way in for staff. A community reporter does not need it.
  // Staff: only their own workspace.
  const staffLinks = [
    { href: "/admin", label: m.nav.admin, role: "school_admin" },
    { href: "/reviewer", label: m.nav.reviewer, role: "independent_reviewer" },
    ...PROCUREMENT_ROLES.map((role) => ({
      href: WORKSPACE[role].href,
      label: `${m.auth.role[role]}: ${m.nav.workspace[role]}`,
      role,
    })),
  ].filter((link) => (audience.role === null ? true : link.role === audience.role));
  // One footer on every page, with the same way in for staff.
  return <LandingFooter staffLinks={staffLinks} />;
}
