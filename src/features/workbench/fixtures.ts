import type { PhotoName } from "@/components/media/manifest";

/**
 * Example repairs for the demo. Only the toilets case at Thandolwethu runs on
 * Solana devnet (the guided demo). These others are fixed sample data so the
 * workbenches show a real spread of schools, problems and stages. They never
 * link to a transaction, and every screen that lists them says they are
 * examples.
 */

export type ExampleStage =
  | "needs_report"
  | "needs_quote"
  | "needs_funder"
  | "check1"
  | "check2"
  | "objected"
  | "fixed";

export type ExampleRepair = {
  slug: string;
  title: string;
  /** One or two sentences, as the school wrote it. */
  story: string;
  school: string;
  /** Short name for tight lists: "Ikhwezi Primary". */
  schoolShort: string;
  learners: number;
  photo: PhotoName;
  /** [Check 1 materials, Check 2 labour] in cents; null while there is no quote. */
  split: [number, number] | null;
  stage: ExampleStage;
  /** A short danger or impact tag for funders. */
  tag?: { text: string; tone: "danger" | "accent" };
  category: "water" | "sanitation" | "electricity" | "buildings" | "safety";
  /** Naledi's fund put money in. */
  fundedByNaledi?: boolean;
  /** Themba is the contractor. */
  themba?: boolean;
  /** Sipho is the reviewer, with the line his list shows. */
  sipho?: string;
  /** For the contractor's list. */
  contractorNote?: string;
  /** Set when fixed: the day the reviewer checked it. */
  checkedOn?: string;
};

export const DEMO_SCHOOL = {
  name: "Thandolwethu Primary",
  town: "Emseni, Gauteng",
  learners: 842,
} as const;

export const EXAMPLE_REPAIRS: ExampleRepair[] = [
  {
    slug: "ceiling-room-7",
    title: "Ceiling falling in, Room 7",
    story:
      "Two ceiling boards fell after the rain and more are sagging. Grade 9 is taught in the library until it is fixed.",
    school: "Sizanani Secondary",
    schoolShort: "Sizanani Secondary",
    learners: 41,
    photo: "ceiling_before",
    split: [520_000, 320_000],
    stage: "needs_funder",
    tag: { text: "Danger to learners", tone: "danger" },
    category: "buildings",
  },
  {
    slug: "exposed-wires-admin",
    title: "Exposed wires, admin block",
    story:
      "A cable hangs out of the wall next to the staff room door, at the height of a learner's hand.",
    school: "Thandolwethu Primary",
    schoolShort: "Thandolwethu",
    learners: 842,
    photo: "category_electricity",
    split: [115_000, 150_000],
    stage: "needs_funder",
    tag: { text: "Danger to learners", tone: "danger" },
    category: "electricity",
  },
  {
    slug: "kitchen-tap",
    title: "No water at the kitchen tap",
    story:
      "The kitchen tap has given no water for a week, so the school meals cannot be cooked on site.",
    school: "Ikhwezi Primary",
    schoolShort: "Ikhwezi Primary",
    learners: 540,
    photo: "tap_before",
    split: [90_000, 100_000],
    stage: "needs_funder",
    tag: { text: "No school meals cooked", tone: "accent" },
    category: "water",
    themba: true,
    contractorNote: "Quote requested",
  },
  {
    slug: "windows-block-c",
    title: "Six broken windows, Block C",
    story: "Six window panes in Block C are broken. Two classes sit in the wind and rain.",
    school: "Ikhwezi Primary",
    schoolShort: "Ikhwezi Primary",
    learners: 88,
    photo: "school_township",
    split: [390_000, 240_000],
    stage: "needs_funder",
    category: "buildings",
  },
  {
    slug: "classroom-door",
    title: "Classroom door off its hinges",
    story: "The door of the Grade 10 classroom came off its hinges and cannot be locked.",
    school: "Sizanani Secondary",
    schoolShort: "Sizanani Secondary",
    learners: 52,
    photo: "evidence_capture",
    split: [60_000, 60_000],
    stage: "needs_funder",
    category: "safety",
  },
  {
    slug: "gate-latch",
    title: "Broken gate latch",
    story: "The front gate latch was broken, so the gate could not be closed during school hours.",
    school: "Thandolwethu Primary",
    schoolShort: "Thandolwethu",
    learners: 842,
    photo: "category_safety",
    split: [40_000, 90_000],
    stage: "fixed",
    category: "safety",
    fundedByNaledi: true,
    themba: true,
    contractorNote: "R900 released",
    checkedOn: "3 Nov",
  },
  {
    slug: "roof-leak",
    title: "Roof leak over the Grade 4 class",
    story: "Water comes through the roof over the Grade 4 class every time it rains.",
    school: "Ikhwezi Primary",
    schoolShort: "Ikhwezi Primary",
    learners: 46,
    photo: "category_buildings",
    split: [210_000, 140_000],
    stage: "check2",
    category: "buildings",
    fundedByNaledi: true,
    themba: true,
    contractorNote: "Ask for Check 2",
    sipho: "Check 2, due Mon",
  },
  {
    slug: "broken-basin",
    title: "Broken hand-wash basin",
    story: "The basin outside the toilets cracked and was replaced, but the school says it still leaks.",
    school: "Sizanani Secondary",
    schoolShort: "Sizanani Secondary",
    learners: 610,
    photo: "category_sanitation",
    split: [70_000, 50_000],
    stage: "objected",
    category: "sanitation",
    fundedByNaledi: true,
    sipho: "Dispute review",
  },
];

export function exampleBySlug(slug: string): ExampleRepair | undefined {
  return EXAMPLE_REPAIRS.find((r) => r.slug === slug);
}

/** Plain status for an example repair, as a school would read it. */
export function exampleStatus(r: ExampleRepair): {
  text: string;
  tone: "need" | "muted" | "done" | "stopped";
} {
  switch (r.stage) {
    case "needs_report":
      return { text: "Needs you: finish the report", tone: "need" };
    case "needs_quote":
      return { text: "Waiting for a quote", tone: "muted" };
    case "needs_funder":
      return { text: "Waiting for a funder", tone: "muted" };
    case "check1":
      return { text: "Being fixed: waiting for Check 1", tone: "muted" };
    case "check2":
      return { text: "Being fixed: waiting for Check 2", tone: "muted" };
    case "objected":
      return { text: "School objected", tone: "stopped" };
    case "fixed":
      return { text: `Fixed and checked, ${r.checkedOn ?? ""}`.trim(), tone: "done" };
  }
}

/** Where an example sits on the money line, 0 (reported) to 1 (all released). */
export function exampleProgress(r: ExampleRepair): number {
  switch (r.stage) {
    case "needs_report":
    case "needs_quote":
    case "needs_funder":
      return 0;
    case "check1":
      return 0.5;
    case "check2":
    case "objected":
      return 0.75;
    case "fixed":
      return 1;
  }
}

export function exampleTotal(r: ExampleRepair): number | null {
  return r.split ? r.split[0] + r.split[1] : null;
}
