import { FeaturedCase } from "@/features/landing/vellure/featured-case";
import { RevealRoot } from "@/features/landing/vellure/reveal";
import {
  About,
  Bento,
  BuiltOn,
  Capabilities,
  ClosingBand,
  Funding,
  Hero,
  Metrics,
  OurPromise,
  People,
  Questions,
  StartHere,
} from "@/features/landing/vellure/sections";

/**
 * The public landing page.
 *
 * One long page for someone who has never seen BonaWork: what it is, the
 * school search and the three things people come to do, what it checks, who
 * does what, what has been tested, one finished case as its public trail, who
 * funds it, and the questions people ask first.
 *
 * Its top bar and footer are the landing versions that `SiteHeader` and
 * `SiteFooter` show on this path only; every other page keeps its own.
 *
 * Nothing on this page carries an amount, a supplier name or a person's name,
 * and it links to no staff workspace: those stay behind sign-in.
 */
export default function Home() {
  return (
    <div className="vl vl-page">
      <RevealRoot />
      <Hero />
      <BuiltOn />
      <StartHere />
      <About />
      <Capabilities />
      <People />
      <Metrics />
      <Bento />
      <FeaturedCase />
      <Funding />
      <OurPromise />
      <Questions />
      <ClosingBand />
    </div>
  );
}
