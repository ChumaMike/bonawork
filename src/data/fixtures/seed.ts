/**
 * DEVELOPMENT FIXTURES — invented sample data.
 *
 * Every school, issue, date and fingerprint below is made up. None of it
 * describes a real school or a real event, and nothing here has been written
 * to any blockchain. This file is only imported by `fixture-api.ts`.
 */
import type { Hex32, IsoDateTime } from "@/shared";
import type {
  ActorRole,
  EvidenceItem,
  EvidencePurpose,
  Issue,
  IssueCategory,
  IssueStatus,
  LedgerRecord,
  PublicTrailStep,
  School,
  Session,
  TimelineEvent,
  TimelineEventType,
} from "../types";

const DAY = 86_400_000;

/** Stand-in fingerprint for sample evidence. Not a hash of any real file. */
export function sampleDigest(seed: string): Hex32 {
  let a = 0x811c9dc5;
  let hex = "";
  for (let round = 0; hex.length < 64; round++) {
    for (const char of `${seed}:${round}`) {
      a ^= char.charCodeAt(0);
      a = Math.imul(a, 0x01000193) >>> 0;
    }
    hex += a.toString(16).padStart(8, "0");
  }
  return `0x${hex.slice(0, 64)}`;
}

export const SAMPLE_SCHOOLS: School[] = [
  {
    id: "thuto-lesedi-primary",
    name: "Thuto-Lesedi Primary School",
    phase: "Primary",
    town: "Soweto",
    district: "Sample District A",
    province: "Gauteng",
    learners: 842,
    participation: "participating",
    participatingSince: "2026-08-03T08:00:00.000Z",
    about:
      "A no-fee primary school with Grade R to Grade 7. The school governing body meets on the first Tuesday of every month.",
  },
  {
    id: "masakhane-secondary",
    name: "Masakhane Secondary School",
    phase: "Secondary",
    town: "Tembisa",
    district: "Sample District B",
    province: "Gauteng",
    learners: 1310,
    participation: "participating",
    participatingSince: "2026-09-14T08:00:00.000Z",
    about:
      "A secondary school with Grade 8 to Grade 12. Science laboratories and a library are shared with the community after hours.",
  },
  {
    id: "khanyisa-primary",
    name: "Khanyisa Primary School",
    phase: "Primary",
    town: "Alexandra",
    district: "Sample District A",
    province: "Gauteng",
    learners: 655,
    participation: "participating",
    participatingSince: "2026-10-01T08:00:00.000Z",
    about:
      "A primary school with Grade R to Grade 7 and an after-school feeding programme.",
  },
  {
    id: "ilanga-combined",
    name: "Ilanga Combined School",
    phase: "Combined",
    town: "Orange Farm",
    district: "Sample District C",
    province: "Gauteng",
    learners: 978,
    participation: "invited",
    participatingSince: null,
    about:
      "A combined school with Grade R to Grade 12. The school has been invited to respond to reports on BonaWork and has not joined yet.",
  },
];

interface SeedEvent {
  type: TimelineEventType;
  actor: ActorRole;
  daysAgo: number;
  note: string;
}

type FinanceEventType = PublicTrailStep["type"];

/** One procurement step of a sample case. It carries a role, a time and nothing private. */
interface SeedStep {
  type: FinanceEventType;
  actor: PublicTrailStep["actor"];
  daysAgo: number;
  /** Only on a rule-engine step: which way it decided. */
  outcome?: PublicTrailStep["outcome"];
}

/**
 * The sentence written on each procurement step. These are constants written
 * by code: no amount, no supplier name and no person's name ever appears in
 * one, because the public trail carries them.
 */
