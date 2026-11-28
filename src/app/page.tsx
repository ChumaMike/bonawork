import Link from "next/link";
import { LiveRepairs } from "@/features/workbench/home";
import { MoneyLine } from "@/features/workbench/money-line";
import { HOME_LINE } from "@/features/workbench/model";

/**
 * The home page: one line that shows how money moves, and the repairs on it
 * now. The long landing page is at /about.
 */
export default function Home() {
  return (
    <div className="page-wrap flex flex-col gap-12 pt-12 pb-14 sm:gap-16 sm:pt-[72px]">
      <section className="flex max-w-[760px] flex-col gap-5">
        <h1 className="text-[2.6rem] leading-[0.98] font-bold tracking-[-0.045em] sm:text-[4.25rem]">
          Every rand waits for a check.
        </h1>
        <p className="text-[1.1rem] leading-relaxed text-muted sm:text-[1.2rem]">
          Funders pay for school repairs. The money is locked on Solana and moves down this line
          only when someone independent has checked the work.
        </p>
      </section>
      <MoneyLine line={HOME_LINE} size="lg" label="How money moves" events={false} />
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/demo"
          className="flex min-h-[54px] items-center rounded-full bg-brand px-6 font-semibold text-on-brand hover:bg-brand-strong"
        >
          Follow a real repair
        </Link>
        <span className="text-sm text-muted">
          Two minutes. Sandbox rand, real transactions on Solana devnet.
        </span>
      </div>
      <LiveRepairs />
      <p className="text-sm text-muted">
        <Link href="/about" className="underline underline-offset-2">
          More about BonaWork
        </Link>{" "}
        ·{" "}
        <Link href="/verify" className="underline underline-offset-2">
          Check a proof
        </Link>
      </p>
    </div>
  );
}
