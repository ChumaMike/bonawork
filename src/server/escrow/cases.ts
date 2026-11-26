/**
 * BonaWork escrows for cases: ties a report to its escrow on Solana devnet and
 * runs each step through the escrow adapter (src/server/solana). Sandbox demo
 * rand only: nothing here moves real money, and a release is a sandbox payout
 * instruction carried out by the program, never "paid".
 *
 * Who signs:
 *   - funding: the server-held DEMO funder key (`fundCaseWithDemoFunder`), or
 *     the funder's own wallet (`prepareWalletFunding` then
 *     `confirmWalletFundingAndActivate`, the seam for a Pollar wallet).
 *   - claim: the DEMO contractor key + the match key.
 *   - verify: the reviewer, through `ReviewerSigner` (today the demo key).
 *   - release / refund / sweep: the keeper key, when the program's rules allow it.
 *   - reviewer change: the platform admin key and the DEMO school key together.
 *
 * Each tranche releases to the payee fixed in the escrow at creation: Check 1
 * (materials) can go straight to a supplier, Check 2 (work done) goes to the
 * contractor.
 */
import { createHash, randomUUID } from "node:crypto";

import {
  address,
  getAddressDecoder,
  signature as toSignature,
  type Address,
} from "@solana/kit";
import { desc, eq, sql } from "drizzle-orm";

import type { LedgerPort } from "@/shared";

import {
  TrancheState,
  checkVerifyTransaction,
  findTranchePda,
  formatRand,
  toHex,
  type Bytes32,
  type Finding,
} from "@/solana";
import {
  EscrowStateError,
  GuardianRejectedError,
  MAX_SANDBOX_CASH_IN_CENTS,
  ensureDemoKeyFile,
  loadSigners,
  runEscrowWatchdog,
  type EscrowService,
  type OnChainCase,
  type SentStep,
  type TrancheIndex,
} from "@/server/solana";
import { solanaTxUrl, solanaAddressUrl } from "@/lib/solana-explorer";

import type {
  EscrowCaseRow,
  EscrowPayee,
  EscrowTxRecord,
} from "../../../database/schema";
import { schema, type Db } from "../db";
import { HttpError } from "../http";
import type { EvidenceStore } from "../evidence/store";
import { requireReport, type Actor } from "../reports/common";
import { submitVerification } from "../reports/review";
import { ReviewRecordSchema, type ReviewRecord } from "@/features/agent/contracts";
import { reviewHash as reviewRecordHash } from "@/features/agent/review-hash";
import {
  jsonRpcFundingRpc,
  verifyPollarFunding,
  type FundingRpc,
} from "../agent/pollar-funding";
import type { ReviewerSigner } from "./reviewer-signer";

export type EscrowDeps = {
  db: Db;
  service: EscrowService;
  /** Reads a funder's wallet transfer back from Solana. Defaults to JSON-RPC. */
  fundingRpc?: FundingRpc;
};

const sha = (text: string): Bytes32 =>
  Uint8Array.from(createHash("sha256").update(text).digest());
const nowIso = () => new Date().toISOString();
const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));

const DAY = 86_400;
/** The shortest challenge window the program accepts. */
export const MIN_CHALLENGE_SECONDS = 60;
export const MAX_CHALLENGE_SECONDS = 604_800;

/**
 * The two checks of every BonaWork escrow, one per payment stage. The
 * reviewer verifies each one; the materials stage is paid on verified
 * delivery of materials, never as an upfront advance.
 */
export const TRANCHE_CHECKS = [
  {
    label: "Check 1: Materials on site",
    detail:
      "Released on verified delivery of materials: the delivered items match the invoice.",
  },
  {
    label: "Check 2: Work done",
    detail: "Released when the reviewer confirms the work is installed and working.",
  },
] as const;

// ------------------------------------------------------------------ rows

export async function findEscrowCase(
  db: Db,
  reportId: string,
): Promise<EscrowCaseRow | null> {
  const [row] = await db
    .select()
    .from(schema.escrowCases)
    .where(eq(schema.escrowCases.reportId, reportId))
    .limit(1);
  return row ?? null;
}

async function requireEscrowCase(db: Db, reportIdOrReference: string) {
  const report = await requireReport(db, reportIdOrReference);
  const row = await findEscrowCase(db, report.id);
  if (!row) throw new HttpError("not_found", "This case has no escrow yet.");
  return { report, row };
}

