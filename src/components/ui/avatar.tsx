import { cn } from "./cn";

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

/* Six warm tones; a name always maps to the same one. All pass 4.5:1 with white text. */
const tones = [
  "bg-brand text-on-brand",
  "bg-earth text-on-brand",
  "bg-accent text-on-brand",
  "bg-st-assess text-surface",
  "bg-st-claimed text-surface",
  "bg-st-declined text-surface",
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 1_000_003;
  return tones[hash % tones.length];
}

/**
 * Initials in a coloured circle. Decorative when the name is written next to
 * it (the default); pass `labelled` when it stands alone.
 */
export function Avatar({
  name,
  size = "md",
  labelled = false,
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  labelled?: boolean;
  className?: string;
}) {
  return (
    <span
      role={labelled ? "img" : undefined}
      aria-label={labelled ? name : undefined}
      aria-hidden={labelled ? undefined : true}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide select-none",
        sizes[size],
        toneFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
