import { useId } from "react";
import { cn } from "./cn";

/**
 * BonaBlock's geometric pattern: stepped pyramids and chevrons drawn only with
 * straight lines, in the spirit of Ndebele wall painting and Basotho blanket
 * borders. Nothing is traced from a real design. Colour comes from
 * `currentColor`, so a tone class decides the ink and the page gives the paper.
 *
 * Use it sparingly: a thin band under the header, a divider between sections,
 * a hero corner, or the backdrop of an empty state. Never behind body text.
 * The same tile is exported as public/pattern/bona-pattern.svg.
 */

export type PatternVariant = "band" | "divider" | "corner" | "backdrop";
export type PatternTone = "brand" | "earth" | "ink" | "sun" | "muted" | "current";

const tones: Record<PatternTone, string> = {
  brand: "text-brand",
  earth: "text-earth",
  ink: "text-ink",
  sun: "text-sun",
  muted: "text-line-strong",
  current: "",
};

/** The full 64 × 64 tile: a stepped pyramid over two chevron lines. */
export function PatternTile() {
  return (
    <>
      <path
        d="M8 28h48v-8h-8v-8h-8V4H24v8h-8v8H8z"
        fill="currentColor"
        fillOpacity="0.9"
      />
      <path d="M28 12h8v8h-8z" fill="currentColor" fillOpacity="0.35" />
      <polyline
        points="0,46 16,34 32,46 48,34 64,46"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="miter"
      />
      <polyline
        points="0,58 16,46 32,58 48,46 64,58"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.5"
        strokeLinejoin="miter"
      />
    </>
  );
}

/** A 32 × 16 chevron strip for thin bands and dividers. */
export function ChevronTile() {
  return (
    <>
      <polyline
        points="0,13 8,3 16,13 24,3 32,13"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="miter"
      />
      <rect x="6" y="11" width="4" height="4" fill="currentColor" fillOpacity="0.6" />
      <rect x="22" y="11" width="4" height="4" fill="currentColor" fillOpacity="0.6" />
    </>
  );
}

const variantClass: Record<PatternVariant, string> = {
  band: "block h-2 w-full",
  divider: "block h-4 w-full",
  corner: "pointer-events-none absolute top-0 right-0 size-40 sm:size-56",
  backdrop: "pointer-events-none absolute inset-0 size-full",
};

export function Pattern({
  variant = "divider",
  tone = "brand",
  className,
}: {
  variant?: PatternVariant;
  tone?: PatternTone;
  className?: string;
}) {
  const id = useId();
  const thin = variant === "band" || variant === "divider";
  const tileWidth = thin ? 32 : 64;
  const tileHeight = thin ? 16 : 64;
  // Tile size on screen. Bands are tiny; backdrops are calm.
  const scale = variant === "band" ? 0.5 : variant === "divider" ? 1 : 0.9;
  const fade =
    variant === "corner"
      ? {
          maskImage: "linear-gradient(225deg, #000 10%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(225deg, #000 10%, transparent 70%)",
        }
      : undefined;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={cn(
        variantClass[variant],
        tones[tone],
        variant === "backdrop" && "opacity-[0.07]",
        variant === "corner" && "opacity-20",
        variant === "divider" && "opacity-60",
        className,
      )}
      style={fade}
    >
      <defs>
        <pattern
          id={id}
          width={tileWidth * scale}
          height={tileHeight * scale}
          patternUnits="userSpaceOnUse"
          viewBox={`0 0 ${tileWidth} ${tileHeight}`}
        >
          {thin ? <ChevronTile /> : <PatternTile />}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