async function recordTx(
  db: Db,
  rowId: string,
  step: EscrowTxRecord["step"],
  sent: { signature: string },
  index?: TrancheIndex,
): Promise<void> {
  const record: EscrowTxRecord = {
    step,
    ...(index === undefined ? {} : { index }),
    signature: sent.signature,
    at: nowIso(),
  };
  await db
    .update(schema.escrowCases)
    .set({
      transactions: sql`${schema.escrowCases.transactions} || ${JSON.stringify([record])}::jsonb`,
      updatedAt: nowIso(),
    })
    .where(eq(schema.escrowCases.id, rowId));
}

// --------------------------------------------------------------- demo keys

type DemoRole = "demoFunder" | "demoContractor" | "demoSupplier" | "demoSchool";
const DEMO_ROLE_LABEL: Record<DemoRole, string> = {
  demoFunder: "demo funder",
  demoContractor: "demo contractor",
  demoSupplier: "demo supplier",
  demoSchool: "demo school",
};

async function demoKey(role: DemoRole) {
  // Supplier and school keys are new; in local development create them on first use.
  if (role === "demoSupplier" || role === "demoSchool") ensureDemoKeyFile(role);
  const signers = await loadSigners([role]);
  const key = signers[role];
  if (!key) {
    throw new HttpError(
      "ledger_unavailable",
      `The ${DEMO_ROLE_LABEL[role]} key is not configured.`,
    );
  }
  return key;
}

async function optionalDemoKey(role: DemoRole) {
  try {
    return await demoKey(role);
  } catch {
    return null;
  }
}

/** The reviewer written into new escrows: a registered reviewer wallet, or the demo reviewer. */
export function escrowReviewerAddress(service: EscrowService): Address {
  const configured = process.env.BONAWORK_REVIEWER_ADDRESS?.trim();
  return configured ? address(configured) : service.network.demoReviewer;
}

/**
 * The school written into new escrows: the DEMO school key when configured (it
 * co-signs a reviewer change), otherwise a stand-in address derived from the
 * institution id that holds no key.
 */
async function schoolAddressFor(institutionId: string): Promise<Address> {
  const school = await optionalDemoKey("demoSchool");
  return (
    school?.address ?? getAddressDecoder().decode(sha(`bonawork:school:${institutionId}`))
  );
}

/** Who Check 1 (materials) releases to. Check 2 always releases to the contractor. */
export type MaterialsPayee =
  | { kind: "contractor" }
  | { kind: "demo_supplier" }
  | { kind: "supplier"; address: Address };

// ---------------------------------------------------------------- create

export type EscrowTerms = {
  /** Cents of sandbox demo rand: [materials, completion]. */
  amounts: [bigint, bigint];
  challengeSeconds: number;
};

export function checkTerms(terms: EscrowTerms): void {
  const [a, b] = terms.amounts;
  if (a <= BigInt(0) || b <= BigInt(0)) {
    throw new HttpError("invalid_input", "Both payment stages need an amount above R0.");
  }
  if (a + b > MAX_SANDBOX_CASH_IN_CENTS) {
    throw new HttpError("invalid_input", "The sandbox limit is R1 000 000 per escrow.");
  }
  if (
    !Number.isInteger(terms.challengeSeconds) ||
    terms.challengeSeconds < MIN_CHALLENGE_SECONDS ||
    terms.challengeSeconds > MAX_CHALLENGE_SECONDS
  ) {
    throw new HttpError(
      "invalid_input",
      "The challenge window must be between 1 minute and 7 days.",
    );
  }
}

/**
 * Creates the escrow for a case with the given funder wallet and stores the
 * link. Returns the existing row when the case already has one.
 */
