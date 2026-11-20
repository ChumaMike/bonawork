import { getPhoto, type PhotoName } from "@/components/media/manifest";
import { Photo } from "@/components/media/photo";
import { cn } from "@/components/ui/cn";
import type { IssueCategory } from "@/data/types";

/**
 * Picture slots for the community pages, keyed by the Design Foundation photo
 * manifest. <Photo> draws the photograph when its file exists and a patterned
 * placeholder until then, so every page is complete before the photography is.
 *
 * `ratio` crops a landscape photograph to a shorter band for headers and cards;
 * `wide` shows it as it is.
 */
export type PictureName = PhotoName;

/** The picture that goes with each type of problem. */
export const CATEGORY_PICTURE: Record<IssueCategory, PictureName> = {
  water: "category_water",
  sanitation: "category_sanitation",
  electricity: "category_electricity",
  buildings: "category_buildings",
  safety: "category_safety",
  learning_resources: "category_learning_resources",
  other: "category_other",
};

const CROP = {
  banner: "aspect-[21/9]",
  strip: "aspect-[3/1]",
  half: "aspect-[2/1]",
  square: "aspect-square",
} as const;

export function Picture({
  name,
  className,
  ratio = "wide",
  /** True when the words next to it already say what it shows. */
  decorative = false,
  /** Above the fold on first paint. */
  priority = false,
  sizes,
  blend = false,
}: {
  name: PictureName;
  className?: string;
  ratio?: "wide" | keyof typeof CROP;
  decorative?: boolean;
  priority?: boolean;
  sizes?: string;
  /** Fade the picture into the page instead of ending on a hard edge. */
  blend?: boolean;
}) {
  const alt = decorative ? "" : undefined;
  const natural = ratio === "wide" || (ratio === "square" && getPhoto(name).ratio === 1);
  if (natural) {
    return (
      <Photo
        name={name}
        alt={alt}
        priority={priority}
        sizes={sizes}
        blend={blend}
        className={className}
      />
    );
  }
  return (
    <div className={cn("relative overflow-hidden", CROP[ratio], className)}>
      <Photo
        name={name}
        alt={alt}
        priority={priority}
        sizes={sizes}
        blend={blend}
        shape="free"
        className="absolute! inset-0 h-full w-full"
      />
    </div>
  );
}

/** Simple stroked pictograms for the problem types, on a 48 × 48 grid. */
const GLYPHS: Record<IssueCategory, string> = {
  water:
    "M14 16h12v6h6a6 6 0 0 1 6 6v2h-6v-2h-6v14a3 3 0 0 1-6 0V22h-6zM20 8h6v8h-6zM30 36l2 4-2 2-2-2z",
  sanitation:
    "M10 42V14a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v28M10 42h16M16 28h2M30 26h10a2 2 0 0 1 2 2v2a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-2a2 2 0 0 1 2-2zM35 20v6",
  electricity:
    "M24 6a10 10 0 0 0-6 18v4h12v-4a10 10 0 0 0-6-18zM19 32h10M20 36h8M24 40v2M10 14l3 2M38 14l-3 2",
  buildings: "M6 24L24 8l18 16M12 20v22h24V20M20 42V30h8v12M26 20l-4 6 4 4-3 5",
  safety:
    "M8 42V18l4-6 4 6v24M20 42V18l4-6 4 6v24M32 42V18l4-6 4 6v24M4 24h40M4 34h20M30 34h14M27 30l-3 8",
  learning_resources:
    "M8 10h14a4 4 0 0 1 4 4v26a4 4 0 0 0-4-4H8zM40 10H26a4 4 0 0 0-4 4v26a4 4 0 0 1 4-4h14zM12 18h8M12 24h8M28 18h8",
  other:
    "M12 24a3 3 0 1 0 6 0 3 3 0 1 0-6 0M21 24a3 3 0 1 0 6 0 3 3 0 1 0-6 0M30 24a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
};

/** The pictogram alone, for chips and badges. Always shown next to the category's name. */
export function CategoryGlyph({
  category,
  className,
}: {
  category: IssueCategory;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
    >
      <path
        d={GLYPHS[category]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
