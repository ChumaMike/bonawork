import { useMessages } from "@/i18n";
import { cn } from "./cn";

/**
 * A shape that holds the place of content still loading. Shimmers unless
 * the person prefers reduced motion. Group several inside <SkeletonGroup>
 * so screen readers hear "Loading…" once instead of nothing.
 */
export function Skeleton({
  className,
  shape = "block",
}: {
  className?: string;
  shape?: "block" | "text" | "circle";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block bg-sunken motion-safe:animate-[bona-shimmer_1.6s_linear_infinite] motion-safe:bg-[linear-gradient(90deg,var(--color-sunken)_0%,var(--color-surface)_50%,var(--color-sunken)_100%)] motion-safe:bg-[length:200%_100%]",
        shape === "block" && "h-24 rounded-2xl",
        shape === "text" && "h-4 w-full rounded-md",
        shape === "circle" && "size-10 rounded-full",
        className,
      )}
    />
  );
}

export function SkeletonGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const m = useMessages();
  return (
    <div role="status" className={cn("flex flex-col gap-3", className)}>
      <span className="sr-only">{m.common.loading}</span>
      {children}
    </div>
  );
}

/** A card-shaped placeholder: picture strip, a title line and two text lines. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4",
        className,
      )}
    >
      <Skeleton className="aspect-[3/2] h-auto rounded-xl" />
      <Skeleton shape="text" className="h-5 w-2/3" />
      <Skeleton shape="text" />
      <Skeleton shape="text" className="w-4/5" />
    </div>
  );
}