export async function createCaseEscrow(
  deps: EscrowDeps,
  input: {
    reportIdOrReference: string;
    funder: Address;
    funderKind: "demo" | "wallet";
    terms: EscrowTerms;
    actorId: string | null;
    /** Defaults to the contractor. */
    materialsPayee?: MaterialsPayee;
  },
): Promise<EscrowCaseRow> {
  checkTerms(input.terms);
  const report = await requireReport(deps.db, input.reportIdOrReference);
  const existing = await findEscrowCase(deps.db, report.id);
  if (existing) return existing;

  const { service } = deps;
  const contractor = (await demoKey("demoContractor")).address;
  const reviewer = escrowReviewerAddress(service);
  const school = await schoolAddressFor(report.institutionId);
  const materialsPayee = input.materialsPayee ?? { kind: "contractor" };
  const supplier: EscrowPayee | null =
    materialsPayee.kind === "demo_supplier"
      ? { address: (await demoKey("demoSupplier")).address, role: "supplier", demo: true }
      : materialsPayee.kind === "supplier"
        ? { address: materialsPayee.address, role: "supplier", demo: false }
        : null;
  const contractorPayee: EscrowPayee = {
    address: contractor,
    role: "contractor",
    demo: true,
  };
  const payees: [EscrowPayee, EscrowPayee] = [
    supplier ?? contractorPayee,
    contractorPayee,
  ];
  const caseHash = sha(`bonawork:case:${report.id}:${report.commitment}`);
  const [materials, completion] = input.terms.amounts;
  const termsHash = sha(
    JSON.stringify({
      reportId: report.id,
      reference: report.reference,
      title: report.title,
      amounts: [materials.toString(), completion.toString()],
      challengeSeconds: input.terms.challengeSeconds,
      payees: payees.map((p) => p.address),
    }),
  );
  const start = nowSeconds();
  const created = await service.createEscrow({
    caseHash,
    termsHash,
    funder: input.funder,
    contractor,
    school,
    reviewer,
    amounts: [materials, completion],
    milestoneHashes: [
      sha(`milestone:${report.id}:materials on site`),
      sha(`milestone:${report.id}:work finished`),
    ],
    fundingDeadline: start + BigInt(DAY),
    verificationDeadlines: [start + BigInt(14 * DAY), start + BigInt(28 * DAY)],
    challengeSeconds: input.terms.challengeSeconds,
    disputeSeconds: 3 * DAY,
    payees: [address(payees[0].address), address(payees[1].address)],
  });

  const at = nowIso();
  const row: EscrowCaseRow = {
    id: randomUUID(),
    reportId: report.id,
    cluster: "devnet",
    escrowAddress: created.addresses.escrow,
    vaultAddress: created.addresses.vault,
    caseHash: toHex(caseHash),
    termsHash: toHex(termsHash),
    funderAddress: input.funder,
    funderKind: input.funderKind,
    contractorAddress: contractor,
    schoolAddress: school,
    reviewerAddress: reviewer,
    payees,
    layout: 2,
    trancheAmounts: [materials.toString(), completion.toString()],
    challengeSeconds: input.terms.challengeSeconds,
    transactions: created.signature
      ? [{ step: "create", signature: created.signature, at }]
      : [],
    watch: true,
    createdBy: input.actorId,
    createdAt: at,
    updatedAt: at,
  };
  await deps.db.insert(schema.escrowCases).values(row);
  return row;
}

// ----------------------------------------------------------------- funding

/**
 * "Fund this repair" in the sandbox: creates the escrow if needed, cashes in
 * sandbox demo rand to the demo funder, moves it into the vault and activates
 * the escrow. Each step is skipped when the chain shows it already happened,
 * so a retry after a failure carries on where it stopped.
 */
export async function fundCaseWithDemoFunder(
  deps: EscrowDeps,
  input: {
    reportIdOrReference: string;
    terms: EscrowTerms;
    actorId: string | null;
    materialsPayee?: MaterialsPayee;
  },
): Promise<EscrowCaseRow> {
  const funder = await demoKey("demoFunder");
  const row = await createCaseEscrow(deps, {
    ...input,
    funder: funder.address,
    funderKind: "demo",
  });
  if (row.funderKind !== "demo" || row.funderAddress !== funder.address) {
    throw new HttpError(
      "conflict",
      "This escrow is funded from the funder's own wallet.",
    );
  }
  const escrow = address(row.escrowAddress);
  const { service, db } = deps;
  const onChain = await service.getCaseOnChain(escrow);
  if (onChain.account.funded) return row;
  const total = onChain.account.totalAmount;
  if (onChain.vault.amount < total) {
    const balance = await service.walletBalance(funder.address);
    if (balance < total) {
      await recordTx(
        db,
        row.id,
        "cash_in",
        await service.sandboxCashIn(funder.address, total - balance),
      );
    }
    await recordTx(
      db,
      row.id,
      "fund",
      await service.fundEscrowAsDemoFunder(escrow, funder),
    );
  }
  await recordTx(db, row.id, "activate", await service.activateFunding(escrow));
  return (await findEscrowCase(db, row.reportId)) ?? row;
}

