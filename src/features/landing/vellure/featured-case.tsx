"use client";

import { getApi } from "@/data/api";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { findFinishedCase, PublicTrailShowcase } from "../public-trail-showcase";

/**
 * One finished case, as the public may see it, in its own band of the landing
 * page. It is the same public trail the issue page shows, loaded through the
 * same data layer. The whole band is absent while it loads, if loading fails
 * or if no case has a finished trail: the page reads well without it.
 */
export function FeaturedCase() {
  const m = useMessages();
  const query = useQuery("featured-trail", () => findFinishedCase(getApi()));
  const issue = query.data;
  if (!issue?.publicTrail?.length) return null;
  // The report and the independent verification frame the finance steps.
  const around = issue.timeline.filter(
    (event) => event.type === "reported" || event.type === "verified",
  );
  return (
    <section className="vl-section vl-showcase" data-ground="soft" id="finished-case">
      <div className="vl-wrap">
        <div className="vl-head">
          <p className="vl-label">{m.landingPage.showcase.label}</p>
          <PublicTrailShowcase steps={issue.publicTrail} issue={issue} around={around} />
        </div>
      </div>
    </section>
  );
}
