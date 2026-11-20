import { describe, expect, it } from "vitest";
import {
  AVALANCHE_CHAINS,
  BlockchainReceiptSchema,
  CASE_EVENT_REGISTRY_EVENT,
  CASE_EVENT_RESULTING_STATUS,
  CASE_EVENT_TYPES,
  CHAIN_ROLE_CODE,
  CHAIN_ROLE_FOR_USER_ROLE,
  CaseEventSchema,
  CommitmentDocumentSchema,
  CreateReportInputSchema,
  EVIDENCE_KIND_ROLE,
  EndorsementSchema,
  EvidenceCommitmentSchema,
  FINANCE_CASE_EVENT_TYPES,
  FINANCE_DOCUMENT_TYPES,
  FINANCE_EVENTS,
  Hex32Schema,
  IndependentReviewSchema,
  InterimProtectionSchema,
  LEDGER_EVENTS,
  PERMISSION_FOR_STATUS,
  REGISTRY_EVENTS,
  REPORT_STATUSES,
  CHAIN_STATUS_FOR_STATUS,
  RepairClaimSchema,
  ReportSchema,
  SEPARATED_FINANCE_PERMISSIONS,
  SchoolSchema,
  StatusHistoryEntrySchema,
  USER_ROLES,
  UserSchema,
  can,
  canTransition,
  canonicalJson,
  computeCommitment,
  idToBytes32,
  newSalt,
  sha256Hex,
  type ReportDocument,
} from "./index";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = "2026-11-16T09:30:00.000Z";
const digest = `0x${"ab".repeat(32)}`;

const receipt = {
  chainId: AVALANCHE_CHAINS.fuji,
  contractAddress: "0x0000000000000000000000000000000000000001",
  txId: `0x${"cd".repeat(32)}`,
  status: "confirmed",
  blockNumber: 42,
  blockTimestamp: now,
  event: "ReportRegistered",
};

const report = {
  id: id(1),
  reference: "BB-2026-000123",
  institutionId: id(9),
  category: "sanitation",
  title: "Collapsed pit latrine",
  description: "The learners' toilet block behind block B has collapsed.",
  status: "submitted",
  endorsementCount: 0,
  hasInterimProtection: false,
  reporterId: null,
  createdAt: now,
  updatedAt: now,
  commitment: digest,
  receipt,
};