/**
 * Wallet funding, step 1 (for a funder's own wallet, e.g. Pollar): creates the
 * escrow with that wallet as funder and says where to send how much. The
 * wallet then sends a token transfer of `amount` demo rand (mint `mint`,
 * `decimals`) from its own token account to `vault`.
 */
export async function prepareWalletFunding(
  deps: EscrowDeps,
  input: {
    reportIdOrReference: string;
    funderWallet: Address;
    terms: EscrowTerms;
    actorId: string | null;
    materialsPayee?: MaterialsPayee;
  },
) {
  const row = await createCaseEscrow(deps, {
    reportIdOrReference: input.reportIdOrReference,
    funder: input.funderWallet,
    funderKind: "wallet",
    terms: input.terms,
    actorId: input.actorId,
    materialsPayee: input.materialsPayee,
  });
  if (row.funderAddress !== input.funderWallet) {
    throw new HttpError(
      "conflict",
      "This case already has an escrow with another funder.",
    );
  }
  const total = BigInt(row.trancheAmounts[0]) + BigInt(row.trancheAmounts[1]);
  return {
    escrow: row.escrowAddress,
    vault: row.vaultAddress,
    mint: deps.service.network.mint,
    decimals: deps.service.network.mintDecimals,
    amount: total.toString(),
    amountLabel: formatRand(total),
  };
}

/**
 * Wallet funding, step 2: call with the signature of the funder's transfer
 * into the vault. Checks that the transaction is confirmed without error and
 * that the vault now holds the full amount, records it, then activates the
 * escrow. Safe to call again.
 */
export async function confirmWalletFundingAndActivate(
  deps: EscrowDeps,
  input: { reportIdOrReference: string; transferSignature: string },
): Promise<EscrowCaseRow> {
  const { row } = await requireEscrowCase(deps.db, input.reportIdOrReference);
  if (row.funderKind !== "wallet") {
    throw new HttpError("conflict", "This escrow is funded by the demo funder key.");
  }
  const sig = toSignature(input.transferSignature);
  const escrow = address(row.escrowAddress);
  const onChain = await deps.service.getCaseOnChain(escrow);
  if (onChain.account.funded) return row;
  // Read the transfer back from Solana: exactly the escrow's total, in BDZAR,
  // from the funder's own wallet to this escrow's vault. Only then activate.
  const check = await verifyPollarFunding(deps.fundingRpc ?? jsonRpcFundingRpc(), {
    signature: sig,
    funderWallet: onChain.account.funder,
    escrow: row.escrowAddress,
    mint: onChain.account.mint,
    amount: onChain.account.totalAmount,
  });
  if (!check.ok) {
    throw new HttpError(
      check.reason === "network" ? "ledger_unavailable" : "conflict",
      check.message,
    );
  }
  if (!row.transactions.some((t) => t.signature === sig)) {
    await recordTx(deps.db, row.id, "fund", { signature: sig });
  }
  await recordTx(deps.db, row.id, "activate", await deps.service.activateFunding(escrow));
  return (await findEscrowCase(deps.db, row.reportId)) ?? row;
}

// ------------------------------------------------------------------- claim

async function latestMatchCommitment(db: Db, reportId: string): Promise<string | null> {
  const [hit] = await db
    .select({ commitment: schema.matchResults.commitment })
    .from(schema.matchResults)
    .innerJoin(schema.invoices, eq(schema.matchResults.invoiceId, schema.invoices.id))
    .where(eq(schema.invoices.reportId, reportId))
    .orderBy(desc(schema.matchResults.createdAt))
    .limit(1);
  return hit?.commitment ?? null;
}

/**
 * The contractor claims a payment stage. The evidence fingerprint covers the
 * case's evidence digests and the contractor's note; the match fingerprint is
 * the latest three-way match result, when there is one.
 */
