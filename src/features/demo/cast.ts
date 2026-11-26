import type { DemoPerson } from "./steps";

/**
 * The demo people, as the seeded demo accounts name them. Every one is a demo
 * identity; the guide labels them DEMO PERSON.
 */
export const CAST: Record<DemoPerson, { name: string; role: string }> = {
  school: { name: "Nomvula Dlamini", role: "School admin, Thandolwethu Primary" },
  funder: { name: "Naledi Dlamini", role: "Funder, Vaal Ridge repair fund" },
  contractor: { name: "Themba Zulu", role: "Contractor, Emseni Building Supplies" },
  reviewer: {
    name: "Sipho Mokoena",
    role: "Independent reviewer, works for none of them",
  },
  public: { name: "Anyone", role: "A parent, a journalist, you. Not signed in" },
};
