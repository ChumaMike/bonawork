"use client";

import { IssueCard } from "@/components/issue-card";
import { LoadError, Loading } from "@/components/ui/page";
import { getApi } from "@/data/api";
import { useQuery } from "@/data/use-query";

/**
 * The three latest public reports. On phones they sit in a strip that scrolls
 * sideways under the thumb; from tablet width up they form a row of cards.
 */
export function RecentIssues() {
  const query = useQuery("recent-issues", () => getApi().listIssues({ sort: "recent" }));
  if (query.error) return <LoadError onRetry={query.reload} />;
  if (!query.data) return <Loading lines={2} />;
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0">
      {query.data.slice(0, 3).map((issue) => (
        <li key={issue.id} className="w-[85%] shrink-0 snap-start md:w-auto">
          <IssueCard issue={issue} endorse={false} picture />
        </li>
      ))}
    </ul>
  );
}
