"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { USING_FIXTURES } from "@/data/api";
import { useAudience, WORKSPACE, workspaceFor, type Audience } from "@/data/audience";
import { signOut, useSession } from "@/data/session";
import { LandingFooter, LandingHeader } from "@/features/landing/vellure/landing-chrome";
import { useMessages } from "@/i18n";
import { BRAND_NAME, BrandLogo } from "./brand/brand-logo";
import { Avatar } from "./ui/avatar";
import { ButtonLink } from "./ui/button";
import { cn } from "./ui/cn";
import { Icon, type IconName } from "./ui/icon";
import { Pattern } from "./ui/pattern";

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

/* ------------------------------------------------------------------------ */
/* Wordmark                                                                  */
/* ------------------------------------------------------------------------ */

export function Logo({ className }: { className?: string }) {
  const m = useMessages();
  return (
    <Link
      href="/"
      aria-label={`${BRAND_NAME} — ${m.nav.home}`}
      className={cn("inline-flex min-h-11 shrink-0 items-center", className)}
    >
      {/*
        The Bona Chain logo (docs/design/BRAND.md): the phone size, then the
        header size. Each sits in its own wrapper, because the logo sets its
        own display and would otherwise override `hidden`.
      */}
      <span className="sm:hidden">
        <BrandLogo size="sm" />
      </span>
      <span className="hidden sm:inline">
        <BrandLogo />
      </span>
    </Link>
  );
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

export function SiteHeader() {
  const m = useMessages();
  const pathname = usePathname();
  const school = useSchoolContext();
  const isHome = pathname === "/";
  const nav = navItemsFor(useAudience(), m);
  const links = nav.header;
  // The landing page has its own top bar, with the same destinations.
  if (isHome) return <LandingHeader links={links} showReport={!nav.staff} />;
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <Pattern variant="band" tone="brand" />
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          {school ? (
            // Phones have no room beside the wordmark; the page title names the school there.
            // Between lg and xl the menu needs the room too, so the header stays on one row.
            <Link
              href={`/schools/${school.id}`}
              data-testid="school-context"
              className="hidden min-h-11 max-w-56 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-sm font-semibold text-brand-strong sm:inline-flex lg:hidden xl:inline-flex"
            >
              <Icon name="mapPin" className="size-4 shrink-0" />
              <span className="truncate">{m.nav.atSchool(school.name)}</span>
            </Link>
          ) : null}
        </div>
        <nav aria-label={m.nav.main} className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(pathname, link.href) ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold whitespace-nowrap text-muted hover:text-ink aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-strong"
            >
              {link.label}
            </Link>
          ))}
          {nav.staff ? null : (
            <ButtonLink href="/report" size="sm" className="ml-2">
              <Icon name="plus" className="size-4" />
              {m.nav.report}
            </ButtonLink>
          )}
          <AccountArea />
        </nav>
        <div className="flex min-w-0 items-center gap-1 lg:hidden">
          <Link
            href="/verify"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 font-semibold text-brand-strong"
          >
            <Icon name="shieldCheck" className="size-5" />
            <span className="hidden sm:inline">{m.nav.verify}</span>
            <span className="sr-only sm:hidden">{m.nav.verify}</span>
          </Link>
          <AccountArea compact />
        </div>
      </div>
    </header>
  );
}

/**
 * Who is signed in. Signed out: a "Sign in" link. Signed in: avatar, public
 * display name and a role badge, linking to the account page; plus "Sign out"
 * on wide screens.
 */
function AccountArea({ compact = false }: { compact?: boolean }) {
  const m = useMessages();
  const { status, session } = useSession();
  if (status === "loading") return <span className="w-20" aria-hidden="true" />;

  if (!session) {
    return (
      <Link
        href="/sign-in"
        className="ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold whitespace-nowrap text-brand-strong hover:bg-brand-soft"
      >
        <Icon name="user" className="size-5" />
        {m.nav.signIn}
      </Link>
    );
  }
  const role = m.auth.role[session.user.role];
  return (
    <div data-testid="account-area" className="ml-1 flex min-w-0 items-center gap-1">
      <Link
        href="/sign-in"
        aria-label={`${m.nav.account}: ${session.user.displayName}, ${role}`}
        className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1.5 hover:bg-brand-soft"
      >
        <Avatar name={session.user.displayName} size="sm" />
        <span
          className={cn(
            "flex min-w-0 text-left leading-tight",
            // On a phone the account sits on its own row: name and role side by side.
            compact ? "items-center gap-2" : "flex-col",
          )}
        >
          <span
            className={cn(
              "truncate text-sm font-semibold",
              compact ? "max-w-40" : "whitespace-nowrap",
            )}
          >
            {session.user.displayName}
          </span>
          <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-earth-soft px-2 text-xs font-semibold whitespace-nowrap text-earth-strong">
            {role}
          </span>
        </span>
      </Link>
      {compact ? null : (
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold whitespace-nowrap text-muted hover:text-ink"
        >
          {m.auth.signOut}
        </button>
      )}
    </div>
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
  const pathname = usePathname();
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
  // The landing page has its own footer, with the same way in for staff.
  if (pathname === "/") return <LandingFooter staffLinks={staffLinks} />;
  return (
    <footer className="no-print bottom-bar-pad border-t border-line bg-surface lg:pb-0">
      <Pattern variant="divider" tone="earth" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 text-sm text-muted sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <p className="font-display text-lg text-ink">
            {m.brand.principleReport} {m.brand.principleClaim}
          </p>
          <p className="mt-2">
            {m.brand.forSchools}. {m.nav.footerNote}
          </p>
          <p className="mt-1">{m.nav.languageNote}</p>
        </div>
        {staffLinks.length > 0 ? (
          <nav aria-label={m.nav.forStaff}>
            <p className="font-semibold text-ink">{m.nav.forStaff}</p>
            <ul className="mt-1 flex flex-col">
              {staffLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