export async function claimCaseTranche(
  deps: EscrowDeps,
  input: { reportIdOrReference: string; index: TrancheIndex; note: string },
): Promise<SentStep> {
  const { report, row } = await requireEscrowCase(deps.db, input.reportIdOrReference);
  const evidence = await deps.db
    .select({ digest: schema.evidenceCommitments.digest })
    .from(schema.evidenceCommitments)
    .where(eq(schema.evidenceCommitments.reportId, report.id));
  const evidenceHash = sha(
    JSON.stringify({
      reportId: report.id,
      index: input.index,
      digests: evidence.map((e) => e.digest).sort(),
      note: input.note,
    }),
  );
  const match = await latestMatchCommitment(deps.db, report.id);
  const matchHash = sha(
    `match:${report.id}:${input.index}:${match ?? "no three-way match recorded"}`,
  );
  const sent = await deps.service.claimTranche({
    escrow: address(row.escrowAddress),
    index: input.index,
    evidenceHash,
    matchHash,
    contractor: await demoKey("demoContractor"),
  });
  await recordTx(deps.db, row.id, "claim", sent, input.index);
  return sent;
}

// ------------------------------------------------------------------ verify

export type PreparedCaseVerify = {
  transaction: string;
  reviewHash: string;
  guardian: { ok: boolean; findings: Finding[] };
  description: string[];
  signer: { kind: ReviewerSigner["kind"]; label: string; address: string };
};

const STAGE_FOR_INDEX = ["materials", "completion"] as const;

/**
 * The review hash written into the escrow: SHA-256 of the canonical record of
 * the reviewer's finished checklist for this check. The checklist must be
 * complete (nothing left "not checked") and must have no failed check: a
 * failed check is a reason to dispute, not to verify.
 */
export async function reviewHashForCheck(
  report: { reference: string },
  index: TrancheIndex,
  review: ReviewRecord,
): Promise<Bytes32> {
  const parsed = ReviewRecordSchema.safeParse(review);
  if (!parsed.success) {
    throw new HttpError("invalid_input", "The review checklist is not complete.");
  }
  const record = parsed.data;
  if (record.stage !== STAGE_FOR_INDEX[index]) {
    throw new HttpError("invalid_input", "This checklist is for the other check.");
  }
  if (record.caseRef.trim() !== report.reference) {
    throw new HttpError("invalid_input", "This checklist is for another case.");
  }
  if (record.items.some((item) => item.result === "not_checked")) {
    throw new HttpError(
      "invalid_input",
      "Finish the checklist first: some checks are still marked not checked.",
    );
  }
  if (record.items.some((item) => item.result === "fail")) {
    throw new HttpError(
      "invalid_input",
      "A check failed, so this cannot be verified. Raise it with the school and the contractor.",
    );
  }
  return reviewRecordHash(review);
}

/** Builds the verify transaction and Bona Guardian's reading of it. Nothing is signed. */
export async function prepareCaseVerify(
  deps: EscrowDeps,
  input: {
    reportIdOrReference: string;
    index: TrancheIndex;
    /** The reviewer's finished checklist for this check (Reviewer Copilot). */
    review: ReviewRecord;
    signer: ReviewerSigner;
  },
): Promise<PreparedCaseVerify> {
  const { report, row } = await requireEscrowCase(deps.db, input.reportIdOrReference);
  if (row.reviewerAddress !== input.signer.address) {
    throw new HttpError(
      "forbidden",
      "The reviewer key on this server is not the reviewer named in this escrow.",
    );
  }
  const reviewHash = await reviewHashForCheck(report, input.index, input.review);
  const prepared = await deps.service.prepareVerifyTransaction({
    escrow: address(row.escrowAddress),
    index: input.index,
    reviewer: input.signer.address,
    reviewHash,
  });
  return {
    transaction: prepared.transaction,
    reviewHash: toHex(reviewHash),
    guardian: { ok: prepared.guardian.ok, findings: prepared.guardian.findings },
    description: prepared.description,
    signer: {
      kind: input.signer.kind,
      label: input.signer.label,
      address: input.signer.address,
    },
  };
}

/**
 * The reviewer signs the transaction they were shown. Bona Guardian checks it
 * against the chain as it is now before the reviewer key signs; the adapter
 * checks it again, adds the feepayer signature and sends it.
 */