export const FINANCE_NOTE: Record<FinanceEventType, string> = {
  work_order_approved: "A funder approved a work order for this repair.",
  work_order_acknowledged: "The supplier acknowledged the work order.",
  invoice_submitted: "The supplier submitted an invoice for the work.",
  goods_receipt_recorded: "A receiving officer recorded what was delivered.",
  match_recorded: "The order, the invoice and the delivery were compared by rule.",
  payment_dispute_opened: "A payment dispute was opened on this order.",
  payment_dispute_closed: "The payment dispute on this order was closed.",
  release_authorised:
    "A payment approver authorised the release instruction. No money moves on this platform.",
};

/** True for the type of a procurement step. */
export function isFinanceEvent(type: TimelineEventType): type is FinanceEventType {
  return type in FINANCE_NOTE;
}

/**
 * One procurement step as anyone may see it: role, time and proof. A
 * rule-engine step also says which way it decided. Nothing else.
 *
 * As on the backend, a procurement step is never an entry of the issue's
 * timeline: it exists only on the public trail and in the staff money trail.
 */
export function publicStep(input: {
  id: string;
  type: FinanceEventType;
  actor: PublicTrailStep["actor"];
  occurredAt: IsoDateTime;
  ledger: LedgerRecord;
  outcome?: PublicTrailStep["outcome"];
}): PublicTrailStep {
  return {
    eventId: input.id,
    type: input.type,
    actor: input.actor,
    occurredAt: input.occurredAt,
    note: FINANCE_NOTE[input.type],
    ...(input.type === "match_recorded" && input.outcome
      ? { outcome: input.outcome }
      : {}),
    ledger: input.ledger,
  };
}

const step = (
  type: FinanceEventType,
  actor: PublicTrailStep["actor"],
  daysAgo: number,
  outcome?: PublicTrailStep["outcome"],
): SeedStep => ({ type, actor, daysAgo, outcome });

interface SeedEvidence {
  purpose: EvidencePurpose;
  addedBy: ActorRole;
  daysAgo: number;
  mediaType?: string;
  sizeBytes?: number;
}

interface SeedIssue {
  number: number;
  schoolId: string;
  category: IssueCategory;
  title: string;
  location: string;
  description: string;
  status: IssueStatus;
  endorsements: number;
  authority: Issue["authority"];
  interimProtection?: { description: string; daysAgo: number };
  review?: {
    state: "awaiting" | "verified" | "disputed";
    daysAgo: number;
    note?: string;
  };
  events: SeedEvent[];
  evidence: SeedEvidence[];
  /** Show the sample "recorded" design for this issue. Still not a real record. */
  simulatedLedger?: boolean;
  /** The procurement steps of the case, oldest first. Never part of `events`. */
  steps?: SeedStep[];
}

const schoolLevel = (name: string): Issue["authority"] => ({
  name: `${name} — school management team`,
  responsibility: "Day-to-day maintenance and making the area safe.",
  level: "school",
});

const districtLevel = (district: string): Issue["authority"] => ({
  name: `${district} — infrastructure unit`,
  responsibility: "Repairs the school cannot pay for or carry out itself.",
  level: "district",
});

