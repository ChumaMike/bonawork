import { cn } from "@/components/ui/cn";

/*
 * The Bona Chain logo. Documented in docs/design/BRAND.md; the files in
 * public/brand/ are built from the same shapes by docs/design/brand/build-logo.mjs.
 *
 * The colours are tokens, so the logo follows light and dark mode by itself.
 * On a surface that is always dark (a photograph, a slide), use
 * /brand/bona-chain-logo-dark.svg instead.
 */

/** The product name is a brand asset, not a translated string. */
export const BRAND_NAME = "Bona Chain";

type Tone = "colour" | "mono";

/**
 * The mark: two chain links, and an eye where they join. "Bona" means "see",
 * so the chain is what watches each step. Three shapes on a 40 x 40 grid.
 *
 * - `colour`: links and eye in the brand blue.
 * - `mono`: everything in the current text colour.
 *
 * Decorative by default. Pass `title` when the mark stands alone and must be
 * named for a screen reader.
 */
export function BrandMark({
  tone = "colour",
  title,
  className,
}: {
  tone?: Tone;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", tone === "colour" && "text-brand", className)}
    >
      <circle cx="20" cy="15" r="11.5" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="20" cy="25" r="11.5" stroke="currentColor" strokeWidth="3.5" />
      <circle
        cx="20"
        cy="20"
        r="3.1"
        className={tone === "colour" ? "fill-earth" : "fill-current"}
      />
    </svg>
  );
}

const SIZES = {
  /** Phone header. */
  sm: { mark: "size-8", text: "text-xl" },
  /** Desktop header, sign-in page. */
  md: { mark: "size-9", text: "text-2xl" },
  /** Landing page and other heroes. */
  lg: { mark: "size-14", text: "text-4xl" },
} as const;

/**
 * The mark with the name beside it. The name is live text in the display
 * face, so it is read once by a screen reader and the mark stays decorative.
 * It is not a link: wrap it in one where it should lead home.
 */
export function BrandLogo({
  size = "md",
  tone = "colour",
  className,
}: {
  size?: keyof typeof SIZES;
  tone?: Tone;
  className?: string;
}) {
  const [first, second] = BRAND_NAME.split(" ");
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2", className)}>
      <BrandMark tone={tone} className={SIZES[size].mark} />
      <span
        className={cn(
          "font-brand leading-none font-bold tracking-tight whitespace-nowrap",
          SIZES[size].text,
          tone === "colour" && "text-ink",
        )}
      >
        {first}{" "}
        <span className={tone === "colour" ? "text-earth" : undefined}>{second}</span>
      </span>
    </span>
  );
}