export async function signAndSubmitCaseVerify(
  deps: EscrowDeps,
  input: {
    reportIdOrReference: string;
    index: TrancheIndex;
    transaction: string;
    /** The same finished checklist that `prepareCaseVerify` hashed. */
    review: ReviewRecord;
    signer: ReviewerSigner;
  },
): Promise<SentStep> {
  const { report, row } = await requireEscrowCase(deps.db, input.reportIdOrReference);
  const escrow = address(row.escrowAddress);
  // Recomputed here, never taken from the browser: Guardian binds it below.
  const reviewHash = await reviewHashForCheck(report, input.index, input.review);
  const onChain = await deps.service.getCaseOnChain(escrow);
  const tranche = onChain.tranches[input.index];
  if (tranche.account.state !== TrancheState.Claimed) {
    throw new EscrowStateError(
      "There is no claim waiting for review on this payment stage.",
    );
  }
  const guardian = await checkVerifyTransaction(input.transaction, {
    feePayer: deps.service.network.feepayer,
    reviewer: input.signer.address,
    escrow,
    tranche: await findTranchePda(escrow, input.index),
    revision: tranche.account.revision,
    evidenceHash: tranche.account.evidenceHash,
    matchHash: tranche.account.matchHash,
    reviewHash,
  });
  if (!guardian.ok) throw new GuardianRejectedError(guardian.findings);
  const signed = await input.signer.sign(input.transaction);
  const sent = await deps.service.submitSignedVerify({
    transaction: signed,
    escrow,
    index: input.index,
    reviewer: input.signer.address,
    reviewHash,
  });
  await recordTx(deps.db, row.id, "verify", sent, input.index);
  return sent;
}

// ------------------------------------------------------------ case status

export type CaseStatusSync =
  | { changed: true; status: "verified" }
  | { changed: false; status: string; reason: string };

/**
 * After the reviewer verified a check on chain, bring the case status along.
 * Only Check 2 (work done) moves a case, and only from `repair_claimed` to
 * `verified`, through the normal independent-review path (review record,
 * timeline event, ledger anchor). Check 1 and releases never change the case
 * status. A failure here does not undo the on-chain verification; it is
 * returned so the screen can say so.
 */
export async function syncCaseStatusAfterVerify(
  deps: { db: Db; ledger: LedgerPort; store: EvidenceStore },
  input: {
    reportIdOrReference: string;
    index: TrancheIndex;
    actor: Actor;
    sent: SentStep;
    review: ReviewRecord;
  },
): Promise<CaseStatusSync> {
  const report = await requireReport(deps.db, input.reportIdOrReference);
  if (input.index !== 1) {
    return {
      changed: false,
      status: report.status,
      reason: "Check 1 does not change the case status.",
    };
  }
  if (report.status !== "repair_claimed") {
    return {
      changed: false,
      status: report.status,
      reason:
        "The case has no repair claim from the school, so its status stays as it is.",
    };
  }
  const passed = input.review.items.length;
  try {
    await submitVerification(deps, {
      reportIdOrReference: report.id,
      actor: input.actor,
      outcome: "verified",
      note:
        `Check 2: Work done verified on Solana devnet (${passed} checks passed). ` +
        `Transaction ${input.sent.signature}.`,
      uploads: [],
      anchorMode: "defer",
    });
    return { changed: true, status: "verified" };
  } catch (error) {
    return {
      changed: false,
      status: report.status,
      reason:
        error instanceof Error ? error.message : "The case status could not be updated.",
    };
  }
}

// ------------------------------------------------------ release and refund

/** Anyone may ask; the keeper signs and the program decides. */
export async function releaseCaseTranche(
  deps: EscrowDeps,
  input: { reportIdOrReference: string; index: TrancheIndex },
): Promise<SentStep> {
  const { row } = await requireEscrowCase(deps.db, input.reportIdOrReference);
  const sent = await deps.service.releaseTranche(address(row.escrowAddress), input.index);
  await recordTx(deps.db, row.id, "release", sent, input.index);
  return sent;
}

export async function refundCaseTranche(
  deps: EscrowDeps,
  input: { reportIdOrReference: string; index: TrancheIndex },
): Promise<SentStep> {
  const { row } = await requireEscrowCase(deps.db, input.reportIdOrReference);
  const sent = await deps.service.refundExpired(address(row.escrowAddress), input.index);
  await recordTx(deps.db, row.id, "refund", sent, input.index);
  return sent;
}

/**
 * Returns sandbox rand in the vault beyond what the open checks are owed (for
 * example an over-payment) to the funder. Anyone may ask; the keeper signs.
 * Null when there is nothing to return.
 */
export async function sweepCaseSurplus(
  deps: EscrowDeps,
  input: { reportIdOrReference: string },
): Promise<SentStep | null> {
  const { row } = await requireEscrowCase(deps.db, input.reportIdOrReference);
  const sent = await deps.service.sweepSurplus(address(row.escrowAddress));
  if (sent) await recordTx(deps.db, row.id, "sweep", sent);
  return sent;
}

