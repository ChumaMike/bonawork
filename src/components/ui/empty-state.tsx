import type { ReactNode } from "react";
import { Photo } from "@/components/media/photo";
import type { PhotoName } from "@/components/media/manifest";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";
import { Pattern } from "./pattern";

/**
 * Nothing here yet — said warmly. A sunlit card with the pattern behind it,
 * an optional picture or icon, a short title, one sentence, and one action.
 *
 *   <EmptyState title="No reports yet" body="Be the first to report a problem here."
 *     photo="empty_state" action={<ButtonLink href="/report">Report a problem</ButtonLink>} />
 */
export function EmptyState({
  title,
  body,
  icon,
  photo,
  action,
  children,
  className,
}: {
  title: string;
  body?: ReactNode;
  icon?: IconName;
  photo?: PhotoName;
  /** One button or link. Keep it to one. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-line bg-sun-soft px-5 py-8 text-center sm:px-8 sm:py-10",
        className,
      )}
    >
      <Pattern variant="backdrop" tone="earth" />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
        {photo ? (
          <Photo
            name={photo}
            alt=""
            sizes="160px"
            className="size-28 rounded-full shadow-card sm:size-36"
          />
        ) : icon ? (
          <span className="flex size-14 items-center justify-center rounded-full bg-surface text-earth shadow-card">
            <Icon name={icon} className="size-7" />
          </span>
        ) : null}
        <h3 className="text-xl text-ink">{title}</h3>
        {body ? <p className="text-muted">{body}</p> : null}
        {children}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </section>
  );
}
