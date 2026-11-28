"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { USING_FIXTURES } from "@/data/api";
import { useAudience, workspaceFor, type Audience } from "@/data/audience";
import { useSession } from "@/data/session";
import { CAST } from "@/features/demo/cast";
import { useGuided } from "@/features/demo/client";
import { personForRole } from "@/features/demo/steps";
import { LandingFooter } from "@/features/landing/vellure/landing-chrome";
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

/** The main menu for each demo person, as the workbenches name it. */
function benchMenu(role: string | null): NavItem[] | null {
  switch (role) {
    case "school_admin":
      return [
        { href: "/school", label: "Our school", icon: "school" },
        { href: "/report", label: "Report a problem", icon: "plus" },
      ];
    case "buyer":
      return [
        { href: "/fund", label: "Repairs to fund", icon: "lock" },
        { href: "/fund#money", label: "My money", icon: "list" },
      ];
    case "supplier":
      return [{ href: "/jobs", label: "My jobs", icon: "wrench" }];
    case "independent_reviewer":
      return [
        { href: "/checks", label: "My checks", icon: "shieldCheck" },
        { href: "/issues", label: "Cases", icon: "list" },
      ];
    default:
      return null;
  }
}

const PUBLIC_MENU: NavItem[] = [
  { href: "/issues", label: "Cases", icon: "list" },
  { href: "/schools", label: "Schools", icon: "school" },
  { href: "/verify", label: "Check a proof", icon: "shieldCheck" },
];

/**
 * The one top bar of the site: the wordmark, the menu for the person signed
 * in, and who you are, "Name, role · switch", which opens the list of demo
 * people. Signed out, it offers sign in and the demo.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const { session, status } = useSession();
  const guided = useGuided();
  const role = session?.user.role ?? null;
  const menu = benchMenu(role) ?? PUBLIC_MENU;
  const person = personForRole(role);
  const demoOn = guided.status === "ready" && guided.demo !== null;

  let who: string | null = null;
  if (session) {
    const name =
      person && person !== "public" ? CAST[person].name : session.user.displayName;
    const label =
      person && person !== "public" ? CAST[person].short : (ROLE_LABEL[role!] ?? "staff");
    who = `${name}, ${label}`;
  } else if (demoOn) {
    who = "Viewing as the public";
  }

  return (
    <header className="no-print bg-ink text-on-brand" data-testid="site-header">
      <div className="mx-auto flex min-h-[60px] w-full max-w-[1240px] flex-wrap items-center gap-x-7 gap-y-1 px-4 py-2 sm:px-6">
        <Link
          href="/"
          className="font-brand text-[1.3rem] font-bold text-on-brand"
          aria-label="BonaWork, home"
        >
          BonaWork
        </Link>
        <nav
          aria-label="Main"
          className="order-3 flex w-full gap-5 overflow-x-auto text-[0.95rem] font-medium sm:order-none sm:w-auto sm:flex-1"
        >
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href.split("#")[0]) ? "page" : undefined}
              className="flex min-h-10 items-center whitespace-nowrap text-on-brand underline-offset-[6px] hover:underline aria-[current=page]:underline"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:ml-0">
          {status === "loading" ? null : who ? (
            <Link
              href="/sign-in"
              data-testid="role-switch"
              className="flex min-h-10 items-center rounded-full border border-muted px-3.5 text-sm font-medium text-on-brand hover:border-on-brand"
            >
              {who} · switch
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="text-[0.95rem] font-medium text-on-brand">
                Sign in
              </Link>
              <Link
                href="/demo"
                className="hidden min-h-[42px] items-center rounded-full bg-brand px-[18px] text-[0.95rem] font-semibold text-on-brand hover:bg-brand-strong sm:flex"
              >
                Try the demo
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const ROLE_LABEL: Record<string, string> = {
  reporter: "reporter",
  district_official: "district",
  receiving_officer: "receiving officer",
  payment_approver: "payment approver",
};

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

export function SiteFooter() {
  const audience = useAudience();
  // Signed out: the way in for staff. A community reporter does not need it.
  // Staff: only their own workspace.
  const staffLinks = [
    { href: "/school", label: "School: our school", role: "school_admin" },
    { href: "/fund", label: "Funder: repairs to fund", role: "buyer" },
    { href: "/jobs", label: "Contractor: my jobs", role: "supplier" },
    { href: "/checks", label: "Reviewer: my checks", role: "independent_reviewer" },
  ].filter((link) => (audience.role === null ? true : link.role === audience.role));
  // One footer on every page, with the same way in for staff.
  return <LandingFooter staffLinks={staffLinks} />;
}
