"use client";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { getApi } from "@/data/api";
import type { EvidenceItem, EvidencePurpose } from "@/data/types";
import { useMessages } from "@/i18n";

/** The first image a signed-in staff member may open, preferring the given purpose. */
export function pickPhoto(
  items: EvidenceItem[],
  purpose?: EvidencePurpose,
): EvidenceItem | null {
  const images = items.filter((item) => item.mediaType.startsWith("image/"));
  return (
    (purpose ? images.find((item) => item.purpose === purpose) : undefined) ??
    images[0] ??
    null
  );
}

/** Where a signed-in staff member can open the photo, or null where files cannot be served. */
export function photoUrl(
  items: EvidenceItem[],
  purpose?: EvidencePurpose,
): string | null {
  const photo = pickPhoto(items, purpose);
  return photo ? (getApi().evidenceFileUrl?.(photo.id) ?? null) : null;
}

/**
 * A photo for a staff screen. The file is private and fetched with the
 * viewer's own session. Where files cannot be served (sample data) a plain
 * tile says so instead of pretending: "No photo" when there is none, and
 * "Photo on record, not shown" when there is one that cannot be opened here.
 */
export function EvidenceThumb({
  items,
  purpose,
  strict = false,
  title,
  alt,
  size = "sm",
  className,
}: {
  items: EvidenceItem[];
  purpose?: EvidencePurpose;
  /** Only a photo with exactly this purpose counts; never fall back to another one. */
  strict?: boolean;
  /** What the photo belongs to, for the alt text. */
  title: string;
  /** The whole alt text, when "Photo added for: title" is not specific enough. */
  alt?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const m = useMessages();
  const pool =
    strict && purpose ? items.filter((item) => item.purpose === purpose) : items;
  const photo = pickPhoto(pool, purpose);
  const url = photo ? (getApi().evidenceFileUrl?.(photo.id) ?? null) : null;
  const box = size === "lg" ? "aspect-[4/3] w-full" : "size-16";

  if (!url) {
    return (
      <span
        className={cn(
          "flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong bg-sunken p-2 text-center text-muted",
          box,
          className,
        )}
      >
        <Icon name="image" className={size === "lg" ? "size-7" : "size-5"} />
        <span className={cn("text-xs font-semibold", size === "sm" && "sr-only")}>
          {photo ? m.admin.photoNotShown : m.admin.noPhoto}
        </span>
      </span>
    );
  }

  return (
    // The file needs the viewer's session cookie, which the image optimiser does not send.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt ?? m.admin.photoAlt(title)}
      loading="lazy"
      width={size === "lg" ? 640 : 64}
      height={size === "lg" ? 480 : 64}
      className={cn(
        "shrink-0 rounded-lg border border-line bg-sunken object-cover",
        box,
        className,
      )}
    />
  );
}
