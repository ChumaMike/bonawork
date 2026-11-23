import type { ReactNode } from "react";
import { Photo } from "@/components/media/photo";
import type { PhotoName } from "@/components/media/manifest";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

/**
 * Nothing here yet, said plainly: a soft grey card like the landing page's,
 * an optional picture or icon tile, a short title, one sentence and one
 * action.
 *
 *   <EmptyState title="No reports yet" body="Be the first to report a problem here."
 *     icon="list" action={<ButtonLink href="/report">Report a problem</ButtonLink>} />
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
        "rounded-2xl bg-sunken px-5 py-10 text-center sm:px-8 sm:py-12",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        {photo ? (
          <Photo
            name={photo}
            alt=""
            sizes="192px"
            shape="free"
            className="h-28 w-44 rounded-2xl shadow-card"
          />
        ) : icon ? (
          <span className="flex size-12 items-center justify-center rounded-xl border border-line bg-surface text-ink shadow-card">
            <Icon name={icon} className="size-6" />
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
