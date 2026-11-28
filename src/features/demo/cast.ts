import type { DemoPerson } from "./steps";

/**
 * The demo people, as the seeded demo accounts name them. Every one is a demo
 * identity.
 */
export const CAST: Record<DemoPerson, { name: string; role: string; short: string }> = {
  school: {
    name: "Nomvula Dlamini",
    role: "School admin, Thandolwethu Primary",
    short: "school",
  },
  funder: { name: "Naledi Dlamini", role: "Funder, Vaal Ridge repair fund", short: "funder" },
  contractor: { name: "Themba Zulu", role: "Contractor, plumber", short: "contractor" },
  reviewer: {
    name: "Sipho Mokoena",
    role: "Independent reviewer, works for none of them",
    short: "reviewer",
  },
  public: { name: "Anyone", role: "A parent, a journalist, you. Not signed in", short: "public" },
};

/** The supplier Check 1 releases to. A business, not one of the demo people. */
export const SUPPLIER_NAME = "Emseni Building Supplies";

/** Each demo person's own page. */
export const BENCH: Record<DemoPerson, string> = {
  school: "/school",
  funder: "/fund",
  contractor: "/jobs",
  reviewer: "/checks",
  public: "/demo",
};
