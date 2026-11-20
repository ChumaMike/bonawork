import type { IssueStatus } from "@/data/types";
import { useMessages } from "@/i18n";
import { cn } from "./ui/cn";
import { type IconName } from "./ui/icon";
import { STATUS_TONE, StatusPill } from "./ui/status-pill";

/**
 * Icon and colour for each public status, for tiles and bars that are not
 * pills. The pill itself is the Design Foundation's <StatusPill>; the tones
 * come from the same table so the two never drift apart.
 */
export const STATUS_STYLE: Record<
  IssueStatus,
  { icon: IconName; badge: string; bar: string }
> = Object.fromEntries(
  (Object.keys(STATUS_TONE) as IssueStatus[]).map((status) => [
    status,
    {
      icon: STATUS_TONE[status].icon,
      badge: STATUS_TONE[status].pill,
      bar: STATUS_TONE[status].dot,
    },
  ]),
) as Record<IssueStatus, { icon: IconName; badge: string; bar: string }>;

/** Kept for the cards and lists that already use it; renders the foundation pill. */
export function StatusBadge({
  status,
  className,
}: {
  status: IssueStatus;
  className?: string;
}) {
  return <StatusPill status={status} className={className} />;
}

/** The usual path of an issue. `disputed` takes the final place when a claim fails review. */
const PATH: IssueStatus[] = [
  "reported",
  "under_assessment",
  "being_addressed",
  "repair_claimed",
  "independently_verified",
];

/**
 * Where an issue stands, as a five-part bar plus a plain-language sentence.
 * A repair claim fills four parts, never five: only a reviewer completes it.
 */
export function StatusProgress({ status }: { status: IssueStatus }) {
  const m = useMessages();
  // A declined report stopped at the first step; a disputed one got as far as the claim.
  const position =
    status === "disputed" ? 4 : status === "declined" ? 1 : PATH.indexOf(status) + 1;
  const style = STATUS_STYLE[status];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* The sentence is printed beside the pill, so the pill does not also whisper it. */}
        <StatusPill status={status} size="lg" unverifiedHint={false} />
        {status === "repair_claimed" ? (
          <span className="text-sm font-semibold text-st-claimed">
            {m.status.notVerifiedYet}
          </span>
        ) : null}
      </div>
      <div
        className="mt-4 flex gap-1.5"
        role="img"
        aria-label={`${m.status.stepsLabel}: ${m.status.label[status]}`}
      >
        {PATH.map((step, index) => (
          <span
            key={step}
            className={cn(
              "h-2 flex-1 rounded-full",
              index < position
                ? style.bar
                : status === "disputed" && index === 4
                  ? "bg-st-disputed-soft"
                  : "bg-sunken",
            )}
          />
        ))}
      </div>
      <p className="mt-3 text-muted">{m.status.meaning[status]}</p>
    </div>
  );
}
