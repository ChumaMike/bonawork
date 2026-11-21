import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every colour token a component class points at must exist in the light
 * theme, and every dark override must override a real token. A typo such as
 * `text-on-brnad` would otherwise compile to nothing and the text would
 * silently inherit the page colour. This runs in `pnpm check`.
 */

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function tokensIn(block: string): Set<string> {
  return new Set(Array.from(block.matchAll(/--color-([a-z0-9-]+):/g), (m) => m[1]));
}

function valuesIn(block: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6});/g), (m) => [
      m[1],
      m[2],
    ]),
  );
}

function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`globals.css has no ${marker}`);
  return css.slice(start, css.indexOf("\n}\n", start));
}

const light = tokensIn(blockAfter("@theme {"));
const dark = tokensIn(blockAfter(':root:not([data-theme="light"])'));
const lightValues = valuesIn(blockAfter("@theme {"));
const darkValues = valuesIn(blockAfter(':root:not([data-theme="light"])'));

/** Our token families. Anything in these families that is not a token is a typo. */
const FAMILIES =
  /^(canvas|surface|sunken|ink|muted|faint|line|brand|earth|accent|sun|danger|on-|st-)/;

/** Utilities that take a colour. */
const UTILITY =
  /(?:^|[\s"'`{(:!])(?:bg|text|border|border-[trblxy]|ring|ring-offset|outline|fill|stroke|decoration|accent|caret|divide|shadow|from|via|to|placeholder)-([a-z][a-z0-9-]*?)(?:\/\d+)?(?=[\s"'`})\]]|$)/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx|ts|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("design tokens", () => {
  it("uses the landing page's blue, white and near-black", () => {
    expect(lightValues.brand).toBe("#0346ff");
    expect(lightValues["on-brand"]).toBe("#ffffff");
    expect(lightValues.surface).toBe("#ffffff");
    expect(lightValues.ink).toBe("#040409");
  });

  it("is light on every device: a dark-mode device gets the same values", () => {
    expect(Object.keys(lightValues).length).toBeGreaterThan(30);
    expect(darkValues).toEqual(lightValues);
  });

  it("defines the brand, earth, sun and danger families in both modes", () => {
    for (const token of [
      "on-brand",
      "earth",
      "earth-strong",
      "earth-soft",
      "sun",
      "sun-soft",
      "accent-strong",
      "danger-strong",
      "faint",
    ]) {
      expect(light.has(token), `light --color-${token}`).toBe(true);
      expect(dark.has(token), `dark --color-${token}`).toBe(true);
    }
  });

  it("only overrides tokens that exist in the light theme", () => {
    const orphans = [...dark].filter((token) => !light.has(token));
    expect(orphans).toEqual([]);
  });

  it("is referenced by component classes with names that exist", () => {
    const src = join(__dirname, "..");
    const missing = new Map<string, string[]>();
    for (const file of sourceFiles(src)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(UTILITY)) {
        const name = match[1];
        if (!FAMILIES.test(name) || light.has(name)) continue;
        const list = missing.get(name) ?? [];
        list.push(file.slice(src.length + 1));
        missing.set(name, list);
      }
    }
    expect(
      Object.fromEntries(missing),
      "classes pointing at colour tokens that globals.css does not define",
    ).toEqual({});
  });
});
