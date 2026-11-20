import { cn } from "@/components/ui/cn";
import { Icon, type IconName } from "@/components/ui/icon";
import type { ProcurementStage } from "@/data/types";
import { useMessages } from "@/i18n";

/**
 * Where an order stands: an icon plus words, so colour never carries the
 * meaning alone. It sits next to the report status and never replaces it:
 * a finance step does not change whether a repair is verified.
 */
const STAGE_TONE: Record<ProcurementStage, { icon: IconName; pill: string }> = {
  order_approved: { icon: "file", pill: "bg-st-assess-soft text-st-assess" },
  order_acknowledged: { icon: "check", pill: "bg-st-assess-soft text-st-assess" },
  invoice_blocked: { icon: "alert", pill: "bg-st-disputed-soft text-st-disputed" },
  invoice_matched: { icon: "check", pill: "bg-st-address-soft text-st-address" },
  awaiting_verification: { icon: "clock", pill: "bg-st-claimed-soft text-st-claimed" },
  ready_for_release: { icon: "lock", pill: "bg-st-address-soft text-st-address" },
  release_authorised: {
    icon: "shieldCheck",
    pill: "bg-st-verified-soft text-st-verified",
  },
};

export function StagePill({
  stage,
  className,
}: {
  /** Null while the case has no work order. */
  stage: ProcurementStage | null;
  className?: string;
}) {
  const m = useMessages();
  const tone = stage
    ? STAGE_TONE[stage]
    : { icon: "file" as const, pill: "bg-sunken text-muted" };
  return (
    <span
      data-testid="stage-pill"
      data-stage={stage ?? "none"}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold whitespace-nowrap",
        tone.pill,
        className,
      )}
    >
      <Icon name={tone.icon} className="size-4" />
      {stage ? m.procurement.stage.label[stage] : m.procurement.stage.noOrder}
    </span>
  );
}