const SEED_ISSUES: SeedIssue[] = [
  {
    number: 118,
    schoolId: "thuto-lesedi-primary",
    category: "sanitation",
    title: "Learners' toilets in Block B are blocked and overflowing",
    location: "Block B, next to the Grade 4 classrooms",
    description:
      "Four of the six toilets in Block B have been blocked for more than two weeks. Waste water runs onto the walkway that learners use to reach the Grade 4 classrooms.",
    status: "being_addressed",
    endorsements: 47,
    authority: districtLevel("Sample District A"),
    interimProtection: {
      description:
        "Block B toilets are closed. Learners use the Block A toilets, which are cleaned twice a day.",
      daysAgo: 9,
    },
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 12,
        note: "Reported by a caregiver with two photos.",
      },
      {
        type: "assessment_started",
        actor: "school_admin",
        daysAgo: 10,
        note: "The deputy principal inspected Block B and confirmed four blocked toilets.",
      },
      {
        type: "interim_protection",
        actor: "school_admin",
        daysAgo: 9,
        note: "Block B toilets are closed. Learners use the Block A toilets, which are cleaned twice a day.",
      },
      {
        type: "progress_recorded",
        actor: "district",
        daysAgo: 3,
        note: "A plumbing contractor has been appointed. Work is planned for this week.",
      },
    ],
    evidence: [
      { purpose: "problem", addedBy: "community", daysAgo: 12 },
      { purpose: "problem", addedBy: "community", daysAgo: 12 },
      { purpose: "progress", addedBy: "school_admin", daysAgo: 10 },
    ],
  },
  {
    number: 124,
    schoolId: "thuto-lesedi-primary",
    category: "learning_resources",
    title: "Broken window panes in the Grade 3 classroom",
    location: "Grade 3A, ground floor",
    description:
      "Three window panes are broken and the glass edges are still in the frames. The classroom is cold and children sit close to the broken glass.",
    status: "repair_claimed",
    endorsements: 12,
    authority: schoolLevel("Thuto-Lesedi Primary School"),
    review: { state: "awaiting", daysAgo: 1 },
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 8,
        note: "Reported by a caregiver with one photo.",
      },
      {
        type: "assessment_started",
        actor: "school_admin",
        daysAgo: 7,
        note: "The caretaker measured the frames and ordered glass.",
      },
      {
        type: "repair_claimed",
        actor: "school_admin",
        daysAgo: 1,
        note: "The school says all three panes were replaced. An independent reviewer has been asked to check.",
      },
    ],
    evidence: [
      { purpose: "problem", addedBy: "community", daysAgo: 8 },
      { purpose: "repair_claim", addedBy: "school_admin", daysAgo: 1 },
    ],
    // Case A: glass ordered, acknowledged and delivered. No invoice yet.
    steps: [
      step("work_order_approved", "buyer", 6),
      step("work_order_acknowledged", "supplier", 5),
      step("goods_receipt_recorded", "receiving_officer", 2),
    ],
  },
  {
    number: 129,
    schoolId: "thuto-lesedi-primary",
    category: "safety",
    title: "Damaged cover on the old pit toilet behind Grade R",
    location: "Behind the Grade R classrooms",
    description:
      "The concrete cover on the old pit toilet is cracked and has moved. Small children play near it at break time.",
    status: "under_assessment",
    endorsements: 21,
    authority: districtLevel("Sample District A"),
    interimProtection: {
      description:
        "The area is fenced off with temporary fencing and a staff member is on duty there at break time.",
      daysAgo: 4,
    },
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 5,
        note: "Reported by a caregiver with one photo.",
      },
      {
        type: "interim_protection",
        actor: "school_admin",
        daysAgo: 4,
        note: "The area is fenced off with temporary fencing and a staff member is on duty there at break time.",
      },
      {
        type: "assessment_started",
        actor: "district",
        daysAgo: 2,
        note: "A district inspector will visit to assess how the pit should be closed permanently.",
      },
    ],
    evidence: [
      { purpose: "problem", addedBy: "community", daysAgo: 5 },
      { purpose: "progress", addedBy: "school_admin", daysAgo: 4 },
    ],
  },
  {
    number: 131,
    schoolId: "masakhane-secondary",
    category: "water",
    title: "No running water in the school since Monday",
    location: "Whole school",
    description:
      "The taps and toilets have had no water since Monday morning. Learners are sent home at 11:00 because the toilets cannot be used.",
    status: "under_assessment",
    endorsements: 86,
    authority: districtLevel("Sample District B"),
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 4,
        note: "Reported by a learner with one photo.",
      },
      {
        type: "assessment_started",
        actor: "school_admin",
        daysAgo: 3,
        note: "The principal confirmed the outage and asked the district for a water tanker.",
      },
    ],
    evidence: [{ purpose: "problem", addedBy: "community", daysAgo: 4 }],
  },
  {
    number: 97,
    schoolId: "masakhane-secondary",
    category: "safety",
    title: "Perimeter fence collapsed next to the sports field",
    location: "East side, sports field",
    description:
      "About 20 metres of fence fell over after the storm. People walk through the school grounds during lessons.",
    status: "independently_verified",
    endorsements: 34,
    authority: districtLevel("Sample District B"),
    review: {
      state: "verified",
      daysAgo: 6,
      note: "I walked the full east side. The new fence is fixed to concrete posts and there are no gaps.",
    },
    simulatedLedger: true,
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 41,
        note: "Reported by a caregiver with two photos.",
      },
      {
        type: "assessment_started",
        actor: "school_admin",
        daysAgo: 39,
        note: "The school confirmed the damage and asked the district for a contractor.",
      },
      {
        type: "progress_recorded",
        actor: "district",
        daysAgo: 20,
        note: "Fencing materials were delivered to the school.",
      },
      {
        type: "repair_claimed",
        actor: "school_admin",
        daysAgo: 10,
        note: "The school says the fence was rebuilt.",
      },
      {
        type: "verified",
        actor: "reviewer",
        daysAgo: 6,
        note: "I walked the full east side. The new fence is fixed to concrete posts and there are no gaps.",
      },
    ],
    evidence: [
      { purpose: "problem", addedBy: "community", daysAgo: 41 },
      { purpose: "problem", addedBy: "community", daysAgo: 41 },
      { purpose: "repair_claim", addedBy: "school_admin", daysAgo: 10 },
      { purpose: "review", addedBy: "reviewer", daysAgo: 6 },
    ],
    // Case B: the first invoice was blocked, the second matched, the release is authorised.
    steps: [
      step("work_order_approved", "buyer", 36),
      step("work_order_acknowledged", "supplier", 35),
      step("goods_receipt_recorded", "receiving_officer", 19),
      step("invoice_submitted", "supplier", 18),
      step("match_recorded", "system", 17.99, "blocked"),
      step("invoice_submitted", "supplier", 16),
      step("match_recorded", "system", 15.99, "matched"),
      step("release_authorised", "payment_approver", 5),
    ],
  },
  {
    number: 102,
    schoolId: "khanyisa-primary",
    category: "buildings",
    title: "Roof leaks into the Grade 6 classroom when it rains",
    location: "Grade 6B, top floor",
    description:
      "Water comes through the ceiling in three places. Desks are moved to one side of the room and the ceiling boards are sagging.",
    status: "disputed",
    endorsements: 29,
    authority: districtLevel("Sample District A"),
    review: {
      state: "disputed",
      daysAgo: 2,
      note: "Two of the three leaks were sealed. Water still comes in above the back row and one ceiling board is still sagging.",
    },
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 30,
        note: "Reported by a caregiver with two photos.",
      },
      {
        type: "assessment_started",
        actor: "school_admin",
        daysAgo: 28,
        note: "The school confirmed three leaks.",
      },
      {
        type: "repair_claimed",
        actor: "school_admin",
        daysAgo: 7,
        note: "The school says the roof was sealed.",
      },
      {
        type: "disputed",
        actor: "reviewer",
        daysAgo: 2,
        note: "Two of the three leaks were sealed. Water still comes in above the back row and one ceiling board is still sagging.",
      },
    ],
    evidence: [
      { purpose: "problem", addedBy: "community", daysAgo: 30 },
      { purpose: "problem", addedBy: "community", daysAgo: 30 },
      { purpose: "repair_claim", addedBy: "school_admin", daysAgo: 7 },
      { purpose: "review", addedBy: "reviewer", daysAgo: 2 },
    ],
  },
  {
    number: 126,
    schoolId: "masakhane-secondary",
    category: "other",
    title: "Build a covered seating area at the sports field",
    location: "Sports field",
    description:
      "Learners and parents stand in the sun during matches. We would like a covered seating area.",
    status: "declined",
    endorsements: 6,
    authority: schoolLevel("Masakhane Secondary School"),
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 15,
        note: "Reported by a caregiver without a photo.",
      },
      {
        type: "declined",
        actor: "school_admin",
        daysAgo: 13,
        note: "This asks for a new building, not a repair. The school has passed it to the governing body for the next budget meeting.",
      },
    ],
    evidence: [],
  },
  {
    number: 136,
    schoolId: "khanyisa-primary",
    category: "learning_resources",
    title: "Not enough desks in Grade 4B",
    location: "Grade 4B",
    description:
      "There are 52 learners and 34 desks. Some children write on their laps or share a desk between three.",
    status: "reported",
    endorsements: 5,
    authority: schoolLevel("Khanyisa Primary School"),
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 1,
        note: "Reported by a caregiver without a photo.",
      },
    ],
    evidence: [],
  },
  {
    number: 140,
    schoolId: "ilanga-combined",
    category: "electricity",
    title: "Exposed electrical wires in the admin corridor",
    location: "Admin block corridor, near the staff room",
    description:
      "A wall socket has come away from the wall and the wires are showing at a height children can reach.",
    status: "reported",
    endorsements: 9,
    authority: schoolLevel("Ilanga Combined School"),
    events: [
      {
        type: "reported",
        actor: "community",
        daysAgo: 6,
        note: "Reported by a caregiver with one photo.",
      },
    ],
    evidence: [{ purpose: "problem", addedBy: "community", daysAgo: 6 }],
  },
];

