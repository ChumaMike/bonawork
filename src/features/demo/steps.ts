/**
 * The guided demo, step by step. Pure: no React, no server. The current step
 * is worked out from the real state of the demo case (its status, the school's
 * confirmed budget and the escrow as Solana devnet has it), so a refresh or a
 * second tab always lands on the same step.
 */

/** The demo people. "public" is nobody signed in. */
export const DEMO_PEOPLE = [
  "school",
  "funder",
  "contractor",
  "reviewer",
  "public",
] as const;
export type DemoPerson = (typeof DEMO_PEOPLE)[number];

export const DEMO_PERSON_LABEL: Record<DemoPerson, string> = {
  school: "School",
  funder: "Funder",
  contractor: "Contractor",
  reviewer: "Reviewer",
  public: "Public",
};

/** The session role each demo person signs in with. */
export const DEMO_PERSON_ROLE: Record<Exclude<DemoPerson, "public">, string> = {
  school: "school_admin",
  funder: "buyer",
  contractor: "supplier",
  reviewer: "independent_reviewer",
};

/** Which demo person a signed-in role is; null when it is another role. */
export function personForRole(role: string | null): DemoPerson | null {
  if (role === null) return "public";
  for (const [person, r] of Object.entries(DEMO_PERSON_ROLE)) {
    if (r === role) return person as DemoPerson;
  }
  return null;
}

export type StepId =
  | "report"
  | "scope"
  | "fund"
  | "claim1"
  | "review1"
  | "release1"
  | "proof"
  | "claim2"
  | "school2"
  | "review2"
  | "release2"
  | "done"
  | "off_path"
  | "chain_unreadable";

export type TrancheFacts = {
  state: "Pending" | "Claimed" | "Verified" | "Disputed" | "Released" | "Refunded";
};

/** What the step detection reads. All of it comes from the server. */
export type DemoFacts = {
  /** The case status as stored (submitted, acknowledged, repair_claimed, verified...). */
  status: string;
  budgetConfirmed: boolean;
  escrow: {
    funded: boolean | null;
    tranches: readonly [TrancheFacts, TrancheFacts] | TrancheFacts[] | null;
    chainError: string | null;
  } | null;
  /** The visitor chose to carry on with Check 2 after step 7. */
  continued: boolean;
};

/** The facts from the guided demo's state as `GET /api/demo/guided` returns it. */
export function factsFrom(
  demo: {
    status: string;
    budget: unknown;
    escrow: {
      funded: boolean | null;
      tranches: TrancheFacts[] | null;
      chainError: string | null;
    } | null;
    escrowError: string | null;
  },
  continued: boolean,
): DemoFacts {
  return {
    status: demo.status,
    budgetConfirmed: demo.budget !== null,
    escrow:
      demo.escrow ??
      (demo.escrowError
        ? { funded: null, tranches: null, chainError: demo.escrowError }
        : null),
    continued,
  };
}

export function detectStep(facts: DemoFacts): StepId {
  if (facts.status === "submitted") return "report";
  if (facts.status === "rejected") return "off_path";
  if (!facts.budgetConfirmed && !facts.escrow) return "scope";
  const escrow = facts.escrow;
  if (!escrow) return "fund";
  if (escrow.funded === null || !escrow.tranches) {
    return escrow.chainError ? "chain_unreadable" : "fund";
  }
  if (!escrow.funded) return "fund";
  const [first, second] = escrow.tranches;
  if (!first || !second) return "chain_unreadable";
  const offPath = (t: TrancheFacts) => t.state === "Disputed" || t.state === "Refunded";
  if (offPath(first) || offPath(second)) return "off_path";

  switch (first.state) {
    case "Pending":
      return "claim1";
    case "Claimed":
      return "review1";
    case "Verified":
      return "release1";
    default:
      break;
  }
  // Check 1 is released. Check 2 is optional until the visitor carries on.
  if (second.state === "Pending" && !facts.continued) return "proof";
  switch (second.state) {
    case "Pending":
      return "claim2";
    case "Claimed":
      return facts.status === "repair_claimed" || facts.status === "verified"
        ? "review2"
        : "school2";
    case "Verified":
      return "release2";
    default:
      return "done";
  }
}

