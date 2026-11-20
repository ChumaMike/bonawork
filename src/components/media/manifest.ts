import type { IconName } from "@/components/ui/icon";
import { GENERATED, type GeneratedPhoto } from "./generated";

/**
 * Every photograph the app can show, by key. The hand-written part (alt text,
 * fallback icon, intended shape and tone) lives here. The measured part (file,
 * size, dominant colour) is written by `scripts/images/optimise.mts` into
 * ./generated.ts when a picture is dropped into public/images/raw/.
 *
 * Until a picture arrives, `file` is null and <Photo> draws a placeholder, so
 * no page is blocked on photography. See docs/design/IMAGES.md.
 */

export const PHOTO_NAMES = [
  "hero_home",
  "hero_school",
  "category_water",
  "category_sanitation",
  "category_electricity",
  "category_buildings",
  "category_safety",
  "category_learning_resources",
  "category_other",
  "community_meeting",
  "reviewer_inspecting",
  "admin_desk",
  "verify_phone",
  "evidence_capture",
  "empty_state",
] as const;

export type PhotoName = (typeof PHOTO_NAMES)[number];

export type PhotoMeta = {
  /** Meaningful alternative text. Describe what the picture shows, not that it is a picture. */
  alt: string;
  /** Icon drawn in the placeholder before the picture exists. */
  icon: IconName;
  /** Expected width:height, used by the placeholder and by <Photo> until the file is measured. */
  ratio: number;
  /** Placeholder tone and the dominant colour until the file is measured. */
  color: string;
};

export type Photo = PhotoMeta & {
  name: PhotoName;
  /** Null until the optimiser has produced the file. */
  file: string | null;
  width: number;
  height: number;
  variants: number[];
};

const LANDSCAPE = 3 / 2;

export const PHOTO_META: Record<PhotoName, PhotoMeta> = {
  hero_home: {
    alt: "Learners in uniform walking through a school gate in warm morning light, a parent behind them holding a phone.",
    icon: "school",
    ratio: LANDSCAPE,
    color: "#b07a44",
  },
  hero_school: {
    alt: "A brick public school building beside a dusty playground and a tall tree, late in the afternoon.",
    icon: "school",
    ratio: LANDSCAPE,
    color: "#8c6a48",
  },
  category_water: {
    alt: "A single outdoor school tap on a concrete block with a bucket under it.",
    icon: "drop",
    ratio: LANDSCAPE,
    color: "#5d7f8a",
  },
  category_sanitation: {
    alt: "The outside of a school toilet block with a closed door and a hand-wash basin.",
    icon: "building",
    ratio: LANDSCAPE,
    color: "#7c8a7a",
  },
  category_electricity: {
    alt: "A classroom light fitting and a wall switch with a worn cable, lit by daylight from a window.",
    icon: "bolt",
    ratio: LANDSCAPE,
    color: "#a08a5e",
  },
  category_buildings: {
    alt: "A classroom corner with a cracked wall and a missing ceiling board.",
    icon: "building",
    ratio: LANDSCAPE,
    color: "#9a8468",
  },
  category_safety: {
    alt: "A school perimeter fence with a damaged section next to a footpath.",
    icon: "fence",
    ratio: LANDSCAPE,
    color: "#8a7a5a",
  },
  category_learning_resources: {
    alt: "A classroom shelf with a few worn textbooks and an empty space, a chalkboard behind it.",
    icon: "book",
    ratio: LANDSCAPE,
    color: "#7a6a52",
  },
  category_other: {
    alt: "A school playground with an old swing frame and a bench in gentle light.",
    icon: "sun",
    ratio: LANDSCAPE,
    color: "#a4895c",
  },
  community_meeting: {
    alt: "Parents and school governing body members seated in a circle under a tree in the school yard.",
    icon: "users",
    ratio: LANDSCAPE,
    color: "#8f7a4e",
  },
  reviewer_inspecting: {
    alt: "An adult in a high-visibility vest with a clipboard inspecting a repaired toilet block door.",
    icon: "shieldCheck",
    ratio: LANDSCAPE,
    color: "#6f7f6a",
  },
  admin_desk: {
    alt: "A school administrator's desk with a phone, a register book and light from a window.",
    icon: "file",
    ratio: LANDSCAPE,
    color: "#9a7f5c",
  },
  verify_phone: {
    alt: "Hands holding a phone in a school corridor; the screen glows green with a check mark.",
    icon: "shieldCheck",
    ratio: LANDSCAPE,
    color: "#3f6b55",
  },
  evidence_capture: {
    alt: "Hands holding an Android phone to photograph a broken school tap.",
    icon: "camera",
    ratio: LANDSCAPE,
    color: "#6c7d80",
  },
  empty_state: {
    alt: "An empty notebook and a pencil on a cream background with an earth-tone geometric border.",
    icon: "image",
    ratio: 1,
    color: "#e9d9b8",
  },
};

function resolve(name: PhotoName): Photo {
  const meta = PHOTO_META[name];
  const generated: GeneratedPhoto | undefined = GENERATED[name];
  if (!generated) {
    return {
      name,
      ...meta,
      file: null,
      width: Math.round(1200),
      height: Math.round(1200 / meta.ratio),
      variants: [],
    };
  }
  return {
    name,
    ...meta,
    file: generated.file,
    width: generated.width,
    height: generated.height,
    color: generated.color,
    ratio: generated.width / generated.height,
    variants: generated.variants,
  };
}

export const PHOTOS: Record<PhotoName, Photo> = Object.fromEntries(
  PHOTO_NAMES.map((name) => [name, resolve(name)]),
) as Record<PhotoName, Photo>;

export function getPhoto(name: PhotoName): Photo {
  return PHOTOS[name];
}

/** True once a real picture exists for this key. */
export function hasPhoto(name: PhotoName): boolean {
  return PHOTOS[name].file !== null;
}
