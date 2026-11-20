import { decodeEventLog, isAddress } from "viem";
import { z } from "zod";
import { bonaRegistryAbi } from "../abi/bona-registry";
import {
  computeCommitment,
  documentProblems,
  idToBytes32,
  isRecord,
  isUuid,
  normaliseHex32,
  sha256Hex,
  type DocumentType,
  type Hex32,
} from "./canonical";
import { explorerTxUrl } from "./config";

/* --------------------------------- Inputs ---------------------------------- */

export const REGISTRY_EVENTS = [
  "ReportRegistered",
  "EvidenceRegistered",
  "ReportAcknowledged",
  "InterimProtectionRecorded",
  "RepairClaimed",
  "RepairVerified",
  "RepairDisputed",
] as const;
export type RegistryEvent = (typeof REGISTRY_EVENTS)[number];

/**
 * The receipt BonaBlock hands out (`BlockchainReceipt` in the app). Re-declared
 * here on purpose; the verifier does not import the app's schema.
 */
export const ReceiptSchema = z.object({
  chainId: z.string().min(1),
  contractAddress: z.string().min(1),
  txId: z.string().min(1),
  status: z.enum(["pending", "confirmed", "failed"]).optional(),
  blockNumber: z.number().int().nonnegative().nullish(),
  blockTimestamp: z.string().nullish(),
  event: z.enum(REGISTRY_EVENTS),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

/** What the holder supplies alongside the receipt. */
export type Source =
  /** The exact evidence file bytes (EvidenceRegistered). Hashed, never kept. */
  | { kind: "bytes"; bytes: Uint8Array }
  /** A salted commitment document, parsed (ReportRegistered, InterimProtectionRecorded, RepairClaimed, RepairVerified, RepairDisputed). */
  | { kind: "document"; document: unknown }
  /** A value computed elsewhere, e.g. in the browser so the content never leaves the device. */
  | { kind: "digest"; digest: string }
  /** Nothing to recompute (ReportAcknowledged): only the event's existence is checked. */
  | { kind: "none" };

export interface VerifyRequest {
  /** Parsed receipt JSON (any shape; validated here). */
  receipt: unknown;
  source: Source;
  /** Report UUID to compare with the event's on-chain `reportId`. Taken from the document when one is supplied. */
  reportId?: string;
}

/** The one dependency: a way to read the chain. Injected so tests never touch a network. */
export interface ChainReader {
  getChainId(): Promise<number>;
  getTransactionReceipt(hash: `0x${string}`): Promise<TxReceiptLike | null>;
}

export interface TxReceiptLike {
  status: "success" | "reverted";
  to: string | null;
  blockNumber: bigint;
  logs: readonly {
    address: string;
    data: `0x${string}`;
    topics: readonly `0x${string}`[];
  }[];
}

export interface VerifyContext {
  chain: ChainReader;
  expectedChainId: number;
  expectedContractAddress?: string;
}

/* --------------------------------- Outputs --------------------------------- */

export type Overall =
  "VERIFIED" | "MISMATCH" | "NOT_FOUND" | "REJECTED" | "CANNOT_VERIFY";

export type StepStatus = "pass" | "fail" | "skip";

export type StepId =
  "receipt" | "chain" | "contract" | "network" | "transaction" | "event" | "reportId";

export interface Step {
  id: StepId;
  title: string;
  status: StepStatus;
  /** Plain-language explanation of what was checked and what was found. */
  detail: string;
}

export interface Facts {
  chainId?: number;
  contractAddress?: string;
  txHash?: string;
  explorerUrl?: string;
  /** Digest or commitment recomputed from what the holder supplied. */
  recomputedDigest?: Hex32;
  /** The value the ledger actually holds in the named event (when it differs). */
  onChainValue?: Hex32;
  blockNumber?: number;
  eventName?: string;
  /** From the event's own `timestamp` field (block time), ISO-8601. */
  eventTimestamp?: string;
  /** `reportId` bytes32 as recorded in the matching event. */
  reportIdOnChain?: Hex32;
  /** `idToBytes32` of the report UUID that was supplied or found in the document. */
  reportIdExpected?: Hex32;
}

export interface VerifyResult {
  overall: Overall;
  summary: string;
  steps: Step[];
  facts: Facts;
  /** Which network/contract this verifier was configured to trust. */
  verifier: { chainId: number; expectedContractAddress: string | null };
}

export const OVERALL_LABEL: Record<Overall, string> = {
  VERIFIED: "Verified",
  MISMATCH: "Mismatch — the content does not match the ledger",
  NOT_FOUND: "Not found on the ledger",
  REJECTED: "Rejected — the receipt or input cannot be checked by this verifier",
  CANNOT_VERIFY: "Cannot verify right now",
};

/* ---------------------------- Event ↔ content rules --------------------------- */

/** For each receipt event: the field holding the anchored value and the document type that produces it. */
export const EVENT_RULE: Record<
  RegistryEvent,
  {
    field: "digest" | "commitment" | "reviewCommitment" | null;
    document: DocumentType | null;
  }
> = {
  EvidenceRegistered: { field: "digest", document: null },
  ReportRegistered: { field: "commitment", document: "report" },
  InterimProtectionRecorded: { field: "commitment", document: "interim_protection" },
  RepairClaimed: { field: "commitment", document: "repair_claim" },
  RepairVerified: { field: "reviewCommitment", document: "review" },
  RepairDisputed: { field: "reviewCommitment", document: "review" },
  ReportAcknowledged: { field: null, document: null },
};

interface Candidate {
  value?: Hex32;
  reportId?: Hex32;
  timestamp?: bigint;
}

function decodeCandidates(
  logs: TxReceiptLike["logs"],
  contract: string,
  eventName: RegistryEvent,
): { candidates: Candidate[]; fromContract: number; otherEvents: string[] } {
  const fromContract = logs.filter((l) => l.address.toLowerCase() === contract);
  const field = EVENT_RULE[eventName].field;
  const candidates: Candidate[] = [];
  const otherEvents: string[] = [];
  for (const log of fromContract) {
    let decoded: { eventName: string; args: unknown };
    try {
      decoded = decodeEventLog({
        abi: bonaRegistryAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        strict: false,
      });
    } catch {
      continue; // not a BonaRegistry event
    }
    if (decoded.eventName !== eventName) {
      otherEvents.push(decoded.eventName);
      continue;
    }
    const args = (decoded.args ?? {}) as Record<string, unknown>;
    const raw = field ? args[field] : undefined;
    const reportId =
      typeof args.reportId === "string" ? normaliseHex32(args.reportId) : null;
    candidates.push({
      value: typeof raw === "string" ? (normaliseHex32(raw) ?? undefined) : undefined,
      reportId: reportId ?? undefined,
      timestamp: typeof args.timestamp === "bigint" ? args.timestamp : undefined,
    });
  }
  return { candidates, fromContract: fromContract.length, otherEvents };
}

/* ---------------------------------- Engine ---------------------------------- */

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * Run every check and report each one. The function never throws for a bad
 * input or an unreachable network; those become steps and an honest overall
 * result. Only programming errors propagate.
 */
export async function verify(
  req: VerifyRequest,
  ctx: VerifyContext,
): Promise<VerifyResult> {
  const steps: Step[] = [];
  const facts: Facts = {};
  const expectedContract = ctx.expectedContractAddress?.toLowerCase() ?? null;
  const verifier = {
    chainId: ctx.expectedChainId,
    expectedContractAddress: expectedContract,
  };
  const push = (id: StepId, status: StepStatus, detail: string) =>
    steps.push({ id, title: STEP_TITLE[id], status, detail });
  const finish = (overall: Overall, summary: string): VerifyResult => {
    for (const id of STEP_ORDER) {
      if (!steps.some((s) => s.id === id)) push(id, "skip", "Not reached.");
    }
    steps.sort((a, b) => STEP_ORDER.indexOf(a.id) - STEP_ORDER.indexOf(b.id));
    return { overall, summary, steps, facts, verifier };
  };

  /* 1. Receipt shape */
  const parsed = ReceiptSchema.safeParse(req.receipt);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    push(
      "receipt",
      "fail",
      `The receipt is not in BonaBlock's receipt format. ${problems}.`,
    );
    return finish("REJECTED", "The receipt could not be read, so nothing was checked.");
  }
  const receipt = parsed.data;
  const contract = receipt.contractAddress.trim().toLowerCase();
  facts.contractAddress = contract;
  facts.txHash = receipt.txId.trim().toLowerCase();
  facts.eventName = receipt.event;

  const shapeProblems: string[] = [];
  if (!isAddress(contract, { strict: false }))
    shapeProblems.push("`contractAddress` is not an EVM address");
  if (!TX_HASH.test(facts.txHash)) shapeProblems.push("`txId` is not a transaction hash");
  if (shapeProblems.length > 0) {
    push(
      "receipt",
      "fail",
      `The receipt has the right fields but some values are malformed: ${shapeProblems.join("; ")}.`,
    );
    return finish(
      "REJECTED",
      "The receipt is malformed, so nothing was checked on the ledger.",
    );
  }

  /* 2. Recompute the anchored value from what the holder supplied. */
  const recomputed = await recompute(receipt.event, req.source);
  if (!recomputed.ok) {
    push("receipt", "fail", recomputed.error);
    return finish("REJECTED", "The supplied content does not fit this receipt.");
  }
  if (recomputed.value) facts.recomputedDigest = recomputed.value;
  push(
    "receipt",
    "pass",
    `Receipt for a ${receipt.event} write read successfully. ${recomputed.note}`,
  );

  /* Report id: explicit, or from the document. */
  let reportUuid = req.reportId?.trim() || undefined;
  if (req.source.kind === "document" && isRecord(req.source.document)) {
    const fromDoc = req.source.document.reportId;
    if (typeof fromDoc === "string") reportUuid = fromDoc;
  }
  if (reportUuid && !isUuid(reportUuid)) {
    push(
      "receipt",
      "fail",
      `"${reportUuid}" is not a UUID, so it cannot be compared with the on-chain reportId.`,
    );
    steps.splice(
      steps.findIndex((s) => s.id === "receipt" && s.status === "pass"),
      1,
    );
    return finish("REJECTED", "The report id is not a UUID.");
  }
  if (reportUuid) facts.reportIdExpected = idToBytes32(reportUuid);

  /* 3. Chain id */
  const expectedCaip = `eip155:${ctx.expectedChainId}`;
  facts.chainId = ctx.expectedChainId;
  if (receipt.chainId.trim() !== expectedCaip) {
    push(
      "chain",
      "fail",
      `The receipt names chain "${receipt.chainId}", but this verifier reads ${expectedCaip}${ctx.expectedChainId === 43113 ? " (Avalanche Fuji)" : ""}. A receipt for another network cannot be checked here.`,
    );
    return finish(
      "REJECTED",
      `This receipt is for a different network (${receipt.chainId}).`,
    );
  }
  push(
    "chain",
    "pass",
    `Receipt names ${expectedCaip}, the network this verifier reads.`,
  );
  facts.explorerUrl = explorerTxUrl(ctx.expectedChainId, facts.txHash);

  /* 4. Contract address */
  if (expectedContract && contract !== expectedContract) {
    push(
      "contract",
      "fail",
      `The receipt names contract ${contract}, but this verifier only trusts the BonaRegistry at ${expectedContract}. Anyone can deploy a contract that emits look-alike events, so a different address is rejected.`,
    );
    return finish(
      "REJECTED",
      "The receipt names a contract this verifier does not trust.",
    );
  }
  push(
    "contract",
    "pass",
    expectedContract
      ? `Receipt names ${contract}, the expected BonaRegistry address.`
      : `Receipt names ${contract}. No expected address is configured (VERIFY_CONTRACT_ADDRESS), so the receipt's own address is used. Set it to accept receipts from the BonaRegistry contract only.`,
  );

  /* 5. The RPC really is the expected network. */
  try {
    const rpcChain = await ctx.chain.getChainId();
    if (rpcChain !== ctx.expectedChainId) {
      push(
        "network",
        "fail",
        `The configured RPC reports chain id ${rpcChain}, not ${ctx.expectedChainId}. The verifier is misconfigured; fix VERIFY_RPC_URL / VERIFY_CHAIN_ID.`,
      );
      return finish("CANNOT_VERIFY", "The RPC endpoint is not on the expected network.");
    }
    push(
      "network",
      "pass",
      `Connected to an Avalanche node reporting chain id ${rpcChain}.`,
    );
  } catch (error) {
    push(
      "network",
      "fail",
      `Could not reach the Avalanche RPC: ${errorMessage(error)}. No claim is made either way.`,
    );
    return finish(
      "CANNOT_VERIFY",
      "The Avalanche network could not be reached. Try again later.",
    );
  }

  /* 6. Transaction */
  let tx: TxReceiptLike | null;
  try {
    tx = await ctx.chain.getTransactionReceipt(facts.txHash as `0x${string}`);
  } catch (error) {
    push(
      "transaction",
      "fail",
      `Could not fetch the transaction from the Avalanche RPC: ${errorMessage(error)}. No claim is made either way.`,
    );
    return finish(
      "CANNOT_VERIFY",
      "The Avalanche network could not be reached. Try again later.",
    );
  }
  if (!tx) {
    push(
      "transaction",
      "fail",
      `No transaction with hash ${facts.txHash} exists on this network (or it is not yet mined).`,
    );
    return finish(
      "NOT_FOUND",
      "The transaction in the receipt does not exist on the ledger.",
    );
  }
  facts.blockNumber = Number(tx.blockNumber);
  if (tx.status !== "success") {
    push(
      "transaction",
      "fail",
      `Transaction ${facts.txHash} exists in block ${facts.blockNumber} but it reverted, so nothing was recorded.`,
    );
    return finish(
      "NOT_FOUND",
      "The transaction failed on the ledger; nothing was recorded.",
    );
  }
  const txTo = tx.to?.toLowerCase() ?? null;
  if (txTo !== contract) {
    push(
      "transaction",
      "fail",
      `Transaction ${facts.txHash} succeeded in block ${facts.blockNumber}, but it was sent to ${txTo ?? "no contract (contract creation)"} rather than ${contract}.`,
    );
    return finish(
      "REJECTED",
      "The transaction was not sent to the contract named in the receipt.",
    );
  }
  push(
    "transaction",
    "pass",
    `Transaction ${facts.txHash} succeeded in block ${facts.blockNumber} and was sent to ${contract}.`,
  );

  /* 7. The named event, carrying the recomputed value */
  const { candidates, fromContract, otherEvents } = decodeCandidates(
    tx.logs,
    contract,
    receipt.event,
  );
  const what = recomputed.value ? describeValue(receipt.event) : null;
  let match: Candidate | undefined;
  if (recomputed.value) {
    match = candidates.find((c) => c.value === recomputed.value);
  } else {
    // ReportAcknowledged: nothing to recompute; prefer the event for the given report.
    match = facts.reportIdExpected
      ? candidates.find((c) => c.reportId === facts.reportIdExpected)
      : candidates[0];
  }

  if (candidates.length === 0) {
    const seen =
      otherEvents.length > 0
        ? `It emitted ${otherEvents.join(", ")} instead.`
        : fromContract > 0
          ? `It emitted ${fromContract} log(s) from the contract, none of them decodable as BonaRegistry events.`
          : "It emitted no logs from the contract.";
    push("event", "fail", `This transaction emitted no ${receipt.event} event. ${seen}`);
    return finish(
      "NOT_FOUND",
      `The transaction does not contain the ${receipt.event} write the receipt describes.`,
    );
  }

  if (!match) {
    if (recomputed.value) {
      const held = candidates.map((c) => c.value ?? "(none)");
      facts.onChainValue = candidates[0]?.value;
      push(
        "event",
        "fail",
        `The ${receipt.event} event in this transaction holds ${held.join(", ")}, but your ${what} is ${recomputed.value}. The content you hold is not what was anchored: it was altered, or it is a different ${req.source.kind === "bytes" ? "file" : "document"}.`,
      );
      return finish(
        "MISMATCH",
        "The ledger does not vouch for this content: its fingerprint differs from the anchored one.",
      );
    }
    const held = candidates.map((c) => c.reportId ?? "(none)");
    push(
      "event",
      "fail",
      `This transaction's ${receipt.event} event is for report ${held.join(", ")}, not ${facts.reportIdExpected}.`,
    );
    return finish(
      "MISMATCH",
      "The acknowledgement in this transaction is for a different report.",
    );
  }

  facts.reportIdOnChain = match.reportId;
  if (match.timestamp !== undefined) {
    facts.eventTimestamp = new Date(Number(match.timestamp) * 1000).toISOString();
  }
  push(
    "event",
    "pass",
    recomputed.value
      ? `A ${receipt.event} event in this transaction records exactly your ${what}: ${recomputed.value}.`
      : `A ${receipt.event} event is present in this transaction${match.reportId ? ` for report ${match.reportId}` : ""}.`,
  );

  /* 8. Report id */
  if (facts.reportIdExpected) {
    if (match.reportId === facts.reportIdExpected) {
      push(
        "reportId",
        "pass",
        `The event's reportId ${match.reportId} is idToBytes32(${reportUuid}).`,
      );
    } else {
      push(
        "reportId",
        "fail",
        `The event belongs to report ${match.reportId ?? "(unknown)"}, not to ${reportUuid} (${facts.reportIdExpected}). The content is anchored, but under a different report.`,
      );
      return finish("MISMATCH", "The anchored content belongs to a different report.");
    }
  } else {
    push(
      "reportId",
      "skip",
      match.reportId
        ? `The event belongs to report ${match.reportId}. Supply the report UUID to check it.`
        : "The event carries no reportId.",
    );
  }

  return finish(
    "VERIFIED",
    recomputed.value
      ? `The Avalanche ledger confirms that this exact ${req.source.kind === "bytes" ? "file" : "document"} was anchored in transaction ${facts.txHash}.`
      : `The Avalanche ledger confirms the ${receipt.event} write in transaction ${facts.txHash}.`,
  );
}

/* --------------------------------- Helpers --------------------------------- */

export const STEP_ORDER: StepId[] = [
  "receipt",
  "chain",
  "contract",
  "network",
  "transaction",
  "event",
  "reportId",
];

export const STEP_TITLE: Record<StepId, string> = {
  receipt: "Receipt read and content fingerprinted",
  chain: "Chain id matches",
  contract: "Contract address matches",
  network: "Avalanche node reachable on the expected network",
  transaction: "Transaction exists, succeeded, and targets the contract",
  event: "Ledger event carries the recomputed fingerprint",
  reportId: "Report id matches",
};

type Recompute =
  { ok: true; value: Hex32 | null; note: string } | { ok: false; error: string };

async function recompute(event: RegistryEvent, source: Source): Promise<Recompute> {
  const rule = EVENT_RULE[event];

  if (source.kind === "digest") {
    if (!rule.field) {
      return {
        ok: false,
        error: `A ${event} receipt has nothing to recompute; supply only the report id.`,
      };
    }
    const value = normaliseHex32(source.digest);
    return value
      ? { ok: true, value, note: "Using a fingerprint computed by the caller." }
      : { ok: false, error: "The supplied digest is not a 32-byte hex value." };
  }

  if (rule.field === null) {
    if (source.kind !== "none") {
      return {
        ok: false,
        error: `A ${event} receipt has nothing to recompute. Supply only the report id; the ledger is checked for that acknowledgement.`,
      };
    }
    return {
      ok: true,
      value: null,
      note: "Nothing to hash: only the event's presence is checked.",
    };
  }

  if (rule.field === "digest") {
    if (source.kind !== "bytes") {
      return {
        ok: false,
        error:
          "This receipt is for an evidence file (EvidenceRegistered). Supply the file itself.",
      };
    }
    return {
      ok: true,
      value: await sha256Hex(source.bytes),
      note: `SHA-256 recomputed locally from ${source.bytes.byteLength} byte(s) of file content.`,
    };
  }

  if (source.kind !== "document") {
    return {
      ok: false,
      error: `This receipt is for a ${event} write. Supply the ${rule.document} commitment document (JSON, including its salt).`,
    };
  }
  const problem = documentProblems(source.document);
  if (problem) return { ok: false, error: problem };
  const doc = source.document as Record<string, unknown>;
  if (doc.type !== rule.document) {
    return {
      ok: false,
      error: `A ${event} receipt needs a "${rule.document}" document, but this document is of type "${String(doc.type)}".`,
    };
  }
  if (event === "RepairVerified" && doc.outcome !== "verified") {
    return {
      ok: false,
      error: `A RepairVerified receipt needs a review with outcome "verified", not "${String(doc.outcome)}".`,
    };
  }
  if (event === "RepairDisputed" && doc.outcome !== "disputed") {
    return {
      ok: false,
      error: `A RepairDisputed receipt needs a review with outcome "disputed", not "${String(doc.outcome)}".`,
    };
  }
  return {
    ok: true,
    value: await computeCommitment(doc),
    note: `Commitment recomputed locally from the canonical JSON of the ${rule.document} document.`,
  };
}

function describeValue(event: RegistryEvent): string {
  return EVENT_RULE[event].field === "digest"
    ? "file's SHA-256"
    : "document's commitment";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const first = error.message.split("\n")[0]?.trim();
    return first || error.name;
  }
  return String(error);
}
