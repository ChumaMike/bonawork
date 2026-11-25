"use client";

/**
 * Browser calls to the escrow API (`/api/issues/:id/escrow/...`). Amounts are
 * cents of sandbox demo rand and times are unix seconds, both as strings.
 */

export type TrancheStateName =
  "Pending" | "Claimed" | "Verified" | "Disputed" | "Released" | "Refunded";

export type EscrowTranche = {
  index: 0 | 1;
  /** "Check 1: Materials on site" or "Check 2: Work done". */
  label: string;
  detail: string;
  /** Who a release pays, read from the escrow. */
  payee: { address: string; role: "contractor"; demo: boolean };
  amount: string;
  amountLabel: string;
  state: TrancheStateName;
  claimedAt: string;
  verifiedAt: string;
  challengeUntil: string;
  verificationDeadline: string;
  settledAt: string;
};

export type EscrowTx = {
  step:
    | "create"
    | "cash_in"
    | "fund"
    | "activate"
    | "claim"
    | "verify"
    | "release"
    | "refund";
  index?: 0 | 1;
  signature: string;
  at: string;
  url: string;
};

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
  funded: boolean | null;
  cancelled: boolean | null;
  tranches: EscrowTranche[] | null;
  transactions: EscrowTx[];
  readAt: string;
  chainError: string | null;
};

export type Finding = { code: string; severity: "error" | "warning"; message: string };

export type PreparedVerify = {
  transaction: string;
  reviewHash: string;
  guardian: { ok: boolean; findings: Finding[] };
  description: string[];
  signer: { kind: "demo_key"; label: string; address: string };
};

export type SentStep = { signature: string; explorerUrl: string };

/** An error from the escrow API, with the program's own refusal when there is one. */
export class EscrowApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly programError: string | null = null,
    readonly findings: Finding[] = [],
  ) {
    super(message);
    this.name = "EscrowApiError";
  }
}

async function call<T>(path: string, json?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: json === undefined ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      headers: json === undefined ? undefined : { "content-type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch {
    throw new EscrowApiError("Could not reach the server. Check your connection.", 0);
  }
  let body: {
    data?: T;
    error?: { message?: string; programError?: string | null; findings?: Finding[] };
  } = {};
  try {
    body = await response.json();
  } catch {
    // Fall through to the generic error below.
  }
  if (!response.ok || body.error) {
    throw new EscrowApiError(
      body.error?.message ?? "Something went wrong. Try again.",
      response.status,
      body.error?.programError ?? null,
      body.error?.findings ?? [],
    );
  }
  return body.data as T;
}

const base = (issueId: string) => `/api/issues/${encodeURIComponent(issueId)}/escrow`;

export const escrowApi = {
  get: (issueId: string) => call<PublicEscrow | null>(base(issueId)),
  fund: (
    issueId: string,
    body: { materials: string; completion: string; challengeSeconds: number },
  ) => call<PublicEscrow>(`${base(issueId)}/fund`, body),
  claim: (issueId: string, body: { index: 0 | 1; note: string }) =>
    call<SentStep>(`${base(issueId)}/claim`, body),
  prepareVerify: (issueId: string, body: { index: 0 | 1; note: string }) =>
    call<PreparedVerify>(`${base(issueId)}/verify/prepare`, body),
  submitVerify: (
    issueId: string,
    body: { index: 0 | 1; transaction: string; reviewHash: string },
  ) => call<SentStep>(`${base(issueId)}/verify/submit`, body),
  release: (issueId: string, index: 0 | 1) =>
    call<SentStep>(`${base(issueId)}/release`, { index }),
  refund: (issueId: string, index: 0 | 1) =>
    call<SentStep>(`${base(issueId)}/refund`, { index }),
};

/** "R1 234.50" from a rand amount typed by a person, as cents; null when it is not a number. */
export function randToCents(text: string): string | null {
  const clean = text.replace(/[\sR,]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  const [rands, cents = ""] = clean.split(".");
  return (BigInt(rands) * BigInt(100) + BigInt(cents.padEnd(2, "0") || "0")).toString();
}

/** "4 min 05 s" style countdown text. */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const r = s % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min ${String(r).padStart(2, "0")} s`;
  return `${r} s`;
}

/** First and last characters of an address or signature. */
export function shortKey(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}
