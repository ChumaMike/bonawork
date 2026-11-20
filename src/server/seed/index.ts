/**
 * Demo seed — everything here is fictional (docs/demo/DEMO_SCENARIO.md).
 *
 * Runs once when the institutions table is empty. Records are created through
 * the same services the API uses, so commitments, documents and case events
 * are exactly what a live run produces. Ledger writes are queued and then
 * replayed through the configured `LedgerPort`: with the in-memory ledger the
 * receipts are `bona:memory`, with Avalanche they are real transactions, and
 * if the ledger throws the record keeps `receipt: null` with a failed job.
 */
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { ReportCategory, UserRole } from "@/shared";
import { hashPassword } from "../auth/password";
import type { ServerContext } from "../context";
import { schema } from "../db";
import { checkUpload } from "../evidence/validate";
import {
  declineReport,
  recordInterimProtection,
  recordProgress,
  startAssessment,
  submitRepairClaim,
} from "../reports/admin";
import { processLedgerJobs } from "../reports/anchor";
import { actorOf, type Actor } from "../reports/common";
import { createReport } from "../reports/create";
import { setEndorsement } from "../reports/endorse";
import { addEvidence } from "../reports/evidence";
import { submitVerification } from "../reports/review";
import { syntheticPng } from "./image";

const DAY = 86_400_000;
const uid = (group: number, n: number) =>
  `00000000-0000-4000-8000-${String(group).padStart(2, "0")}${String(n).padStart(10, "0")}`;

/* --------------------------------- Schools --------------------------------- */

interface SeedSchool {
  id: string;
  slug: string;
  name: string;
  province: string;
  district: string;
  town: string;
  externalRef: string | null;
  phase: "primary" | "secondary" | "combined";
  learnerCount: number;
  participation: "participating" | "invited";
  participatingSince: string | null;
  about: string;
}

export const DEMO_SCHOOL_ID = uid(1, 1);

export const SEED_SCHOOLS: SeedSchool[] = [
  {
    id: DEMO_SCHOOL_ID,
    slug: "thandolwethu-primary",
    name: "Thandolwethu Primary School",
    province: "gauteng",
    district: "Vaal Ridge Education District",
    town: "Emseni",
    externalRef: "DEMO-SCH-0001",
    phase: "primary",
    learnerCount: 842,
    participation: "participating",
    participatingSince: "2026-10-05T06:00:00.000Z",
    about:
      "A no-fee primary school with Grade R to Grade 7 in Emseni township. Languages: isiZulu, Sesotho and English. Demo data — a fictional school.",
  },
  {
    id: uid(1, 2),
    slug: "thuto-lesedi-primary",
    name: "Thuto-Lesedi Primary School",
    province: "gauteng",
    district: "Sample District A",
    town: "Soweto",
    externalRef: null,
    phase: "primary",
    learnerCount: 842,
    participation: "participating",
    participatingSince: "2026-08-03T08:00:00.000Z",
    about:
      "A no-fee primary school with Grade R to Grade 7. The school governing body meets on the first Tuesday of every month.",
  },
  {
    id: uid(1, 3),
    slug: "masakhane-secondary",
    name: "Masakhane Secondary School",
    province: "gauteng",
    district: "Sample District B",
    town: "Tembisa",
    externalRef: null,
    phase: "secondary",
    learnerCount: 1310,
    participation: "participating",
    participatingSince: "2026-09-14T08:00:00.000Z",
    about:
      "A secondary school with Grade 8 to Grade 12. Science laboratories and a library are shared with the community after hours.",
  },
  {
    id: uid(1, 4),
    slug: "khanyisa-primary",
    name: "Khanyisa Primary School",
    province: "gauteng",
    district: "Sample District A",
    town: "Alexandra",
    externalRef: null,
    phase: "primary",
    learnerCount: 655,
    participation: "participating",
    participatingSince: "2026-10-01T08:00:00.000Z",
    about:
      "A primary school with Grade R to Grade 7 and an after-school feeding programme.",
  },
  {
    id: uid(1, 5),
    slug: "ilanga-combined",
    name: "Ilanga Combined School",
    province: "gauteng",
    district: "Sample District C",
    town: "Orange Farm",
    externalRef: null,
    phase: "combined",
    learnerCount: 978,
    participation: "invited",
    participatingSince: null,
    about:
      "A combined school with Grade R to Grade 12. The school has been invited to respond to reports on BonaBlock and has not joined yet.",
  },
];