/**
 * The two issues that carry a procurement trail (`procurement-seed.ts`).
 * Nothing about their public record changes: the steps are on the trail only.
 *
 * - Case A, the window panes: repair claimed; order approved, acknowledged and
 *   delivered. It waits for the supplier's invoice.
 * - Case B, the fence: verified, and its release authorised, after a first
 *   invoice that the rules blocked.
 */
export const CASE_A_ISSUE_ID = "issue-124";
export const CASE_B_ISSUE_ID = "issue-97";

/**
 * Sample sign-in accounts. They exist only in the fixture layer; the real
 * backend has its own accounts and never sends a password to the browser.
 */
export const SAMPLE_PASSWORD = "bona-demo-2026";
export const SAMPLE_ACCOUNTS: { email: string; session: Session }[] = [
  {
    email: "admin@khanyisa.demo",
    session: {
      user: {
        id: "user-admin-khanyisa",
        displayName: "School admin",
        role: "school_admin",
        institutionId: "khanyisa-primary",
      },
      permissions: ["report:read:school", "case:update", "repair:claim"],
    },
  },
  {
    email: "admin@thuto-lesedi.demo",
    session: {
      user: {
        id: "user-admin-thuto",
        displayName: "School admin",
        role: "school_admin",
        institutionId: "thuto-lesedi-primary",
      },
      permissions: ["report:read:school", "case:update", "repair:claim"],
    },
  },
  {
    email: "reviewer@district.demo",
    session: {
      user: {
        id: "user-reviewer",
        displayName: "District reviewer",
        role: "independent_reviewer",
        institutionId: null,
      },
      permissions: ["report:read:all", "repair:verify"],
    },
  },
  {
    email: "parent@community.demo",
    session: {
      user: {
        id: "user-reporter",
        displayName: "Reporter R-5D18",
        role: "reporter",
        institutionId: null,
      },
      permissions: ["report:create", "report:endorse"],
    },
  },
  /* The four procurement roles. Each is a named, invented person. */
  {
    email: "buyer@vaalridge.demo",
    session: {
      user: {
        id: "user-buyer",
        displayName: "Ms Naledi Dlamini",
        role: "buyer",
        institutionId: null,
      },
      permissions: ["order:approve", "procurement:read"],
    },
  },
  {
    email: "supplier@emseni-supplies.demo",
    session: {
      user: {
        id: "user-supplier",
        displayName: "Mr Themba Zulu",
        role: "supplier",
        institutionId: null,
      },
      permissions: ["order:acknowledge", "invoice:submit", "procurement:read"],
    },
  },
  {
    // The receiving officer works at the school the goods are delivered to.
    email: "receiving@thandolwethu.demo",
    session: {
      user: {
        id: "user-receiver",
        displayName: "Mrs Ayanda Ngcobo",
        role: "receiving_officer",
        institutionId: "thuto-lesedi-primary",
      },
      permissions: ["receipt:record", "procurement:read"],
    },
  },
  {
    email: "approver@vaalridge.demo",
    session: {
      user: {
        id: "user-approver",
        displayName: "Mr Pieter van Wyk",
        role: "payment_approver",
        institutionId: null,
      },
      permissions: ["release:authorise", "procurement:read"],
    },
  },
];

