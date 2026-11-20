import Link from "next/link";
import { PhotoHeader } from "@/components/media/photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { HomeTiles } from "@/features/home/home-tiles";
import { FeaturedTrail } from "@/features/landing/public-trail-showcase";
import { TrailExplainer } from "@/features/landing/trail-explainer";
import { getMessages } from "@/i18n";

/**
 * The public landing page.
 *
 * The first screen asks one question (which school?) because everything a
 * parent or a caretaker comes to do starts at their school, and offers the
 * three other things people do as picture tiles. Below it, for someone who has
 * never seen Bona Chain: what it does in three steps, the trail from a report
 * to a release instruction in plain words, and one finished case shown as its
 * public trail.
 *
 * Nothing on this page carries an amount, a supplier name or a person's name,
 * and it links to no staff workspace: those stay behind sign-in.
 */
export default function Home() {
  const m = getMessages();
  const l = m.landing;

  return (
    <>
      <PhotoHeader name="hero_home" priority size="lg" note={l.photoNote}>
        <div className="mx-auto w-full max-w-2xl px-4 pb-6 sm:px-6">
          <p className="font-display text-lg text-brand-strong">{l.title}</p>
          <h1 id="school-search-label" className="mt-1 text-4xl font-bold tracking-tight">
            {l.question}
          </h1>
          <form action="/schools" role="search" className="mt-4 flex flex-col gap-3">
            <Input
              id="school-search"
              name="q"
              type="search"
              placeholder={l.searchPlaceholder}
              autoComplete="off"
              aria-labelledby="school-search-label"
              className="min-h-14 text-lg"
            />
            <Button type="submit" size="lg" className="w-full">
              <Icon name="search" />
              {l.searchAction}
            </Button>
          </form>
        </div>
      </PhotoHeader>

      <section
        aria-labelledby="actions-title"
        className="mx-auto w-full max-w-2xl px-4 pb-8 sm:px-6"
      >
        <h2 id="actions-title" className="text-lg font-semibold text-muted">
          {l.actionsTitle}
        </h2>
        <HomeTiles />
        <Link
          href="/schools"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong underline underline-offset-4"
        >
          {l.browseSchools}
          <Icon name="arrowRight" className="size-4" />
        </Link>
      </section>

      <TrailExplainer />
      <FeaturedTrail />
    </>
  );
}
