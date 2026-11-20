import Link from "next/link";
import { Picture } from "@/components/community/picture";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import type { School } from "@/data/types";
import { useMessages } from "@/i18n";

/** Whether the school itself responds on BonaBlock. Icon + words, not colour alone. */
export function ParticipationBadge({
  school,
}: {
  school: Pick<School, "participation">;
}) {
  const m = useMessages();
  const participating = school.participation === "participating";
  return (
    <span
      data-participation={school.participation}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
        participating ? "bg-brand-soft text-brand-strong" : "bg-sunken text-muted",
      )}
    >
      <Icon name={participating ? "shieldCheck" : "clock"} className="size-4" />
      {participating ? m.schools.participating : m.schools.invited}
    </span>
  );
}

export function SchoolCard({ school }: { school: School }) {
  const m = useMessages();
  return (
    <Link
      href={`/schools/${school.id}`}
      data-testid="school-card"
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card hover:border-brand"
    >
      <Picture name="hero_school" decorative blend className="aspect-[3/1]" />
      <span className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        <span className="text-lg font-semibold leading-snug">{school.name}</span>
        <span className="flex items-center gap-1 text-sm text-muted">
          <Icon name="mapPin" className="size-4 shrink-0" />
          {school.town}, {school.province} · {m.schools.learners(school.learners)}
        </span>
        <span className="mt-auto pt-1">
          <ParticipationBadge school={school} />
        </span>
      </span>
    </Link>
  );
}
