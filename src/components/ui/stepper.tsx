import { useMessages } from "@/i18n";
import { cn } from "./cn";
import { Icon } from "./icon";

/**
 * Where someone is in a short flow ("Where → What → Show us → Done").
 * Labels are always visible and may wrap: translated words run longer.
 * Screen readers hear "Step 2 of 4: What" on the current step.
 */
export function Stepper({
  steps,
  current,
  label,
  className,
}: {
  steps: string[];
  /** Zero-based index of the current step. */
  current: number;
  /** Name of the whole flow, e.g. "Report a problem". */
  label: string;
  className?: string;
}) {
  const m = useMessages();
  return (
    <nav aria-label={label} className={cn("no-print", className)}>
      <ol
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "todo";
          return (
            <li
              key={step}
              aria-current={state === "current" ? "step" : undefined}
              className="flex min-w-0 flex-col items-center gap-1.5 text-center"
            >
              <span className="flex w-full items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    index === 0 ? "invisible" : state === "todo" ? "bg-line" : "bg-brand",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                    state === "done" && "bg-brand-soft text-brand-strong",
                    state === "current" &&
                      "bg-brand text-on-brand shadow-[0_0_0_4px_rgb(3_70_255/0.14)]",
                    state === "todo" && "border border-line-strong bg-surface text-muted",
                  )}
                >
                  {state === "done" ? (
                    <Icon name="check" className="size-4" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    index === steps.length - 1
                      ? "invisible"
                      : state === "done"
                        ? "bg-brand"
                        : "bg-line",
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-xs leading-tight font-medium sm:text-sm",
                  state === "current" ? "text-ink" : "text-muted",
                )}
              >
                <span className="sr-only">
                  {m.common.stepOf(index + 1, steps.length)}
                  {state === "done" ? ` ${m.common.stepDone}` : ""}:{" "}
                </span>
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
