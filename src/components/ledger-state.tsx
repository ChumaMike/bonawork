import type { LedgerRecord } from "@/data/types";
import { solanaTxUrl } from "@/lib/solana-explorer";
import { SOLANA_CHAINS } from "@/shared";
import { useMessages, type Messages } from "@/i18n";
import { formatDate } from "@/lib/format";
import { cn } from "./ui/cn";
import { Icon, type IconName } from "./ui/icon";

type LedgerView = "none" | "simulated" | "pending" | "confirmed" | "failed";

/** Solana devnet. Anything else is not a public record. */
const PUBLIC_CHAINS = new Set<string>(Object.values(SOLANA_CHAINS));

function viewOf(record: LedgerRecord): LedgerView {
  if (record.source !== "ledger") return record.source;
  // A receipt from the in-memory development ledger (`bona:memory`) or any
  // unknown network is shown as a sample, never as "Recorded on Solana".
  return PUBLIC_CHAINS.has(record.receipt.chainId) ? record.receipt.status : "simulated";
}

/** `tone` colours a chip, or the icon tile of the panel. The words carry the meaning. */
const VIEW: Record<LedgerView, { icon: IconName; tone: string }> = {
  none: { icon: "cube", tone: "border-line bg-sunken text-muted" },
  // An outline with no fill: a sample is never dressed as a real record.
  simulated: { icon: "info", tone: "border-line-strong bg-surface text-muted" },
  pending: { icon: "clock", tone: "border-transparent bg-st-assess-soft text-st-assess" },
  confirmed: {
    icon: "shieldCheck",
    tone: "border-transparent bg-st-verified-soft text-st-verified",
  },
  failed: { icon: "alert", tone: "border-transparent bg-danger-soft text-danger" },
};

function copyFor(view: LedgerView, m: Messages) {
  const l = m.ledger;
  return {
    none: { short: l.shortNone, title: l.noneTitle, body: l.noneBody },
    simulated: {
      short: l.shortSimulated,
      title: l.simulatedTitle,
      body: l.simulatedBody,
    },
    pending: { short: l.shortPending, title: l.pendingTitle, body: l.pendingBody },
    confirmed: {
      short: l.shortConfirmed,
      title: l.confirmedTitle,
      body: l.confirmedBody,
    },
    failed: { short: l.shortFailed, title: l.failedTitle, body: l.failedBody },
  }[view];
}

/** Explorer links exist only for real receipts on a known Solana network. */
function explorerUrl(chainId: string, txId: string): string | null {
  return chainId === SOLANA_CHAINS.devnet ? solanaTxUrl(txId) : null;
}

/** Small inline label for lists and timelines. */
export function LedgerChip({ record }: { record: LedgerRecord }) {
  const m = useMessages();
  const view = viewOf(record);
  return (
    <span
      data-ledger={view}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        VIEW[view].tone,
      )}
    >
      <Icon name={VIEW[view].icon} className="size-3.5" />
      {copyFor(view, m).short}
    </span>
  );
}

/** Full explanation of the ledger state, with transaction details only for real receipts. */
export function LedgerPanel({ record }: { record: LedgerRecord }) {
  const m = useMessages();
  const view = viewOf(record);
  const copy = copyFor(view, m);
  const receipt =
    record.source === "ledger" && view !== "simulated" ? record.receipt : null;
  const url = receipt ? explorerUrl(receipt.chainId, receipt.txId) : null;

  return (
    <div data-ledger={view} className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-2.5 font-medium">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl border",
            VIEW[view].tone,
          )}
        >
          <Icon name={VIEW[view].icon} className="size-5" />
        </span>
        {copy.title}
      </p>
      <p className="mt-2 text-sm text-ink">{copy.body}</p>
      {receipt ? (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm text-ink sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">{m.ledger.network}</dt>
          <dd className="font-mono break-all">{receipt.chainId}</dd>
          <dt className="font-semibold">{m.ledger.transaction}</dt>
          <dd className="font-mono break-all">{receipt.txId}</dd>
          {receipt.blockNumber !== null ? (
            <>
              <dt className="font-semibold">{m.ledger.block}</dt>
              <dd className="font-mono">{receipt.blockNumber}</dd>
            </>
          ) : null}
          {receipt.blockTimestamp ? (
            <>
              <dt className="font-semibold">{m.ledger.recordedAt}</dt>
              <dd>{formatDate(receipt.blockTimestamp)}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold underline underline-offset-4"
        >
          {m.ledger.viewOnExplorer}
          <Icon name="arrowRight" className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
