import type { ReactNode } from "react";
import { cn } from "./cn";

const sizes = {
  sm: { box: 40, stroke: 4, text: "text-xs" },
  md: { box: 56, stroke: 5, text: "text-sm" },
  lg: { box: 88, stroke: 7, text: "text-xl" },
} as const;

/**
 * A ring that fills clockwise: "3 of 5 steps", "7 people affected" against a
 * goal, or a percentage. The number sits in the middle; the meaning is
 * spoken through `label`, never by the colour alone.
 *
 *   <ProgressRing value={7} max={10} label="7 of 10 people affected">7</ProgressRing>
 */
export function ProgressRing({
  value,
  max = 100,
  label,
  size = "md",
  tone = "brand",
  children,
  className,
}: {
  value: number;
  max?: number;
  /** What the ring means, read by screen readers. */
  label: string;
  size?: keyof typeof sizes;
  tone?: "brand" | "earth" | "accent" | "danger";
  /** What to show in the middle; defaults to the value. */
  children?: ReactNode;
  className?: string;
}) {
  const { box, stroke, text } = sizes[size];
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const toneClass = {
    brand: "text-brand",
    earth: "text-earth",
    accent: "text-accent",
    danger: "text-danger",
  }[tone];

  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: box, height: box }}
    >
      <svg
        viewBox={`0 0 ${box} ${box}`}
        width={box}
        height={box}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-line"
        />
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cn(
            toneClass,
            "transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none",
          )}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-bold",
          text,
        )}
      >
        {children ?? value}
      </span>
    </span>
  );
}