export type StepInfo = {
  id: StepId;
  /** 1 to 7 for the main steps; null for Check 2 and the end states. */
  number: number | null;
  /** 1 to 4 for the optional Check 2 steps. */
  check2Number: number | null;
  person: DemoPerson | null;
  title: string;
  why: string;
};

export const MAIN_STEPS = 7;
export const CHECK2_STEPS = 4;

const INFO: Record<StepId, Omit<StepInfo, "id">> = {
  report: {
    number: 1,
    check2Number: null,
    person: "school",
    title: "The school reports the problem",
    why: "Every repair starts with a written record that cannot be changed later.",
  },
  scope: {
    number: 2,
    check2Number: null,
    person: "school",
    title: "The school confirms the job and checks the prices",
    why: "Each price is compared with South African shops before anyone puts money in.",
  },
  fund: {
    number: 3,
    check2Number: null,
    person: "funder",
    title: "The funder puts the money in",
    why: "The money is held safely until it is checked. Nobody can take it early.",
  },
  claim1: {
    number: 4,
    check2Number: null,
    person: "contractor",
    title: "The contractor says the materials are on site",
    why: "Asking is not enough. The money stays held until someone independent checks.",
  },
  review1: {
    number: 5,
    check2Number: null,
    person: "reviewer",
    title: "The reviewer checks the materials and signs",
    why: "A reviewer who works for nobody in the deal checks on site. Bona Guardian reads the transaction first.",
  },
  release1: {
    number: 6,
    check2Number: null,
    person: "public",
    title: "Anyone can release the money, after a short wait",
    why: "The wait gives the school time to object. Here it is 60 seconds; real cases use days.",
  },
  proof: {
    number: 7,
    check2Number: null,
    person: "public",
    title: "Anyone can see the proof on Solana",
    why: "You do not have to trust us: every step is a public record.",
  },
  claim2: {
    number: null,
    check2Number: 1,
    person: "contractor",
    title: "Check 2: the contractor says the work is done",
    why: "The rest of the money waits for its own check.",
  },
  school2: {
    number: null,
    check2Number: 2,
    person: "school",
    title: "Check 2: the school says the repair is finished",
    why: "The school's word is a claim, not proof. It stays a claim until the reviewer checks.",
  },
  review2: {
    number: null,
    check2Number: 3,
    person: "reviewer",
    title: "Check 2: the reviewer checks the work and signs",
    why: "Only the independent reviewer can mark the repair verified.",
  },
  release2: {
    number: null,
    check2Number: 4,
    person: "public",
    title: "Check 2: release the rest to the contractor",
    why: "Same rule as before: a 60-second wait, then anyone can release it.",
  },
  done: {
    number: null,
    check2Number: null,
    person: null,
    title: "Demo finished",
    why: "Both checks are released and the repair is verified by the independent reviewer.",
  },
  off_path: {
    number: null,
    check2Number: null,
    person: null,
    title: "This demo case left the guided path",
    why: "A check was disputed or refunded. Restart the demo to begin again.",
  },
  chain_unreadable: {
    number: null,
    check2Number: null,
    person: null,
    title: "Waiting for Solana",
    why: "Solana devnet could not be read just now. Try again in a moment.",
  },
};

export function stepInfo(id: StepId): StepInfo {
  return { id, ...INFO[id] };
}

/** "Step 3 of 7", "Check 2 · step 1 of 4", or the end state's title. */
export function stepCounter(info: StepInfo): string {
  if (info.number !== null) return `Step ${info.number} of ${MAIN_STEPS}`;
  if (info.check2Number !== null)
    return `Check 2 · step ${info.check2Number} of ${CHECK2_STEPS}`;
  return info.title;
}

/** Where a step happens. Most steps happen on the guided page; the reviews on the real review screen. */
export function stepHref(id: StepId, caseId: string): string {
  if (id === "review1") return `/issues/${caseId}/escrow/review?stage=0`;
  if (id === "review2") return `/issues/${caseId}/escrow/review?stage=1`;
  return "/demo";
}

/** True when the visitor has finished or the case cannot carry on: a new case may be made. */
export function isFinished(id: StepId): boolean {
  return id === "done" || id === "off_path";
}
