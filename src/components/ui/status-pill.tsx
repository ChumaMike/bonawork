import type { IssueStatus } from "@/data/types";
import { useMessages } from "@/i18n";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

/**
 * One tone per public status, each with an icon so colour is never the only
 * signal. Words come from the message file and the status set from
 * src/data/types; there is no "resolved" — a repair claim stays a claim until
 * an independent reviewer verifies it.
 */
export const STATUS_TONE: Record<
  IssueStatus,
  { icon: IconName; pill: string; dot: string; text: string }
> = {
  reported: {
    icon: "flag",
    pill: "bg-st-reported-soft text-st-reported",
    dot: "bg-st-reported",
    text: "text-st-reported",
  },
  under_assessment: {
    icon: "search",
    pill: "bg-st-assess-soft text-st-assess",
    dot: "bg-st-assess",
    text: "text-st-assess",
  },
  being_addressed: {
    icon: "wrench",
    pill: "bg-st-address-soft text-st-address",
    dot: "bg-st-address",
    text: "text-st-address",
  },
  repair_claimed: {
    icon: "clock",
    pill: "bg-st-claimed-soft text-st-claimed",
    dot: "bg-st-claimed",
    text: "text-st-claimed",
  },
  independently_verified: {
    icon: "shieldCheck",
    pill: "bg-st-verified-soft text-st-verified",
    dot: "bg-st-verified",
    text: "text-st-verified",
  },
  disputed: {
    icon: "alert",
    pill: "bg-st-disputed-soft text-st-disputed",
    dot: "bg-st-disputed",
    text: "text-st-disputed",
  },
  declined: {
    icon: "ban",
    pill: "bg-st-declined-soft text-st-declined",
    dot: "bg-st-declined",
    text: "text-st-declined",
  },
};

const sizes = {
  sm: "min-h-7 gap-1 px-2.5 text-xs [&>svg]:size-3.5",
  md: "min-h-8 gap-1.5 px-3 text-sm [&>svg]:size-4",
  lg: "min-h-10 gap-2 px-4 text-base [&>svg]:size-5",
} as const;

export function StatusPill({
  status,
  size = "md",
  meaning = false,
  unverifiedHint = true,
  className,
}: {
  status: IssueStatus;
  size?: keyof typeof sizes;
  /** Also print the one-line meaning under the pill. */
  meaning?: boolean;
  /** Pass false when "Not verified yet" is already written visibly next to the pill. */
  unverifiedHint?: boolean;
  className?: string;
}) {
  const m = useMessages();
  const tone = STATUS_TONE[status];
  const pill = (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-full font-semibold whitespace-nowrap",
        sizes[size],
        tone.pill,
        !meaning && className,
      )}
    >
      <Icon name={tone.icon} />
      {m.status.label[status]}
      {/* Only when the meaning is not written out beside the pill, so nothing is read twice. */}
      {status === "repair_claimed" && !meaning && unverifiedHint ? (
        <span className="sr-only">. {m.status.notVerifiedYet}</span>
      ) : null}
    </span>
  );
  if (!meaning) return pill;
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      {pill}
      <p className="text-sm text-muted">{m.status.meaning[status]}</p>
    </div>
  );
}