/* ---------------------------------- Users ---------------------------------- */

interface SeedUser {
  id: string;
  email: string;
  role: UserRole;
  school: string | null;
  displayName: string;
  publicLabel: string;
  /** Supplier accounts only: the registration reference and trading name. */
  supplier?: { ref: string; name: string };
}

/** The accounts in docs/demo/DEMO_SCENARIO.md §3, plus staff for the other sample schools. */
export const DEMO_ACCOUNTS: SeedUser[] = [
  {
    id: uid(2, 1),
    email: "admin@thandolwethu.demo",
    role: "school_admin",
    school: "thandolwethu-primary",
    displayName: "Ms Nomvula Dlamini",
    publicLabel: "School admin",
  },
  {
    id: uid(2, 2),
    email: "reviewer@vaalridge.demo",
    role: "independent_reviewer",
    school: null,
    displayName: "Mr Sipho Mokoena",
    publicLabel: "District reviewer",
  },
  {
    id: uid(2, 3),
    email: "lindiwe@community.demo",
    role: "reporter",
    school: null,
    displayName: "Ms Lindiwe Mahlangu",
    publicLabel: "Reporter R-7F3A",
  },
  {
    id: uid(2, 4),
    email: "bongani@community.demo",
    role: "reporter",
    school: null,
    displayName: "Mr Bongani Khoza",
    publicLabel: "Reporter R-2C91",
  },
  {
    id: uid(2, 5),
    email: "palesa@community.demo",
    role: "reporter",
    school: null,
    displayName: "Ms Palesa Molefe",
    publicLabel: "Reporter R-B04E",
  },
  {
    id: uid(2, 6),
    email: "outsider@community.demo",
    role: "reporter",
    school: null,
    displayName: "Outsider",
    publicLabel: "Reporter R-0000",
  },
  {
    id: uid(2, 7),
    email: "zanele@community.demo",
    role: "reporter",
    school: null,
    displayName: "Ms Zanele Nkosi",
    publicLabel: "Reporter R-5D18",
  },
  {
    id: uid(2, 8),
    email: "district@vaalridge.demo",
    role: "district_official",
    school: null,
    displayName: "Vaal Ridge district office",
    publicLabel: "District official",
  },
  {
    id: uid(2, 9),
    email: "admin@thuto-lesedi.demo",
    role: "school_admin",
    school: "thuto-lesedi-primary",
    displayName: "Mr Thabo Rakgoale",
    publicLabel: "School admin",
  },
  {
    id: uid(2, 10),
    email: "admin@masakhane.demo",
    role: "school_admin",
    school: "masakhane-secondary",
    displayName: "Mrs Nandi Cele",
    publicLabel: "School admin",
  },
  {
    id: uid(2, 11),
    email: "admin@khanyisa.demo",
    role: "school_admin",
    school: "khanyisa-primary",
    displayName: "Mr Kagiso Mothibi",
    publicLabel: "School admin",
  },
];

/** Extra community members whose only activity is endorsing. */
const ENDORSERS: SeedUser[] = Array.from({ length: 14 }, (_, i) => ({
  id: uid(3, i + 1),
  email: `member${i + 1}@community.demo`,
  role: "reporter" as const,
  school: null,
  displayName: `Community member ${i + 1}`,
  publicLabel: `Reporter R-${(0x1a00 + i * 0x3b).toString(16).toUpperCase().padStart(4, "0")}`,
}));

/* ---------------------------------- Cases ---------------------------------- */

type Step =
  | { kind: "evidence"; by: string; at: string; files: string[] }
  | { kind: "endorse"; by: string[]; at: string }
  | { kind: "assess"; at: string; note: string }
  | { kind: "progress"; at: string; note: string }
  | { kind: "protect"; at: string; note: string }
  | { kind: "claim"; at: string; note: string; files: string[] }
  | {
      kind: "review";
      at: string;
      outcome: "verified" | "disputed";
      note: string;
      files: string[];
    }
  | { kind: "decline"; at: string; reason: string };

interface SeedCase {
  id: string;
  reference: string;
  school: string;
  reporter: string;
  anonymous?: boolean;
  at: string;
  category: ReportCategory;
  title: string;
  location: string;
  description: string;
  files: string[];
  steps: Step[];
}

