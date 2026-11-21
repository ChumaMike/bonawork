"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { BRAND_NAME, BrandLogo } from "@/components/brand/brand-logo";
import { Icon } from "@/components/ui/icon";
import { signOut, useSession } from "@/data/session";
import { useMessages } from "@/i18n";
import "./vellure.css";

export type LandingLink = { href: string; label: string };

/**
 * The landing page's top bar: logo, the site's own menu, sign in and one blue
 * button. It lies over the hero and turns solid once the page is scrolled.
 * On a phone the menu folds into a sheet.
 *
 * It holds the same destinations as the header on every other page. The
 * links come from `SiteHeader`, which decides them for the person signed in.
 */
export function LandingHeader({
  links,
  showReport,
}: {
  links: readonly LandingLink[];
  /** The community reports; staff do not, so they get no report button. */
  showReport: boolean;
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

  const solid = scrolled && !open;
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
      data-testid="landing-header"
    >
      <div className="vl-wrap vl-header-row">
        <Link
          href="/"
          aria-label={`${BRAND_NAME} — ${m.nav.home}`}
          className="vl-header-logo"
        >
          <BrandLogo size="sm" tone={solid ? "colour" : "mono"} />
        </Link>

        <nav aria-label={m.nav.main} className="vl-links">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="vl-link">
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
 * The landing page's footer: the logo and one sentence, link columns that
 * point only at pages this site has (and its public code and contract), the
 * way in for staff, and the same honesty line as everywhere else.
 */
export function LandingFooter({ staffLinks }: { staffLinks: readonly LandingLink[] }) {
  const m = useMessages();
  const f = m.landingPage.footer;
  return (
    <footer className="vl vl-footer no-print bottom-bar-pad lg:pb-0">
      <div className="vl-wrap">
        <div className="vl-footer-grid">
          <div className="vl-footer-about">
            <BrandLogo />
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
