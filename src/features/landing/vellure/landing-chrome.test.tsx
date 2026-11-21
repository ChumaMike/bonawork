// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { LandingFooter, LandingHeader } from "./landing-chrome";

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

afterEach(() => {
  cleanup();
  path.current = "/";
});

/** The menu every other page shows to the community, in the same order. */
const MENU: [string, string][] = [
  ["Issues", "/issues"],
  ["Schools", "/schools"],
  ["Bona AI", "/assistant"],
  ["Track", "/track"],
  ["Check a file", "/verify"],
];

/** Every page this site has that the public may open. */
const PUBLIC_ROUTES = [
  "/",
  "/assistant",
  "/issues",
  "/report",
  "/schools",
  "/sign-in",
  "/track",
  "/verify",
];

const hrefs = (root: HTMLElement) =>
  within(root)
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));

describe("the landing page's top bar", () => {
  it("replaces the site header on the landing page only, with the same destinations", () => {
    render(<SiteHeader />);
    const bar = screen.getByRole("banner");
    expect(bar).toHaveAttribute("data-testid", "landing-header");
    const menu = within(bar).getByRole("navigation", { name: "Main" });
    expect(
      within(menu)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual(MENU);
    expect(within(bar).getByRole("link", { name: "Report" })).toHaveAttribute(
      "href",
      "/report",
    );
    expect(within(bar).getByRole("link", { name: /Bona Chain/ })).toHaveAttribute(
      "href",
      "/",
    );
    for (const href of hrefs(bar)) expect(PUBLIC_ROUTES).toContain(href);

    cleanup();
    path.current = "/issues";
    render(<SiteHeader />);
    const other = screen.getByRole("banner");
    expect(other).not.toHaveAttribute("data-testid", "landing-header");
    expect(
      within(within(other).getByRole("navigation", { name: "Main" }))
        .getAllByRole("link")
        .slice(0, MENU.length)
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual(MENU);
  });

  it("folds the menu into a sheet that opens, closes and leaves with Escape", () => {
    render(
      <LandingHeader links={MENU.map(([label, href]) => ({ label, href }))} showReport />,
    );
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const sheet = screen.getByRole("navigation", { name: "Menu" });
    expect(button).toHaveAttribute("aria-controls", sheet.id);
    expect(hrefs(sheet)).toEqual([
      ...MENU.map(([, href]) => href),
      "/sign-in",
      "/report",
    ]);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();
  });

  it("offers staff no report button", () => {
    render(
      <LandingHeader links={[{ label: "Issues", href: "/issues" }]} showReport={false} />,
    );
    expect(screen.queryByRole("link", { name: "Report" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(hrefs(screen.getByRole("navigation", { name: "Menu" }))).toEqual([
      "/issues",
      "/sign-in",
    ]);
  });
});

describe("the landing page's footer", () => {
  it("replaces the site footer on the landing page only, and keeps the way in for staff", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("vl-footer");
    const staff = within(footer).getByRole("navigation", {
      name: "For schools and reviewers",
    });
    expect(hrefs(staff)).toEqual(
      expect.arrayContaining(["/admin", "/reviewer", "/supplier", "/payments"]),
    );

    cleanup();
    path.current = "/issues";
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).not.toHaveClass("vl-footer");
  });

  it("links only to pages that exist, the public code and the contract", () => {
    render(<LandingFooter staffLinks={[]} />);
    const footer = screen.getByRole("contentinfo");
    const all = hrefs(footer);
    const outside = all.filter((href) => href?.startsWith("http"));
    expect(outside).toEqual([
      "https://github.com/obxalethia-star/BonaChain",
      "https://testnet.snowtrace.io/address/0x9AA7Cf8a0cd0c015F01DF8fdb400510D1407d6E3#code",
    ]);
    for (const href of all.filter((href) => !href?.startsWith("http"))) {
      expect(PUBLIC_ROUTES).toContain(href);
    }
    for (const link of within(footer).getAllByRole("link", {
      name: /opens in a new tab/,
    })) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(
      within(footer).queryByRole("navigation", { name: "For schools and reviewers" }),
    ).toBeNull();
  });

  it("keeps the honesty lines", () => {
    render(<LandingFooter staffLinks={[]} />);
    const text = screen.getByRole("contentinfo").textContent ?? "";
    expect(text).toContain(
      "A report is not protection. A repair claim is not verification.",
    );
    expect(text).toContain("Test network only. No real money moves.");
    expect(text).toContain("Built for the UJ BACISS hackathon.");
    expect(text).toContain("AI-generated illustration");
    expect(text).not.toMatch(/\bpaid\b|\bresolved\b|BonaBlock/i);
  });
});
