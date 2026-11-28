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
  "school_brick",
  "school_township",
  "school_rural",
  "school_secondary",
  "signin_side",
  "reviewer_check",
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
  /* Slots for photos still to come. Until a file exists, `photoOr` picks a stand-in. */
  "toilets_before",
  "toilets_after",
  "materials_on_site",
  "plumber_fixing",
  "ceiling_before",
  "ceiling_after",
  "tap_before",
  "tap_after",
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
  school_brick: {
    alt: "A long face-brick classroom block with a covered walkway beside a sandy yard, three learners in blue uniform walking away under a large tree.",
    icon: "school",
    ratio: LANDSCAPE,
    color: "#a8745a",
  },
  school_township: {
    alt: "Cream classroom blocks with blue doors around a paved courtyard, seen over a steel palisade fence, two learners crossing in the distance.",
    icon: "school",
    ratio: LANDSCAPE,
    color: "#b89a78",
  },
  school_rural: {
    alt: "Two low classroom blocks painted yellow and red with iron roofs and a green water tank, on grass below green hills under a cloudy sky.",
    icon: "school",
    ratio: LANDSCAPE,
    color: "#7c8a6a",
  },
  school_secondary: {
    alt: "A two-storey brick school building with an outside staircase and open walkways, beside a flowering jacaranda tree and a painted sports court.",
    icon: "school",
    ratio: LANDSCAPE,
    color: "#9a8a8a",
  },
  signin_side: {
    alt: "A parent in a headscarf and a rust-coloured jersey, seen from behind, holding a phone at an open school gate with a classroom block beyond.",
    icon: "users",
    ratio: 2 / 3,
    color: "#8a5a3a",
  },
  reviewer_check: {
    alt: "A person in a high-visibility vest, seen from behind, holding a clipboard in an empty classroom and looking up at new ceiling lights.",
    icon: "shieldCheck",
    ratio: LANDSCAPE,
    color: "#a89868",
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
  toilets_before: {
    alt: "The Thandolwethu toilet block before the repair: cracked cisterns and water on the floor.",
    icon: "building",
    ratio: LANDSCAPE,
    color: "#7c8a7a",
  },
  toilets_after: {
    alt: "The repaired school toilet block, clean and dry, with all four toilets working.",
    icon: "building",
    ratio: LANDSCAPE,
    color: "#7c8a7a",
  },
  ceiling_before: {
    alt: "A classroom ceiling in Room 7 with fallen and sagging boards.",
    icon: "building",
    ratio: LANDSCAPE,
    color: "#9a8468",
  },
  tap_before: {
    alt: "A school kitchen sink with a dry tap and empty pots beside it.",
    icon: "drop",
    ratio: LANDSCAPE,
    color: "#5d7f8a",
  },
  materials_on_site: {
    alt: "New toilet cisterns, flush valves and a length of PVC pipe stacked inside the school gate.",
    icon: "cube",
    ratio: LANDSCAPE,
    color: "#8a8a7a",
  },
  plumber_fixing: {
    alt: "A plumber fitting a new cistern in a school toilet.",
    icon: "wrench",
    ratio: LANDSCAPE,
    color: "#6f7f6a",
  },
  ceiling_after: {
    alt: "A classroom ceiling with new boards fitted and painted.",
    icon: "building",
    ratio: LANDSCAPE,
    color: "#a89868",
  },
  tap_after: {
    alt: "A school kitchen tap running clean water into a steel sink.",
    icon: "drop",
    ratio: LANDSCAPE,
    color: "#5d7f8a",
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

/** `name` when its file exists, otherwise `fallback`: a slot never shows a blank box. */
export function photoOr(name: PhotoName, fallback: PhotoName): PhotoName {
  return hasPhoto(name) ? name : fallback;
}

/**
 * The pictures of a school building. A school card and a school page show one
 * of them, chosen from the school's id, so a school always gets the same
 * picture and a list of schools does not repeat one photograph.
 */
export const SCHOOL_PHOTOS = [
  "hero_school",
  "school_brick",
  "school_township",
  "school_secondary",
  "school_rural",
] as const satisfies readonly PhotoName[];

/**
 * A polynomial hash of the id: small, stable, and the same on the server and
 * in the browser. With this multiplier the sample schools each land on a
 * different picture.
 */
function hashOf(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index++) {
    hash = (Math.imul(hash, 131) + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * The picture for one school. Should the chosen picture have no file yet, the
 * first one that has stands in, so a card is never left with a placeholder.
 */
export function schoolPhoto(schoolId: string): PhotoName {
  const chosen = SCHOOL_PHOTOS[hashOf(schoolId) % SCHOOL_PHOTOS.length];
  return hasPhoto(chosen) ? chosen : (SCHOOL_PHOTOS.find(hasPhoto) ?? chosen);
}