const ago = (days: number, hour = 9) => {
  const d = new Date(Date.now() - days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

const admins = {
  "thandolwethu-primary": "admin@thandolwethu.demo",
  "thuto-lesedi-primary": "admin@thuto-lesedi.demo",
  "masakhane-secondary": "admin@masakhane.demo",
  "khanyisa-primary": "admin@khanyisa.demo",
} as const;

const members = (from: number, count: number) =>
  ENDORSERS.slice(from, from + count).map((u) => u.email);

export const DEMO_CASE_ID = uid(4, 42);
export const DEMO_CASE_REFERENCE = "BB-2026-000042";

const SEED_CASES: SeedCase[] = [
  {
    id: DEMO_CASE_ID,
    reference: DEMO_CASE_REFERENCE,
    school: "thandolwethu-primary",
    reporter: "lindiwe@community.demo",
    at: "2026-10-19T05:42:00.000Z",
    category: "sanitation",
    title: "Girls' toilet block: four of six toilets not working",
    location: "Girls' ablution block B, next to the Grade 4 to 5 classrooms",
    description:
      "Only 2 of the 6 girls toilets are flushing. The door on cubicle 3 is off its hinges and there is water leaking from a pipe behind the basins so the floor is always wet. Girls in grade 4 and 5 are queuing the whole of break or going home.",
    files: ["e1-cubicles-out-of-order.jpg"],
    steps: [
      {
        kind: "evidence",
        by: "bongani@community.demo",
        at: "2026-10-20T11:15:00.000Z",
        files: ["e2-door-off-hinges.jpg"],
      },
      { kind: "endorse", by: ["bongani@community.demo"], at: "2026-10-20T11:16:00.000Z" },
      {
        kind: "assess",
        at: "2026-10-21T06:30:00.000Z",
        note: "Reported to the district works office. Plumber requested.",
      },
      {
        kind: "evidence",
        by: "palesa@community.demo",
        at: "2026-10-22T08:05:00.000Z",
        files: ["e3-wet-floor.jpg"],
      },
      { kind: "endorse", by: ["palesa@community.demo"], at: "2026-10-22T08:06:00.000Z" },
      {
        kind: "progress",
        at: "2026-10-23T12:20:00.000Z",
        note: "Plumber booked for the week of 2 November.",
      },
      { kind: "endorse", by: members(0, 5), at: "2026-10-26T10:00:00.000Z" },
      {
        kind: "claim",
        at: "2026-11-06T13:48:00.000Z",
        note: "All six toilets repaired, door replaced, leak fixed.",
        files: ["e4-claim-new-cisterns.jpg", "e5-claim-dry-floor.jpg"],
      },
    ],
  },
  {
    id: uid(4, 38),
    reference: "BB-2026-000038",
    school: "thandolwethu-primary",
    reporter: "palesa@community.demo",
    at: "2026-09-28T06:10:00.000Z",
    category: "buildings",
    title: "Broken window panes, Grade 6B",
    location: "Grade 6B, first floor",
    description:
      "Two window panes in Grade 6B are broken and the glass edges are still in the frames. The room is cold and learners sit next to the broken glass.",
    files: ["c38-broken-panes.jpg"],
    steps: [
      { kind: "endorse", by: members(5, 3), at: "2026-09-29T07:00:00.000Z" },
      {
        kind: "assess",
        at: "2026-09-29T09:00:00.000Z",
        note: "The caretaker measured the frames and ordered glass.",
      },
      {
        kind: "claim",
        at: "2026-10-08T12:30:00.000Z",
        note: "Both panes were replaced and the frames repainted.",
        files: ["c38-claim-new-panes.jpg"],
      },
      {
        kind: "review",
        at: "2026-10-12T08:45:00.000Z",
        outcome: "verified",
        note: "Site visit 12 October. Both panes are new, properly puttied and the frames are sound.",
        files: ["c38-review-panes.jpg"],
      },
    ],
  },
  {
    id: uid(4, 45),
    reference: "BB-2026-000045",
    school: "thandolwethu-primary",
    reporter: "bongani@community.demo",
    at: "2026-10-27T07:20:00.000Z",
    category: "buildings",
    title: "Ceiling board sagging in the library corner",
    location: "Library, corner by the reading mats",
    description:
      "A ceiling board above the reading corner is sagging and stained. It looks like it could fall. Learners sit under it during reading time.",
    files: ["c45-ceiling-board.jpg"],
    steps: [
      { kind: "endorse", by: members(8, 5), at: "2026-10-28T09:00:00.000Z" },
      {
        kind: "assess",
        at: "2026-10-29T08:00:00.000Z",
        note: "Confirmed. The reading corner has been moved away from the board while the district inspects the roof.",
      },
    ],
  },
  {
    id: uid(4, 47),
    reference: "BB-2026-000047",
    school: "thandolwethu-primary",
    reporter: "palesa@community.demo",
    at: "2026-11-12T14:05:00.000Z",
    category: "safety",
    title: "Perimeter fence cut near the sports field",
    location: "West fence, behind the sports field",
    description:
      "The fence has been cut open behind the sports field. People walk through the grounds during lessons and the gap is big enough for a bicycle.",
    files: ["c47-fence-cut.jpg"],
    steps: [{ kind: "endorse", by: members(13, 1), at: "2026-11-13T08:00:00.000Z" }],
  },
  {
    id: uid(4, 118),
    reference: "BB-2026-000118",
    school: "thuto-lesedi-primary",
    reporter: "member1@community.demo",
    at: ago(12, 6),
    category: "sanitation",
    title: "Learners' toilets in Block B are blocked and overflowing",
    location: "Block B, next to the Grade 4 classrooms",
    description:
      "Four of the six toilets in Block B have been blocked for more than two weeks. Waste water runs onto the walkway that learners use to reach the Grade 4 classrooms.",
    files: ["c118-block-b-1.jpg", "c118-block-b-2.jpg"],
    steps: [
      { kind: "endorse", by: members(1, 9), at: ago(11) },
      {
        kind: "assess",
        at: ago(10),
        note: "The deputy principal inspected Block B and confirmed four blocked toilets.",
      },
      {
        kind: "protect",
        at: ago(9),
        note: "Block B toilets are closed. Learners use the Block A toilets, which are cleaned twice a day.",
      },
      {
        kind: "progress",
        at: ago(3),
        note: "A plumbing contractor has been appointed. Work is planned for this week.",
      },
    ],
  },
  {
    id: uid(4, 131),
    reference: "BB-2026-000131",
    school: "masakhane-secondary",
    reporter: "member2@community.demo",
    at: ago(4, 7),
    category: "water",
    title: "No running water in the school since Monday",
    location: "Whole school",
    description:
      "The taps and toilets have had no water since Monday morning. Learners are sent home at 11:00 because the toilets cannot be used.",
    files: ["c131-dry-taps.jpg"],
    steps: [
      { kind: "endorse", by: members(3, 11), at: ago(4, 12) },
      {
        kind: "assess",
        at: ago(3),
        note: "The principal confirmed the outage and asked the district for a water tanker.",
      },
    ],
  },
  {
    id: uid(4, 97),
    reference: "BB-2026-000097",
    school: "masakhane-secondary",
    reporter: "member3@community.demo",
    at: ago(41, 8),
    category: "safety",
    title: "Perimeter fence collapsed next to the sports field",
    location: "East side, sports field",
    description:
      "About 20 metres of fence fell over after the storm. People walk through the school grounds during lessons.",
    files: ["c97-fence-1.jpg", "c97-fence-2.jpg"],
    steps: [
      { kind: "endorse", by: members(4, 8), at: ago(40) },
      {
        kind: "assess",
        at: ago(39),
        note: "The school confirmed the damage and asked the district for a contractor.",
      },
      {
        kind: "progress",
        at: ago(20),
        note: "Fencing materials were delivered to the school.",
      },
      {
        kind: "claim",
        at: ago(10),
        note: "The school says the fence was rebuilt.",
        files: ["c97-claim-fence.jpg"],
      },
      {
        kind: "review",
        at: ago(6),
        outcome: "verified",
        note: "I walked the full east side. The new fence is fixed to concrete posts and there are no gaps.",
        files: ["c97-review-fence.jpg"],
      },
    ],
  },
  {
    id: uid(4, 102),
    reference: "BB-2026-000102",
    school: "khanyisa-primary",
    reporter: "member4@community.demo",
    at: ago(30, 7),
    category: "buildings",
    title: "Roof leaks into the Grade 6 classroom when it rains",
    location: "Grade 6B, top floor",
    description:
      "Water comes through the ceiling in three places. Desks are moved to one side of the room and the ceiling boards are sagging.",
    files: ["c102-leak-1.jpg", "c102-leak-2.jpg"],
    steps: [
      { kind: "endorse", by: members(5, 7), at: ago(29) },
      { kind: "assess", at: ago(28), note: "The school confirmed three leaks." },
      {
        kind: "claim",
        at: ago(7),
        note: "The school says the roof was sealed.",
        files: ["c102-claim-roof.jpg"],
      },
      {
        kind: "review",
        at: ago(2),
        outcome: "disputed",
        note: "Two of the three leaks were sealed. Water still comes in above the back row and one ceiling board is still sagging.",
        files: ["c102-review-leak.jpg"],
      },
    ],
  },
  {
    id: uid(4, 136),
    reference: "BB-2026-000136",
    school: "khanyisa-primary",
    reporter: "member5@community.demo",
    anonymous: true,
    at: ago(1, 8),
    category: "learning_resources",
    title: "Not enough desks in Grade 4B",
    location: "Grade 4B",
    description:
      "There are 52 learners and 34 desks. Some children write on their laps or share a desk between three.",
    files: [],
    steps: [{ kind: "endorse", by: members(6, 4), at: ago(1, 12) }],
  },
  {
    id: uid(4, 139),
    reference: "BB-2026-000139",
    school: "khanyisa-primary",
    reporter: "member6@community.demo",
    at: ago(9, 9),
    category: "other",
    title: "Request to repaint the school hall",
    location: "School hall",
    description:
      "The hall walls are faded and should be repainted before the prize-giving.",
    files: [],
    steps: [
      {
        kind: "decline",
        at: ago(8),
        reason:
          "Cosmetic work is scheduled for the December holidays and is not a safety or service fault.",
      },
    ],
  },
  {
    id: uid(4, 140),
    reference: "BB-2026-000140",
    school: "ilanga-combined",
    reporter: "member7@community.demo",
    at: ago(6, 10),
    category: "electricity",
    title: "Exposed electrical wires in the admin corridor",
    location: "Admin block corridor, near the staff room",
    description:
      "A wall socket has come away from the wall and the wires are showing at a height children can reach.",
    files: ["c140-wires.jpg"],
    steps: [{ kind: "endorse", by: members(7, 6), at: ago(5) }],
  },
];

/* ---------------------------------- Runner --------------------------------- */

export async function seedIfEmpty(ctx: ServerContext): Promise<boolean> {
  const [{ count }] = await ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(schema.institutions);
  if (Number(count) > 0) return false;
  // First seed: stable ids, so every serverless instance that seeds its own
  // in-memory database agrees on them (a shared Postgres seeds only once).
  await runSeed(ctx, { freshIds: false });
  return true;
}

/** A fixed, UUID-shaped id derived from the case reference. */
function stableCaseId(reference: string): string {
  const h = createHash("sha256").update(`bona-seed:${reference}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Truncate every table and seed again (`POST /api/demo/reset`). */
export async function resetDatabase(ctx: ServerContext): Promise<void> {
  // The ledger (memory or Avalanche) keeps the previous cases forever; the
  // re-seeded cases get new report ids in runSeed, so nothing collides.
  await ctx.db.execute(
    sql`TRUNCATE TABLE "ledger_jobs", "release_instructions", "match_results", "goods_receipts", "invoices", "work_order_versions", "work_orders", "commitment_documents", "independent_reviews", "repair_claims", "interim_protections", "endorsements", "evidence_commitments", "case_events", "reports", "users", "institutions" RESTART IDENTITY CASCADE`,
  );
  await runSeed(ctx, { freshIds: true });
}

export async function runSeed(
  ctx: ServerContext,
  { freshIds }: { freshIds: boolean },
): Promise<void> {
  const started = Date.now();
  const { db } = ctx;
  await db.insert(schema.institutions).values(
    SEED_SCHOOLS.map((s) => ({
      ...s,
      kind: "school",
      createdAt: s.participatingSince ?? ago(60),
    })),
  );
  const passwordHash = await hashPassword(ctx.env.DEMO_ACCOUNT_PASSWORD);
  const slugToId = Object.fromEntries(SEED_SCHOOLS.map((s) => [s.slug, s.id]));
  const allUsers = [...DEMO_ACCOUNTS, ...ENDORSERS];
  await db.insert(schema.users).values(
    allUsers.map((u) => ({
      id: u.id,
      email: u.email,
      passwordHash,
      role: u.role,
      institutionId: u.school ? slugToId[u.school] : null,
      displayName: u.displayName,
      publicLabel: u.publicLabel,
      supplierRef: u.supplier?.ref ?? null,
      supplierName: u.supplier?.name ?? null,
      createdAt: ago(70),
    })),
  );
  const actors = new Map<string, Actor>(
    allUsers.map((u) => [
      u.email,
      actorOf({
        id: u.id,
        email: u.email,
        passwordHash,
        role: u.role,
        institutionId: u.school ? slugToId[u.school] : null,
        displayName: u.displayName,
        publicLabel: u.publicLabel,
        supplierRef: u.supplier?.ref ?? null,
        supplierName: u.supplier?.name ?? null,
        createdAt: "",
      }),
    ]),
  );
  const actor = (email: string): Actor => {
    const found = actors.get(email);
    if (!found) throw new Error(`seed: unknown account ${email}`);
    return found;
  };
  const uploads = (files: string[]) =>
    Promise.all(
      files.map((name) =>
        checkUpload(new File([syntheticPng(name)], name, { type: "image/png" })),
      ),
    );
  const deps = { db, ledger: ctx.ledger, store: ctx.store };
  const defer = { anchorMode: "defer" as const };

  for (const c of SEED_CASES) {
    const admin = actor(
      admins[c.school as keyof typeof admins] ?? "admin@thandolwethu.demo",
    );
    const reviewer = actor("reviewer@vaalridge.demo");
    await createReport(deps, {
      actor: actor(c.reporter),
      institutionIdOrSlug: c.school,
      category: c.category,
      title: c.title,
      description: c.description,
      location: c.location,
      anonymous: c.anonymous ?? false,
      uploads: await uploads(c.files),
      at: c.at,
      // A re-seed gets fresh ids: a ledger (memory or Avalanche) remembers
      // report ids forever, so a re-seeded case must never reuse one.
      id: freshIds ? randomUUID() : stableCaseId(c.reference),
      reference: c.reference,
      ...defer,
    });
    const target = { reportIdOrReference: c.reference };
    for (const step of c.steps) {
      switch (step.kind) {
        case "evidence":
          await addEvidence(deps, {
            ...target,
            actor: actor(step.by),
            purpose: "problem",
            uploads: await uploads(step.files),
            at: step.at,
            ...defer,
          });
          break;
        case "endorse":
          for (const email of step.by) {
            await setEndorsement(db, {
              ...target,
              actor: actor(email),
              affected: true,
              at: step.at,
            });
          }
          break;
        case "assess":
          await startAssessment(deps, {
            ...target,
            actor: admin,
            note: step.note,
            at: step.at,
            ...defer,
          });
          break;
        case "progress":
          await recordProgress(deps, {
            ...target,
            actor: admin,
            note: step.note,
            at: step.at,
          });
          break;
        case "protect":
          await recordInterimProtection(deps, {
            ...target,
            actor: admin,
            description: step.note,
            at: step.at,
            ...defer,
          });
          break;
        case "claim":
          await submitRepairClaim(deps, {
            ...target,
            actor: admin,
            note: step.note,
            uploads: await uploads(step.files),
            at: step.at,
            ...defer,
          });
          break;
        case "review":
          await submitVerification(deps, {
            ...target,
            actor: reviewer,
            outcome: step.outcome,
            note: step.note,
            uploads: await uploads(step.files),
            at: step.at,
            ...defer,
          });
          break;
        case "decline":
          await declineReport(deps, {
            ...target,
            actor: admin,
            reason: step.reason,
            at: step.at,
          });
          break;
      }
    }
  }

  // Anchor everything that was queued. The in-memory ledger is instant. A
  // real chain needs minutes for the whole seed: on a long-lived server the
  // jobs run in the background; on Vercel, where work after the response may
  // be frozen mid-write, they stay queued and `POST /api/ledger/retry` sends
  // them (call it until `remaining` is 0).
  if (ctx.ledgerMode === "avalanche" && ctx.env.VERCEL) {
    console.info("[seed] ledger: writes queued; POST /api/ledger/retry to anchor them");
  } else {
    const anchoring = processLedgerJobs(db, ctx.ledger).then(
      (summary) =>
        console.info(
          `[seed] ledger: ${summary.anchored} anchored, ${summary.failed} waiting for retry, ${summary.rejected} rejected`,
        ),
      (error) => console.warn(`[seed] anchoring failed: ${String(error)}`),
    );
    if (ctx.ledgerMode !== "avalanche") await anchoring;
  }
  console.info(
    `[seed] ${SEED_SCHOOLS.length} schools, ${allUsers.length} accounts and ${SEED_CASES.length} cases in ${Date.now() - started} ms (demo password: DEMO_ACCOUNT_PASSWORD)`,
  );
}
