"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { BRAND_NAME, BrandLogo } from "@/components/brand/brand-logo";
import { Icon } from "@/components/ui/icon";
import { signOut, useSession } from "@/data/session";
import { useMessages } from "@/i18n";
import "./vellure.css";

export type LandingLink = { href: string; label: string };

/** True when `href` is the page someone is on, or the section it belongs to. */
function isCurrent(pathname: string | undefined, href: string): boolean {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The site's top bar, first drawn for the landing page and now on every page:
 * logo, the site's own menu, sign in and one blue button. It lies over the
 * navy band at the top of a page and turns solid once the page is scrolled.
 * On a phone the menu folds into a sheet.
 *
 * The links come from `SiteHeader`, which decides them for the person signed in.
 */
export function LandingHeader({
  links,
  showReport,
  current,
  school = null,
  plain = false,
}: {
  links: readonly LandingLink[];
  /** The community reports; staff do not, so they get no report button. */
  showReport: boolean;
  /** The path of the page that is open, to mark its menu item. */
  current?: string;
  /** The school a page is about: shown as "At <school>" beside the logo. */
  school?: { id: string; name: string } | null;
  /** The page has no navy band: the bar is solid and takes its own room. */
  plain?: boolean;
}) {
  const m = useMessages();
  const l = m.landingPage.nav;
  const { status, session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const sheetId = useId();

  useEffect(() => {
    const read = () => setScrolled(window.scrollY > 24);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  const solid = (scrolled || plain) && !open;
  const role = session ? m.auth.role[session.user.role] : null;

  const account =
    status === "loading" ? null : session ? (
      <div data-testid="account-area" className="vl-account-area">
        <Link
          href="/sign-in"
          aria-label={`${m.nav.account}: ${session.user.displayName}, ${role}`}
          className="vl-account vl-link"
        >
          <span className="truncate">{session.user.displayName}</span>
          <small>{role}</small>
        </Link>
        <button type="button" onClick={() => void signOut()} className="vl-link vl-wide">
          {m.auth.signOut}
        </button>
      </div>
    ) : (
      <Link href="/sign-in" className="vl-link vl-wide">
        {m.nav.signIn}
      </Link>
    );

  return (
    <header
      className={`vl vl-header no-print${solid ? "" : " vl-on-dark"}`}
      data-solid={solid ? "" : undefined}
      data-open={open ? "" : undefined}
      data-flow={plain ? "" : undefined}
      data-testid="landing-header"
    >
      <div className="vl-wrap vl-header-row">
        <div className="vl-header-start">
          <Link
            href="/"
            aria-label={`${BRAND_NAME} — ${m.nav.home}`}
            className="vl-header-logo"
          >
            <BrandLogo size="sm" tone={solid ? "colour" : "mono"} />
          </Link>
          {school ? (
            <Link
              href={`/schools/${school.id}`}
              data-testid="school-context"
              className="vl-school"
            >
              <Icon name="mapPin" className="size-4 shrink-0" />
              <span className="truncate">{m.nav.atSchool(school.name)}</span>
            </Link>
          ) : null}
        </div>

        <nav aria-label={m.nav.main} className="vl-links">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(current, link.href) ? "page" : undefined}
              className="vl-link"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="vl-header-side">
          {account}
          {showReport ? (
            <Link href="/report" className="vl-btn vl-btn-blue vl-btn-sm vl-wide">
              {m.nav.report}
            </Link>
          ) : null}
        </div>

        <button
          type="button"
          className="vl-menu-button"
          aria-expanded={open}
          aria-controls={sheetId}
          onClick={() => setOpen((now) => !now)}
        >
          <Icon name={open ? "x" : "menu"} className="size-5" />
          {open ? l.close : l.menu}
        </button>
      </div>

      {open ? (
        <nav id={sheetId} aria-label={l.menu} className="vl-sheet vl-on-dark">
          <div className="vl-wrap">
            <ul>
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={() => setOpen(false)}>
                    {link.label}
                    <Icon name="arrowRight" className="size-5" />
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/sign-in" onClick={() => setOpen(false)}>
                  {session ? session.user.displayName : m.nav.signIn}
                  <Icon name="user" className="size-5" />
                </Link>
              </li>
            </ul>
            {showReport ? (
              <Link
                href="/report"
                onClick={() => setOpen(false)}
                className="vl-btn vl-btn-blue"
              >
                {l.report}
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

/**
 * The site's footer, on every page: the logo and one sentence, link columns
 * that point only at pages this site has (and its public code and contract),
 * the way in for staff, and the honesty lines.
 */
export function LandingFooter({ staffLinks }: { staffLinks: readonly LandingLink[] }) {
  const m = useMessages();
  const f = m.landingPage.footer;
  return (
    <footer className="vl vl-footer no-print bottom-bar-pad lg:pb-0">
      <div className="vl-wrap">
        <div className="vl-footer-grid">
          <div className="vl-footer-about">
            {/*
              The smaller logo where the full one would not fit: a phone at 200% zoom.
              Each sits in its own wrapper, because the logo sets its own display.
            */}
            <span className="vl-footer-logo-small">
              <BrandLogo size="sm" />
            </span>
            <span className="vl-footer-logo-full">
              <BrandLogo />
            </span>
            <p>{f.description}</p>
          </div>
          <div className="vl-footer-cols">
            {f.columns.map((column) => (
              <div key={column.title}>
                <h2>{column.title}</h2>
                <ul>
                  {column.links.map((link) => {
                    const external = link.href.startsWith("http");
                    return (
                      <li key={link.href}>
                        {external ? (
                          <a href={link.href} target="_blank" rel="noopener noreferrer">
                            {link.label}
                            <Icon name="arrowRight" className="size-4 -rotate-45" />
                            <span className="sr-only">({f.newTab})</span>
                          </a>
                        ) : (
                          <Link href={link.href}>{link.label}</Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {staffLinks.length > 0 ? (
              <nav aria-label={m.nav.forStaff}>
                <h2>{m.nav.forStaff}</h2>
                <ul>
                  {staffLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        </div>
        <div className="vl-footer-base">
          <p>
            {m.brand.principleReport} {m.brand.principleClaim} {f.testnet}
          </p>
          <p>
            {m.nav.footerNote} {m.nav.languageNote}
          </p>
        </div>
      </div>
    </footer>
  );
}
