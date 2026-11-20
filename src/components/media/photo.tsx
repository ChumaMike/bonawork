import Image from "next/image";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { Pattern } from "@/components/ui/pattern";
import { getPhoto, type PhotoName } from "./manifest";

/**
 * A photograph from the manifest. The box keeps the picture's shape so the
 * page never jumps, shows the dominant colour while bytes arrive, and loads
 * lazily unless `priority` says it is above the fold. When the file has not
 * been produced yet it draws a placeholder (pattern + icon) in the same box,
 * so every page works before the photography does.
 *
 *   <Photo name="hero_home" priority sizes="100vw" className="rounded-2xl" />
 */
export function Photo({
  name,
  priority = false,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  alt,
  className,
  imageClassName,
  fit = "cover",
  shape = "ratio",
  blend = false,
}: {
  name: PhotoName;
  /** Above the fold: eager, high fetch priority, preloaded. */
  priority?: boolean;
  /** Which part of the viewport the picture fills, for responsive srcset selection. */
  sizes?: string;
  /** Override the manifest alt text, or pass "" when the picture is purely decorative. */
  alt?: string;
  className?: string;
  imageClassName?: string;
  fit?: "cover" | "contain";
  /** `ratio` keeps the photograph's own shape; `free` lets `className` size the box. */
  shape?: "ratio" | "free";
  /** Fade the picture into the page behind it instead of ending on a hard edge. */
  blend?: boolean;
}) {
  const photo = getPhoto(name);
  const altText = alt ?? photo.alt;
  const style = {
    aspectRatio: shape === "ratio" ? `${photo.width} / ${photo.height}` : undefined,
    // A blended picture shows the page through its faded part, so no colour block behind it.
    backgroundColor: blend ? undefined : photo.color,
  };

  if (!photo.file) {
    return (
      <PhotoPlaceholder
        name={name}
        alt={altText}
        className={cn(blend && "photo-blend", className)}
        style={{ ...style, backgroundColor: photo.color }}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden",
        blend ? "photo-blend" : "bg-sunken",
        className,
      )}
      style={style}
      aria-hidden={altText ? undefined : true}
      data-photo={name}
    >
      <Image
        src={photo.file}
        alt={altText}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className={cn(
          fit === "cover" ? "object-cover" : "object-contain",
          imageClassName,
        )}
      />
    </div>
  );
}

/**
 * Drawn stand-in for a missing picture: the dominant tone, a quiet pattern and
 * the subject's icon. Labelled like the picture it stands in for.
 */
export function PhotoPlaceholder({
  name,
  alt,
  className,
  style,
}: {
  name: PhotoName;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const photo = getPhoto(name);
  const altText = alt ?? photo.alt;
  return (
    <div
      role={altText ? "img" : undefined}
      aria-label={altText || undefined}
      aria-hidden={altText ? undefined : true}
      data-photo={name}
      data-placeholder=""
      className={cn(
        "relative isolate flex items-center justify-center overflow-hidden text-surface",
        className,
      )}
      style={{
        aspectRatio: `${photo.width} / ${photo.height}`,
        backgroundColor: photo.color,
        ...style,
      }}
    >
      <Pattern variant="backdrop" tone="current" className="opacity-25" />
      <span className="relative flex size-[22%] max-h-20 max-w-20 min-h-10 min-w-10 items-center justify-center rounded-full bg-ink/25 backdrop-blur-sm">
        <Icon name={photo.icon} className="size-1/2" />
      </span>
    </div>
  );
}

/**
 * The top of a page: a photograph across the full width that fades into the
 * page, with the page's heading rising over the faded part. Used instead of a
 * framed picture so the photo reads as part of the page.
 *
 *   <PhotoHeader name="hero_school" priority>
 *     <h1>…</h1>
 *   </PhotoHeader>
 */
export function PhotoHeader({
  name,
  alt = "",
  priority = false,
  size = "md",
  className,
  note,
  children,
}: {
  name: PhotoName;
  /** A short caption on the photo, such as saying it is AI-generated. */
  note?: string;
  /** Decorative by default: the heading under it says what the page is about. */
  alt?: string;
  priority?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  const height = {
    sm: "h-32 sm:h-40",
    md: "h-44 sm:h-56 lg:h-64",
    lg: "h-52 sm:h-64 lg:h-80",
  }[size];
  const lift = { sm: "-mt-6", md: "-mt-9 sm:-mt-12", lg: "-mt-9 sm:-mt-12" }[size];
  return (
    <div className={cn("relative", className)} data-testid="photo-header">
      <Photo
        name={name}
        alt={alt}
        priority={priority}
        sizes="100vw"
        shape="free"
        blend
        className={cn("w-full", height)}
      />
      {note ? (
        <span
          data-testid="photo-note"
          className="absolute top-2 right-2 rounded-full bg-surface/85 px-2 py-0.5 text-xs text-muted"
        >
          {note}
        </span>
      ) : null}
      <div className={cn("relative", lift)}>{children}</div>
    </div>
  );
}
