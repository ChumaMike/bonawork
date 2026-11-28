"use client";

import Link from "next/link";
import { useGuided } from "@/features/demo/client";
import { useServerClock } from "@/features/demo/demo-screen";
import { EXAMPLE_REPAIRS, exampleProgress, exampleTotal } from "./fixtures";
import { MiniLine } from "./money-line";
import { clock, guidedLine, rand } from "./model";
import { DEMO_HEADLINE } from "./case-screen";

/** "Repairs on the line now": the live demo case first, then the examples. */
export function LiveRepairs() {
  const guided = useGuided();
  const now = useServerClock(guided.status === "ready" ? guided.clockSkew : 0);
  const demo = guided.status === "ready" ? guided.demo : null;

  let liveSub = "Follow it from the report to the last release";
  let liveFill = 0;
  if (demo) {
    const line = guidedLine(demo, now);
    liveFill = line.fill;
    const t = demo.escrow?.tranches?.find((x) => x.state === "Verified");
    if (t) {
      const left = Number(t.challengeUntil) - now;
      liveSub =
        left > 0
          ? `Waiting ${clock(left)} before ${rand(Number(t.amount))} can go to the ${t.index === 0 ? "supplier" : "contractor"}`
          : `${rand(Number(t.amount))} can be released now`;
    } else {
      const station = line.stations.find((s) => s.state === "now");
      liveSub = station ? `Now at: ${station.label}` : "All released after both checks";
    }
  }

  const examples = EXAMPLE_REPAIRS.filter((r) => r.stage !== "fixed").slice(0, 4);
  return (
    <section
      aria-labelledby="live-title"
      className="flex flex-col gap-1 border-t border-line pt-7"
      data-testid="live-repairs"
    >
      <h2 id="live-title" className="mb-3 text-[1.375rem] font-semibold tracking-[-0.02em]">
        Repairs on the line now
      </h2>
      <Row
        href="/demo"
        title={`${DEMO_HEADLINE.split(".")[0]} at Thandolwethu Primary`}
        sub={`${liveSub}. Live on Solana devnet.`}
        fill={liveFill}
      />
      {examples.map((r) => {
        const total = exampleTotal(r);
        return (
          <Row
            key={r.slug}
            href={`/cases/${r.slug}`}
            title={`${r.title}, ${r.schoolShort}`}
            sub={
              r.stage === "needs_funder" && total
                ? `Needs a funder for ${rand(total)}. Example`
                : r.stage === "objected"
                  ? "The school objected. Example"
                  : "Being fixed. Example"
            }
            fill={exampleProgress(r)}
            stopped={r.stage === "objected"}
          />
        );
      })}
    </section>
  );
}

function Row({
  href,
  title,
  sub,
  fill,
  stopped = false,
}: {
  href: string;
  title: string;
  sub: string;
  fill: number;
  stopped?: boolean;
}) {
  return (
    <Link
      href={href}
      className="grid items-center gap-3 border-b border-line py-4 text-ink sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
    >
      <span>
        <span className="block text-[1.05rem] font-semibold">{title}</span>
        <span className="text-sm text-muted">{sub}</span>
      </span>
      <MiniLine fill={fill} stopped={stopped} />
    </Link>
  );
}