export function formatReference(year: number, number: number): string {
  return `BB-${year}-${String(number).padStart(6, "0")}`;
}

/** Build the sample issues with dates relative to `now`, so the demo always looks current. */
export function buildSampleIssues(now: number = Date.now()): Issue[] {
  const iso = (daysAgo: number): IsoDateTime =>
    new Date(now - daysAgo * DAY).toISOString();
  const year = new Date(now).getUTCFullYear();

  return SEED_ISSUES.map((seed) => {
    const school = SAMPLE_SCHOOLS.find((s) => s.id === seed.schoolId)!;
    const id = `issue-${seed.number}`;
    const ledger: LedgerRecord = seed.simulatedLedger
      ? { source: "simulated", status: "confirmed" }
      : { source: "none" };

    const timeline: TimelineEvent[] = seed.events.map((event, index) => ({
      id: `${id}-event-${index + 1}`,
      type: event.type,
      note: event.note,
      actor: event.actor,
      occurredAt: iso(event.daysAgo),
      ledger,
    }));

    const evidence: EvidenceItem[] = seed.evidence.map((item, index) => ({
      id: `${id}-evidence-${index + 1}`,
      version: index + 1,
      purpose: item.purpose,
      addedBy: item.addedBy,
      addedAt: iso(item.daysAgo),
      mediaType: item.mediaType ?? "image/jpeg",
      sizeBytes: item.sizeBytes ?? 1_480_000 + index * 212_000,
      digest: sampleDigest(`${id}-evidence-${index + 1}`),
      ledger,
    }));

    const lastEvent = seed.events[seed.events.length - 1];
    return {
      id,
      reference: formatReference(year, seed.number),
      schoolId: school.id,
      schoolName: school.name,
      schoolTown: school.town,
      category: seed.category,
      title: seed.title,
      location: seed.location,
      description: seed.description,
      status: seed.status,
      createdAt: iso(seed.events[0].daysAgo),
      updatedAt: iso(lastEvent.daysAgo),
      endorsements: seed.endorsements,
      endorsedByMe: false,
      hasInterimProtection: Boolean(seed.interimProtection),
      evidenceCount: evidence.length,
      authority: seed.authority,
      interimProtection: seed.interimProtection
        ? {
            description: seed.interimProtection.description,
            recordedAt: iso(seed.interimProtection.daysAgo),
          }
        : null,
      review: seed.review
        ? {
            state: seed.review.state,
            reviewerLabel: "Independent reviewer (sample)",
            assignedAt: iso(seed.review.daysAgo),
            note: seed.review.note ?? null,
          }
        : null,
      timeline,
      evidence,
      publicTrail: (seed.steps ?? []).map((entry, index) =>
        publicStep({
          id: `${id}-step-${index + 1}`,
          type: entry.type,
          actor: entry.actor,
          occurredAt: iso(entry.daysAgo),
          ledger,
          outcome: entry.outcome,
        }),
      ),
    };
  });
}