/**
 * Replaces the escrow's reviewer. The program needs the platform admin and the
 * escrow's school to sign together; here the school is the DEMO school key.
 * Blocked on chain while a check is verified or disputed.
 */
export async function reassignCaseReviewer(
  deps: EscrowDeps,
  input: { reportIdOrReference: string; newReviewer: Address },
): Promise<SentStep> {
  const { row } = await requireEscrowCase(deps.db, input.reportIdOrReference);
  const school = await demoKey("demoSchool");
  if (row.schoolAddress !== school.address) {
    throw new HttpError(
      "conflict",
      "This escrow's school holds no demo key, so its reviewer cannot be changed here.",
    );
  }
  const sent = await deps.service.reassignReviewer({
    escrow: address(row.escrowAddress),
    newReviewer: input.newReviewer,
    school,
  });
  await recordTx(deps.db, row.id, "reassign_reviewer", sent);
  await deps.db
    .update(schema.escrowCases)
    .set({ reviewerAddress: input.newReviewer, updatedAt: nowIso() })
    .where(eq(schema.escrowCases.id, row.id));
  return sent;
}

// ---------------------------------------------------------------- watchdog

/** Runs the Escrow Watchdog over every escrow still being watched. */
export async function runCaseWatchdog(deps: EscrowDeps) {
  // Layout-1 escrows predate per-tranche payees and cannot be decoded: skip them.
  const rows = (
    await deps.db
      .select()
      .from(schema.escrowCases)
      .where(eq(schema.escrowCases.watch, true))
  ).filter((r) => r.layout >= 2);
  const byEscrow = new Map(rows.map((r) => [r.escrowAddress, r]));
  const outcomes = await runEscrowWatchdog(
    deps.service,
    rows.map((r) => address(r.escrowAddress)),
  );
  for (const o of outcomes) {
    const row = byEscrow.get(o.escrow);
    if (row && o.step) {
      await recordTx(
        deps.db,
        row.id,
        o.decision.action === "release" ? "release" : "refund",
        o.step,
        o.index,
      );
    }
  }
  // Stop watching escrows whose two stages are settled (or that were cancelled).
  for (const row of rows) {
    const mine = outcomes.filter((o) => o.escrow === row.escrowAddress);
    const done = mine.every(
      (o) =>
        o.status === "sent" ||
        o.decision.reason === "Already settled." ||
        o.decision.reason === "The escrow was cancelled.",
    );
    if (mine.length === 2 && done) {
      await deps.db
        .update(schema.escrowCases)
        .set({ watch: false, updatedAt: nowIso() })
        .where(eq(schema.escrowCases.id, row.id));
    }
  }
  return {
    scanned: rows.length,
    outcomes: outcomes.map((o) => ({
      escrow: o.escrow,
      index: o.index,
      action: o.decision.action,
      reason: o.decision.reason,
      status: o.status,
      attempts: o.attempts,
      signature: o.step?.signature ?? null,
      explorerUrl: o.step?.explorerUrl ?? null,
      error: o.error ?? null,
    })),
  };
}

// ------------------------------------------------------------- public view

export type PublicEscrowTranche = {
  index: TrancheIndex;
  label: (typeof TRANCHE_CHECKS)[number]["label"];
  detail: string;
  /** Who a release goes to, read from the escrow on chain (fixed at creation). */
  payee: { address: string; role: "supplier" | "contractor"; demo: boolean };
  amount: string;
  amountLabel: string;
  state: keyof typeof TrancheState;
  claimedAt: string;
  verifiedAt: string;
  challengeUntil: string;
  verificationDeadline: string;
  settledAt: string;
};

/** Public: addresses, amounts, states and signatures. No names, notes or keys. */
export type PublicEscrow = {
  cluster: "devnet";
  sandbox: true;
  currency: string;
  programId: string;
  escrow: { address: string; url: string };
  vault: { address: string; url: string; amount: string | null; label: string | null };
  funder: { address: string; kind: "demo" | "wallet" };
  contractor: { address: string; demo: boolean };
  reviewer: { address: string; demo: boolean };
  total: string;
  totalLabel: string;
  challengeSeconds: number;
  /** Vault tokens beyond what the open checks are owed, in cents; null when unknown. */
  surplus: string | null;
  surplusLabel: string | null;
  /** True for an escrow made before per-tranche payees; this client cannot read it. */
  legacy: boolean;
  funded: boolean | null;
  cancelled: boolean | null;
  tranches: PublicEscrowTranche[] | null;
  transactions: Array<EscrowTxRecord & { url: string }>;
  /** Server clock (unix seconds) when this was read; the chain decides, this is for countdowns. */
  readAt: string;
  /** Set when the chain could not be read; the stored link is still shown. */
  chainError: string | null;
};

