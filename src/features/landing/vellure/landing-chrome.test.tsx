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

/** The menu every page shows to the community, in the same order. */
const MENU: [string, string][] = [
  ["Cases", "/issues"],
  ["Schools", "/schools"],
  ["Check a proof", "/verify"],
];

/** Every page this site has that the public may open. */
const PUBLIC_ROUTES = [
  "/",
  "/demo",
  "/agent",
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

describe("the site's top bar", () => {
  it("is the same dark bar on every page, with the public menu", () => {
    render(<SiteHeader />);
    const bar = screen.getByRole("banner");
    expect(bar).toHaveAttribute("data-testid", "site-header");
    const menu = within(bar).getByRole("navigation", { name: "Main" });
    expect(
      within(menu)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual(MENU);
    expect(within(bar).getByRole("link", { name: /BonaWork/ })).toHaveAttribute(
      "href",
      "/",
    );
    for (const href of hrefs(bar)) expect(PUBLIC_ROUTES).toContain(href);

    cleanup();
    path.current = "/issues";
    render(<SiteHeader />);
    const otherMenu = within(screen.getByRole("banner")).getByRole("navigation", {
      name: "Main",
    });
    // The page someone is on is marked, and only that one.
    expect(
      within(otherMenu)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent),
    ).toEqual(["Cases"]);
  });

  it("names the school a page is about, beside the logo", () => {
    render(
      <LandingHeader
        links={MENU.map(([label, href]) => ({ label, href }))}
        showReport
        school={{ id: "thuto-lesedi-primary", name: "Thuto-Lesedi Primary School" }}
      />,
    );
    const chip = screen.getByTestId("school-context");
    expect(chip).toHaveTextContent("At Thuto-Lesedi Primary School");
    expect(chip).toHaveAttribute("href", "/schools/thuto-lesedi-primary");
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

describe("the site's footer", () => {
  it("is the same footer on every page, and keeps the way in for staff", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("vl-footer");
    const staff = within(footer).getByRole("navigation", {
      name: "For schools and reviewers",
    });
    expect(hrefs(staff)).toEqual(
      expect.arrayContaining(["/school", "/fund", "/jobs", "/checks"]),
    );

    cleanup();
    path.current = "/issues";
    render(<SiteFooter />);
    const other = screen.getByRole("contentinfo");
    expect(other).toHaveClass("vl-footer");
    expect(
      hrefs(within(other).getByRole("navigation", { name: "For schools and reviewers" })),
    ).toEqual(expect.arrayContaining(["/school", "/fund", "/jobs", "/checks"]));
  });

  it("links only to pages that exist, the public code and the contract", () => {
    render(<LandingFooter staffLinks={[]} />);
    const footer = screen.getByRole("contentinfo");
    const all = hrefs(footer);
    const outside = all.filter((href) => href?.startsWith("http"));
    expect(outside).toEqual([
      "https://github.com/obxalethia-star/BonaChain",
      "https://explorer.solana.com/address/5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY?cluster=devnet",
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
    expect(text).toContain(
      "BonaWork for Schools. Sample schools and people while we run on the Solana devnet test network.",
    );
    expect(text).not.toMatch(/\bpaid\b|\bresolved\b|BonaBlock/i);
    // It does not say where it was built, and does not label its pictures.
    expect(text).not.toMatch(/hackathon|BACISS|AI-generated/i);
  });
});
