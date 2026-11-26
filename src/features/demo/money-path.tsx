"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/components/ui/cn";
import type { EscrowTx, PublicEscrow, TrancheStateName } from "@/features/escrow/api";
import { formatWait } from "@/features/escrow/api";

/** 300000 -> "R3 000". Whole rand only: the demo amounts have no cents. */
export function rand(cents: number): string {
  const whole = Math.round(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R${whole}`;
}

type Tone = "waiting" | "active" | "done" | "stopped";

const TONE: Record<Tone, string> = {
  waiting: "border-line bg-surface text-muted",
  active: "border-brand bg-brand-soft text-ink shadow-[0_0_0_4px_rgb(3_70_255/0.12)]",
  done: "border-st-verified bg-st-verified-soft text-ink",
  stopped: "border-st-disputed bg-st-disputed-soft text-ink",
};

function lastTx(
  txs: readonly EscrowTx[],
  steps: EscrowTx["step"][],
  index?: 0 | 1,
): EscrowTx | null {
  for (let i = txs.length - 1; i >= 0; i--) {
    const t = txs[i];
    if (steps.includes(t.step) && (index === undefined || t.index === index)) return t;
  }
  return null;
}

export function ProofLink({
  tx,
  label = "On Solana: view transaction",
}: {
  tx: EscrowTx | null;
  label?: string;
}) {
  if (!tx) return null;
  return (
    <a
      href={tx.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-brand-strong underline underline-offset-2"
    >
      {label}
      <Icon name="link" className="size-3.5" />
      <span className="sr-only">(opens Solana Explorer)</span>
    </a>
  );
}

function Node({
  tone,
  kicker,
  name,
  amount,
  icon,
  children,
  testId,
  className,
}: {
  className?: string;
  tone: Tone;
  kicker: string;
  name: string;
  amount?: string;
  icon?: "lock" | "lockOpen";
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-tone={tone}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-2xl border-2 px-4 py-3 transition-[background-color,border-color,box-shadow] duration-500",
        TONE[tone],
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.08em] uppercase">{kicker}</p>
        {amount ? (
          <p className="flex shrink-0 items-center gap-1 font-display text-lg font-semibold text-ink tabular-nums">
            {icon ? <Icon name={icon} className="size-4" /> : null}
            {amount}
          </p>
        ) : null}
      </div>
      <p className="font-display text-lg leading-tight font-semibold text-ink">{name}</p>
      {children}
    </div>
  );
}

/** A connector between two nodes: down on a phone, across on a wide screen. */
function Wire({ lit, className }: { lit: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mx-auto block h-5 w-0.5 rounded-full lg:mx-0 lg:my-auto lg:h-0.5 lg:w-8 xl:w-12",
        lit ? "bg-brand" : "bg-line-strong",
        className,
      )}
    />
  );
}

function branchTone(state: TrancheStateName | null, funded: boolean): Tone {
  if (!state || !funded) return "waiting";
  if (state === "Released") return "done";
  if (state === "Refunded" || state === "Disputed") return "stopped";
  return "active";
}

function branchText(
  state: TrancheStateName | null,
  funded: boolean,
  payee: string,
  secondsLeft: number | null,
): string {
  if (!state || !funded) return "Not funded yet";
  switch (state) {
    case "Pending":
      return "Held. Waiting for the contractor to ask";
    case "Claimed":
      return "Asked. Waiting for the reviewer to check";
    case "Verified":
      return secondsLeft !== null && secondsLeft > 0
        ? `Checked. Locked for ${formatWait(secondsLeft)} more`
        : "Checked. Anyone can release it now";
    case "Released":
      return `Released to the ${payee}`;
    case "Refunded":
      return "Returned to the funder";
    case "Disputed":
      return "Stopped: the school disputed it";
  }
}

/**
 * The money path: Funder, then held on Solana, then Check 1 to the supplier
 * and Check 2 to the contractor. Each part lights up from the escrow as Solana
 * devnet has it, with the rand amount and a link to its latest transaction.
 */
export function MoneyPath({
  escrow,
  amounts,
  funderName,
  now,
  compact = false,
}: {
  escrow: PublicEscrow | null;
  /** [Check 1, Check 2] in cents, from the template until the escrow exists. */
  amounts: [number, number];
  funderName: string;
  /** Unix seconds on the server's clock, for the countdown. */
  now: number;
  compact?: boolean;
}) {
  const funded = escrow?.funded === true;
  const tranches = escrow?.tranches ?? null;
  const txs = escrow?.transactions ?? [];
  const a = tranches ? [Number(tranches[0].amount), Number(tranches[1].amount)] : amounts;
  const total = a[0] + a[1];
  const held =
    escrow?.vault.amount != null ? Number(escrow.vault.amount) : funded ? total : 0;
  const anyReleased = tranches?.some((t) => t.state === "Released") ?? false;

  const branch = (index: 0 | 1) => {
    const t = tranches?.[index] ?? null;
    const state = t?.state ?? null;
    const left = t && t.state === "Verified" ? Number(t.challengeUntil) - now : null;
    const payee = index === 0 ? "supplier" : "contractor";
    const tone = branchTone(state, funded);
    const tx = lastTx(txs, ["release", "refund", "verify", "claim"], index);
    return (
      <div className="flex flex-col lg:flex-row lg:items-stretch" key={index}>
        <Node
          testId={`path-check-${index + 1}`}
          className="lg:flex-1"
          tone={tone}
          kicker={index === 0 ? "Check 1 · Materials on site" : "Check 2 · Work done"}
          name={branchText(state, funded, payee, left)}
          amount={rand(a[index])}
          icon={state === "Released" ? "lockOpen" : funded ? "lock" : undefined}
        >
          {compact ? null : <ProofLink tx={tx} />}
        </Node>
        <Wire lit={state === "Released"} />
        <Node
          testId={`path-payee-${index + 1}`}
          className="lg:w-44 lg:shrink-0"
          tone={state === "Released" ? "done" : "waiting"}
          kicker={index === 0 ? "Supplier" : "Contractor"}
          name={index === 0 ? "Demo supplier" : "Themba Zulu"}
        />
      </div>
    );
  };

  return (
    <figure
      aria-label="Where the money is"
      data-testid="money-path"
      className="flex flex-col lg:flex-row lg:items-center"
    >
      <div className="lg:w-56 lg:shrink-0">
        <Node
          testId="path-funder"
          tone={funded ? "done" : escrow ? "active" : "waiting"}
          kicker="Funder"
          name={funderName}
          amount={rand(total)}
        >
          {compact ? null : <ProofLink tx={lastTx(txs, ["activate", "fund"])} />}
        </Node>
      </div>
      <Wire lit={funded} />
      <div className="lg:w-56 lg:shrink-0">
        <Node
          testId="path-held"
          tone={funded ? (held > 0 ? "active" : "done") : "waiting"}
          kicker="Held on Solana"
          name={
            funded
              ? held > 0
                ? "Locked until checked"
                : "All released"
              : "Nothing held yet"
          }
          amount={rand(held)}
          icon={funded && held > 0 ? "lock" : anyReleased ? "lockOpen" : undefined}
        >
          {compact || !escrow ? null : (
            <a
              href={escrow.escrow.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-brand-strong underline underline-offset-2"
            >
              On Solana: view the account
              <Icon name="link" className="size-3.5" />
            </a>
          )}
        </Node>
      </div>
      <Wire lit={funded} />
      <div
        className={cn(
          "ml-4 flex min-w-0 flex-1 flex-col gap-3 border-l-2 py-1 pl-3 lg:ml-0 lg:pl-4",
          funded ? "border-brand" : "border-line-strong",
        )}
      >
        {[branch(0), branch(1)]}
      </div>
    </figure>
  );
}