export function publicEscrowView(
  row: EscrowCaseRow,
  service: EscrowService,
  onChain: OnChainCase | null,
  chainError: string | null = null,
): PublicEscrow {
  const total = BigInt(row.trancheAmounts[0]) + BigInt(row.trancheAmounts[1]);
  const demoReviewer = service.network.demoReviewer;
  let surplus: bigint | null = null;
  if (onChain) {
    const a = onChain.account;
    const owed = a.cancelled
      ? BigInt(0)
      : a.totalAmount - a.releasedAmount - a.refundedAmount;
    const extra = onChain.vault.amount - owed;
    surplus = extra > BigInt(0) ? extra : BigInt(0);
  }
  const payeeView = (payee: string, index: TrancheIndex) => {
    const stored = row.payees[index];
    const role: "supplier" | "contractor" =
      payee === onChain?.account.contractor ? "contractor" : "supplier";
    return {
      address: payee,
      role,
      demo: stored ? stored.address === payee && stored.demo : false,
    };
  };
  return {
    cluster: "devnet",
    sandbox: true,
    currency: "Sandbox demo rand (no real money)",
    programId: service.network.programId,
    escrow: { address: row.escrowAddress, url: solanaAddressUrl(row.escrowAddress) },
    vault: {
      address: row.vaultAddress,
      url: solanaAddressUrl(row.vaultAddress),
      amount: onChain ? onChain.vault.amount.toString() : null,
      label: onChain ? onChain.vault.label : null,
    },
    funder: { address: row.funderAddress, kind: row.funderKind },
    contractor: { address: row.contractorAddress, demo: true },
    reviewer: {
      address: row.reviewerAddress,
      demo: row.reviewerAddress === demoReviewer,
    },
    total: total.toString(),
    totalLabel: formatRand(total),
    challengeSeconds: row.challengeSeconds,
    surplus: surplus === null ? null : surplus.toString(),
    surplusLabel: surplus === null ? null : formatRand(surplus),
    legacy: row.layout < 2,
    funded: onChain ? onChain.account.funded : null,
    cancelled: onChain ? onChain.account.cancelled : null,
    tranches: onChain
      ? onChain.tranches.map((t) => ({
          index: t.index,
          label: TRANCHE_CHECKS[t.index].label,
          detail: TRANCHE_CHECKS[t.index].detail,
          payee: payeeView(onChain.account.payees[t.index], t.index),
          amount: t.account.amount.toString(),
          amountLabel: formatRand(t.account.amount),
          state: t.state,
          claimedAt: t.account.claimedAt.toString(),
          verifiedAt: t.account.verifiedAt.toString(),
          challengeUntil: t.account.challengeUntil.toString(),
          verificationDeadline: t.account.verificationDeadline.toString(),
          settledAt: t.account.settledAt.toString(),
        }))
      : null,
    transactions: row.transactions.map((t) => ({ ...t, url: solanaTxUrl(t.signature) })),
    readAt: nowSeconds().toString(),
    chainError,
  };
}

/** The public escrow of a case, read from the chain; null when the case has none. */
export async function loadPublicEscrow(
  deps: EscrowDeps,
  reportIdOrReference: string,
): Promise<PublicEscrow | null> {
  const report = await requireReport(deps.db, reportIdOrReference);
  const row = await findEscrowCase(deps.db, report.id);
  if (!row) return null;
  if (row.layout < 2) {
    return publicEscrowView(
      row,
      deps.service,
      null,
      "This escrow was made with an earlier version of the program and can no longer be read here. Its transactions are listed below.",
    );
  }
  try {
    const onChain = await deps.service.getCaseOnChain(address(row.escrowAddress));
    return publicEscrowView(row, deps.service, onChain);
  } catch (error) {
    const message =
      error instanceof EscrowStateError
        ? error.message
        : "Solana devnet could not be reached. Try again in a moment.";
    return publicEscrowView(row, deps.service, null, message);
  }
}
