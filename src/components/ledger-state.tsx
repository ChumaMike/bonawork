import type { LedgerRecord } from "@/data/types";
import { useMessages, type Messages } from "@/i18n";
import { formatDate } from "@/lib/format";
import { cn } from "./ui/cn";
import { Icon, type IconName } from "./ui/icon";

type LedgerView = "none" | "simulated" | "pending" | "confirmed" | "failed";

/** Avalanche C-Chain and the Fuji test network. Anything else is not a public record. */
const AVALANCHE_CHAINS = new Set(["eip155:43114", "eip155:43113"]);

function viewOf(record: LedgerRecord): LedgerView {
  if (record.source !== "ledger") return record.source;
  // A receipt from the in-memory development ledger (`bona:memory`) or any
  // unknown network is shown as a sample, never as "Recorded on Avalanche".
  return AVALANCHE_CHAINS.has(record.receipt.chainId)
    ? record.receipt.status
    : "simulated";
}

const VIEW: Record<LedgerView, { icon: IconName; tone: string }> = {
  none: { icon: "cube", tone: "border-line bg-sunken text-muted" },
  // Dashed border: visibly a placeholder, never mistaken for a real record.
  simulated: {
    icon: "info",
    tone: "border-dashed border-accent bg-accent-soft text-accent",
  },
  pending: { icon: "clock", tone: "border-st-assess bg-st-assess-soft text-st-assess" },
  confirmed: {
    icon: "shieldCheck",
    tone: "border-st-verified bg-st-verified-soft text-st-verified",
  },
  failed: { icon: "alert", tone: "border-danger bg-danger-soft text-danger" },
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

/** Explorer links exist only for real receipts on a known Avalanche network. */
function explorerUrl(chainId: string, txId: string): string | null {
  if (chainId === "eip155:43114") return `https://snowtrace.io/tx/${txId}`;
  if (chainId === "eip155:43113") return `https://testnet.snowtrace.io/tx/${txId}`;
  return null;
}

/** Small inline label for lists and timelines. */
export function LedgerChip({ record }: { record: LedgerRecord }) {
  const m = useMessages();
  const view = viewOf(record);
  return (
    <span
      data-ledger={view}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold",
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
    <div data-ledger={view} className={cn("rounded-xl border p-4", VIEW[view].tone)}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon name={VIEW[view].icon} />
        {copy.title}
      </p>
      <p className="mt-1 text-sm text-ink">{copy.body}</p>
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
