// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BRAND_NAME, BrandLogo, BrandMark } from "./brand-logo";

afterEach(cleanup);

describe("BrandMark", () => {
  it("is decorative unless it is given a name", () => {
    const { container, rerender } = render(<BrandMark />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<BrandMark title={BRAND_NAME} />);
    expect(screen.getByRole("img", { name: "Bona Chain" })).toBeInTheDocument();
  });

  it("stays simple enough for a 24 px icon", () => {
    const { container } = render(<BrandMark />);
    expect(container.querySelectorAll("svg *").length).toBeLessThanOrEqual(12);
  });

  it("uses one colour when asked to", () => {
    const { container } = render(<BrandMark tone="mono" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).not.toContain("text-brand");
    expect(svg.innerHTML).not.toContain("fill-earth");
  });
});

describe("BrandLogo", () => {
  it("says the product name once and hides the mark from screen readers", () => {
    const { container } = render(<BrandLogo />);
    expect(container.textContent).toBe("Bona Chain");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("brand files", () => {
  const publicDir = join(__dirname, "../../../public");

  it("draws the same three shapes as the component", () => {
    const mark = readFileSync(join(publicDir, "brand/bona-chain-mark.svg"), "utf8");
    expect(mark.match(/<circle /g)).toHaveLength(3);
    expect(mark).toContain('r="11.5"');
  });

  it("names the app Bona Chain in the manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"),
    ) as { name: string; short_name: string; icons: { src: string }[] };
    expect(manifest.name).toBe("Bona Chain");
    expect(manifest.short_name).toBe("Bona Chain");
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      "/icon.svg",
      "/icon-maskable.svg",
    ]);
  });
});
