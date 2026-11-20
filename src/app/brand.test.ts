/**
 * The product is Bona Chain. No message a person can read, and no name in the
 * web manifest, may still say "BonaBlock". (`BonaRegistry`, package names, the
 * `bona_session` cookie and the `BB-` reference prefix keep their names; none
 * of them is a message.)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n";
import { PRODUCT, VERIFIER } from "@/i18n/en";

const OLD_NAME = /bona\s?block/i;

/** Every message with its path. A message that takes arguments is checked by its source. */
function messages(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") return [[path, String(value)]];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => messages(item, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      messages(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../public/manifest.webmanifest", import.meta.url)),
    "utf8",
  ),
) as Record<string, unknown>;

describe("the product name", () => {
  it("is Bona Chain, and the verifier is Bona Chain Verify", () => {
    expect(PRODUCT).toBe("Bona Chain");
    expect(VERIFIER).toBe("Bona Chain Verify");
  });

  it.each(Object.entries(LOCALES))("no %s message says BonaBlock", (_locale, locale) => {
    const all = messages(locale, "");
    expect(all.length).toBeGreaterThan(500);
    const stale = all.filter(([, text]) => OLD_NAME.test(text)).map(([path]) => path);
    expect(stale).toEqual([]);
  });

  it("the messages name the product through the constants", () => {
    const { en } = LOCALES;
    expect(en.brand.name).toBe(PRODUCT);
    expect(en.ledger.openInVerify).toBe(`Open in ${VERIFIER}`);
    expect(en.actor.system).toBe("Bona Chain rules");
    expect(en.event.goods_receipt_recorded).toBe("Delivery recorded");
    expect(en.event.match_recorded).toBe("Invoice checked against order and delivery");
  });

  it("the web manifest does not say BonaBlock", () => {
    expect(manifest.name).toBe("Bona Chain");
    expect(manifest.short_name).toBe(PRODUCT);
    const stale = messages(manifest, "").filter(([, text]) => OLD_NAME.test(text));
    expect(stale).toEqual([]);
  });
});