describe("schemas", () => {
  it("accepts a school, a user and a report", () => {
    const school = {
      id: id(9),
      kind: "school",
      name: "Example Primary School",
      province: "gauteng",
      district: "Johannesburg Central",
      externalRef: "700123456",
      phase: "primary",
      learnerCount: 640,
    };
    expect(SchoolSchema.safeParse(school).success).toBe(true);
    expect(SchoolSchema.safeParse({ ...school, province: "atlantis" }).success).toBe(
      false,
    );
    const user = {
      id: id(5),
      displayName: "N. Dlamini",
      role: "school_admin",
      institutionId: id(9),
      createdAt: now,
    };
    expect(UserSchema.safeParse(user).success).toBe(true);
    expect(ReportSchema.safeParse(report).success).toBe(true);
    expect(ReportSchema.safeParse({ ...report, reference: "GS-1" }).success).toBe(false);
    expect(ReportSchema.safeParse({ ...report, status: "resolved" }).success).toBe(false);
  });

  it("does not let a client set server-owned report fields", () => {
    const parsed = CreateReportInputSchema.parse({
      institutionId: id(9),
      category: "safety",
      title: "Unsafe fence",
      description: "The fence has collapsed.",
      anonymous: true,
      status: "verified",
    });
    expect(parsed).not.toHaveProperty("status");
  });

  it("validates receipts, evidence, endorsements, protections, claims and reviews", () => {
    expect(BlockchainReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(
      BlockchainReceiptSchema.safeParse({ ...receipt, event: "Anchored" }).success,
    ).toBe(false);
    const commitment = {
      id: id(3),
      reportId: id(1),
      algorithm: "sha256",
      digest,
      kind: "report",
      sizeBytes: 1024,
      mediaType: "image/jpeg",
      createdAt: now,
      receipt: { ...receipt, event: "EvidenceRegistered" },
    };
    expect(EvidenceCommitmentSchema.safeParse(commitment).success).toBe(true);
    expect(
      EvidenceCommitmentSchema.safeParse({ ...commitment, algorithm: "md5" }).success,
    ).toBe(false);
    expect(
      EndorsementSchema.safeParse({
        id: id(6),
        reportId: id(1),
        userId: id(5),
        createdAt: now,
      }).success,
    ).toBe(true);
    expect(
      InterimProtectionSchema.safeParse({
        id: id(10),
        reportId: id(1),
        measure: "Toilet block fenced off; learners use the staff toilets.",
        recordedBy: id(5),
        createdAt: now,
        commitment: digest,
        receipt: null,
      }).success,
    ).toBe(true);
    expect(
      RepairClaimSchema.safeParse({
        id: id(11),
        reportId: id(1),
        index: 0,
        summary: "New toilet block completed.",
        claimedBy: id(5),
        outcome: "pending",
        createdAt: now,
        commitment: digest,
        receipt: null,
      }).success,
    ).toBe(true);
    const review = {
      id: id(7),
      reportId: id(1),
      claimId: id(11),
      reviewerId: id(8),
      outcome: "disputed",
      findings: "The new toilets have no doors and no water.",
      evidenceIds: [id(3)],
      createdAt: now,
      commitment: digest,
      receipt: null,
    };
    expect(IndependentReviewSchema.safeParse(review).success).toBe(true);
    expect(
      IndependentReviewSchema.safeParse({ ...review, outcome: "fixed" }).success,
    ).toBe(false);
  });

  it("validates case events and status history", () => {
    expect(
      CaseEventSchema.safeParse({
        id: id(2),
        reportId: id(1),
        sequence: 0,
        type: "report_registered",
        actorId: null,
        actorRole: "reporter",
        occurredAt: now,
        subjectId: null,
        anchoredValue: digest,
        statusTo: null,
        reason: null,
        receipt,
      }).success,
    ).toBe(true);
    expect(
      StatusHistoryEntrySchema.safeParse({
        eventId: id(2),
        reportId: id(1),
        from: "repair_claimed",
        to: "disputed",
        actorRole: "independent_reviewer",
        reason: null,
        occurredAt: now,
        receipt: null,
      }).success,
    ).toBe(true);
  });

  it("requires lower-case 0x-prefixed 32-byte digests", () => {
    expect(Hex32Schema.safeParse(digest).success).toBe(true);
    expect(Hex32Schema.safeParse(digest.toUpperCase()).success).toBe(false);
    expect(Hex32Schema.safeParse(digest.slice(2)).success).toBe(false);
  });
});

describe("roles and status rules", () => {
  it("never lets the party claiming a repair also verify it", () => {
    for (const role of USER_ROLES) {
      expect(can(role, "repair:claim") && can(role, "repair:verify")).toBe(false);
    }
    expect(can("independent_reviewer", "repair:verify")).toBe(true);
    expect(can("school_admin", "repair:claim")).toBe(true);
    expect(CHAIN_ROLE_FOR_USER_ROLE.school_admin).not.toBe(
      CHAIN_ROLE_FOR_USER_ROLE.independent_reviewer,
    );
  });

  it("keeps private evidence away from reporters", () => {
    expect(can("reporter", "evidence:read")).toBe(false);
    expect(can("reporter", "report:endorse")).toBe(true);
  });

  it("only lets a role upload its own kind of evidence", () => {
    for (const role of Object.values(EVIDENCE_KIND_ROLE)) {
      expect(can(role, "evidence:upload")).toBe(true);
    }
    expect(can("district_official", "evidence:upload")).toBe(false);
  });

  it("only reaches verified through a repair claim, as BonaRegistry requires", () => {
    for (const from of REPORT_STATUSES) {
      expect(canTransition(from, "verified")).toBe(from === "repair_claimed");
      expect(canTransition(from, "disputed")).toBe(from === "repair_claimed");
      // On-chain, claimRepair needs Acknowledged or Disputed.
      if (canTransition(from, "repair_claimed")) {
        expect(["acknowledged", "disputed"]).toContain(CHAIN_STATUS_FOR_STATUS[from]);
      }
    }
    expect(canTransition("submitted", "repair_claimed")).toBe(false);
    expect(canTransition("verified", "repair_claimed")).toBe(false);
    expect(CHAIN_STATUS_FOR_STATUS.in_progress).toBe("acknowledged");
    expect(CHAIN_STATUS_FOR_STATUS.rejected).toBeNull();
    expect(PERMISSION_FOR_STATUS.verified).toBe("repair:verify");
    expect(PERMISSION_FOR_STATUS.disputed).toBe("repair:verify");
    expect(PERMISSION_FOR_STATUS.repair_claimed).toBe("repair:claim");
    for (const status of REPORT_STATUSES) {
      expect(USER_ROLES.some((role) => can(role, PERMISSION_FOR_STATUS[status]))).toBe(
        true,
      );
    }
  });

  it("keeps the four finance steps with four different roles", () => {
    for (const role of USER_ROLES) {
      const held = SEPARATED_FINANCE_PERMISSIONS.filter((permission) =>
        can(role, permission),
      );
      expect(held.length, role).toBeLessThanOrEqual(1);
    }
    for (const permission of SEPARATED_FINANCE_PERMISSIONS) {
      expect(USER_ROLES.filter((role) => can(role, permission))).toHaveLength(1);
    }
    expect(can("buyer", "order:approve")).toBe(true);
    expect(can("supplier", "order:acknowledge")).toBe(true);
    expect(can("supplier", "invoice:submit")).toBe(true);
    expect(can("receiving_officer", "receipt:record")).toBe(true);
    expect(can("payment_approver", "release:authorise")).toBe(true);
  });

  it("never lets the role that authorises a release claim or verify the repair", () => {
    for (const role of USER_ROLES) {
      if (!can(role, "release:authorise")) continue;
      expect(can(role, "repair:claim"), role).toBe(false);
      expect(can(role, "repair:verify"), role).toBe(false);
    }
    expect(can("payment_approver", "repair:claim")).toBe(false);
    expect(can("payment_approver", "repair:verify")).toBe(false);
  });

  it("opens the procurement trail to staff and never to reporters", () => {
    for (const role of USER_ROLES) {
      expect(can(role, "procurement:read"), role).toBe(role !== "reporter");
    }
  });

  it("gives each finance role its own chain role and keeps the registry codes", () => {
    expect(CHAIN_ROLE_CODE).toEqual({
      registrar: 1,
      school_admin: 2,
      reviewer: 3,
      buyer: 4,
      supplier: 5,
      receiver: 6,
      payment_approver: 7,
    });
    expect(CHAIN_ROLE_FOR_USER_ROLE.buyer).toBe("buyer");
    expect(CHAIN_ROLE_FOR_USER_ROLE.supplier).toBe("supplier");
    expect(CHAIN_ROLE_FOR_USER_ROLE.receiving_officer).toBe("receiver");
    expect(CHAIN_ROLE_FOR_USER_ROLE.payment_approver).toBe("payment_approver");
    const signing = Object.values(CHAIN_ROLE_FOR_USER_ROLE).filter(
      (role) => role !== null,
    );
    expect(new Set(signing).size).toBe(signing.length);
  });

  it("maps every case event to one ledger event and a consistent status", () => {
    expect(
      Object.values(CASE_EVENT_REGISTRY_EVENT)
        .filter((event) => event !== null)
        .sort(),
    ).toEqual([...LEDGER_EVENTS].sort());
    expect(CASE_EVENT_TYPES).toHaveLength(LEDGER_EVENTS.length + 1);
    expect(LEDGER_EVENTS).toEqual([...REGISTRY_EVENTS, ...FINANCE_EVENTS]);
    expect(
      FINANCE_CASE_EVENT_TYPES.map((type) => CASE_EVENT_REGISTRY_EVENT[type]),
    ).toEqual([...FINANCE_EVENTS]);
    for (const type of FINANCE_CASE_EVENT_TYPES) {
      // Finance steps never change the report status.
      expect(CASE_EVENT_RESULTING_STATUS[type]).toBeNull();
    }
    for (const event of LEDGER_EVENTS) {
      expect(BlockchainReceiptSchema.safeParse({ ...receipt, event }).success).toBe(true);
    }
    expect(CASE_EVENT_RESULTING_STATUS.report_registered).toBe("submitted");
    expect(CASE_EVENT_RESULTING_STATUS.interim_protection_recorded).toBeNull();
    expect(CASE_EVENT_RESULTING_STATUS.repair_verified).toBe("verified");
  });
});

describe("finance commitment documents", () => {
  const base = { workOrderId: id(20), reportId: id(1), createdAt: now, salt: digest };
  const line = { sku: "TOILET-01", description: "Toilet pan", quantity: 4 };
  const priced = { ...line, unitPriceCents: 125_000 };
  const documents = [
    {
      ...base,
      type: "work_order",
      institutionId: id(2),
      version: 1,
      description: "Replace four toilet pans",
      lines: [priced],
      totalCents: 500_000,
      currency: "ZAR",
    },
    {
      ...base,
      type: "supplier_invoice",
      invoiceId: id(21),
      invoiceNumber: "INV-001",
      orderVersion: 1,
      lines: [priced],
      totalCents: 500_000,
      currency: "ZAR",
    },
    {
      ...base,
      type: "goods_receipt",
      receiptId: id(22),
      orderVersion: 1,
      lines: [line],
      evidenceDigests: [digest],
    },
    {
      ...base,
      type: "match_result",
      matchId: id(23),
      workOrderCommitment: digest,
      invoiceCommitment: digest,
      receiptCommitments: [digest],
      outcome: "fail",
      reasons: [{ code: "quantity_mismatch", sku: "TOILET-01", expected: 4, actual: 5 }],
      engineVersion: "1",
    },
    {
      ...base,
      type: "release_decision",
      releaseId: id(24),
      matchCommitment: digest,
      reviewCommitment: digest,
      decision: "authorised",
    },
  ];

  it("accepts one document of each finance type", () => {
    expect(documents.map((document) => document.type)).toEqual([
      ...FINANCE_DOCUMENT_TYPES,
    ]);
    for (const document of documents) {
      expect(CommitmentDocumentSchema.safeParse(document).success, document.type).toBe(
        true,
      );
    }
  });

  it("refuses money that is not whole cents and a release that is not an authorisation", () => {
    expect(
      CommitmentDocumentSchema.safeParse({ ...documents[0], totalCents: 5000.5 }).success,
    ).toBe(false);
    expect(
      CommitmentDocumentSchema.safeParse({ ...documents[0], currency: "USD" }).success,
    ).toBe(false);
    expect(
      CommitmentDocumentSchema.safeParse({ ...documents[4], decision: "released" })
        .success,
    ).toBe(false);
  });
});

describe("commitments and identifiers", () => {
  it("matches the published SHA-256 vector for 'abc'", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("canonicalises regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: null, c: "x" }] })).toBe(
      '{"a":[{"c":"x","d":null}],"b":1}',
    );
  });

  it("maps ids to bytes32 and rejects non-UUIDs", () => {
    expect(idToBytes32("00000000-0000-4000-8000-00000000000A")).toBe(
      `0x${"0".repeat(32)}0000000000004000800000000000000a`,
    );
    expect(Hex32Schema.safeParse(idToBytes32(id(1))).success).toBe(true);
    expect(() => idToBytes32("report-1")).toThrow();
  });

  it("hides guessable documents behind the salt", async () => {
    const document: ReportDocument = {
      type: "report",
      reportId: id(1),
      institutionId: id(9),
      category: "sanitation",
      title: "Collapsed pit latrine",
      description: "The toilet block has collapsed.",
      createdAt: now,
      salt: newSalt(),
    };
    const commitment = await computeCommitment(document);
    expect(await computeCommitment({ ...document })).toBe(commitment);
    expect(await computeCommitment({ ...document, salt: newSalt() })).not.toBe(
      commitment,
    );
    expect(
      await computeCommitment({ ...document, title: "Collapsed pit latrines" }),
    ).not.toBe(commitment);
    expect(Hex32Schema.safeParse(document.salt).success).toBe(true);
  });
});
