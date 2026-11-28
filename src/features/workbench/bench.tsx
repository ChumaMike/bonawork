"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { PhotoName } from "@/components/media/manifest";
import { Photo } from "@/components/media/photo";
import { cn } from "@/components/ui/cn";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { CAST, SUPPLIER_NAME } from "@/features/demo/cast";
import type { GuidedDemo } from "@/features/demo/client";
import type { DemoPerson } from "@/features/demo/steps";
import { MoneyLine, SplitBar } from "./money-line";
import { rand, type CaseLine } from "./model";

/**
 * A workbench: a rail on the left with the case and its people, and the
 * person's one task on the right. On a phone the task comes first and the
 * rail follows it.
 */
export function Bench({
  rail,
  children,
  summary,
}: {
  rail: ReactNode;
  children: ReactNode;
  /** A short version of the rail shown above the task on a phone. */
  summary?: ReactNode;
}) {
  return (
    <div className="flex flex-col lg:min-h-[calc(100vh-60px)] lg:flex-row">
      <aside className="order-2 flex shrink-0 flex-col border-t border-line bg-surface lg:order-1 lg:w-[400px] lg:border-t-0 lg:border-r xl:w-[420px]">
        {rail}
      </aside>
      <section className="order-1 flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 lg:order-2 lg:px-10 lg:pt-6 lg:pb-10">
        {summary ? <div className="lg:hidden">{summary}</div> : null}
        {children}
      </section>
    </div>
  );
}

const TONE_TEXT = {
  need: "font-semibold text-accent",
  muted: "text-muted",
  done: "font-semibold text-st-verified",
  stopped: "font-semibold text-danger",
} as const;

export type RowTone = keyof typeof TONE_TEXT;

/** One problem in a rail list: thumbnail, title, a line under it and a status. */
export function RailRow({
  href,
  onClick,
  selected = false,
  photo,
  done = false,
  title,
  sub,
  tag,
  status,
  amount,
}: {
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  photo?: PhotoName;
  /** Fixed and checked: a tick instead of a photo. */
  done?: boolean;
  title: string;
  sub?: string;
  tag?: { text: string; tone: "danger" | "accent" };
  status?: { text: string; tone: RowTone };
  amount?: string;
}) {
  const body = (
    <>
      {done ? (
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-[10px] bg-st-verified-soft text-xl font-bold text-st-verified"
        >
          ✓
        </span>
      ) : photo ? (
        <Photo name={photo} alt="" shape="free" sizes="56px" className="size-14 rounded-[10px]" />
      ) : (
        <span aria-hidden="true" className="size-14 rounded-[10px] bg-sunken" />
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[0.95rem] leading-snug font-semibold">{title}</span>
        {sub ? <span className="text-[0.8rem] text-muted">{sub}</span> : null}
        {tag ? (
          <span
            className={cn(
              "text-xs font-semibold",
              tag.tone === "danger" ? "text-danger" : "text-accent",
            )}
          >
            {tag.text}
          </span>
        ) : null}
        {status ? <span className={cn("text-[0.8rem]", TONE_TEXT[status.tone])}>{status.text}</span> : null}
      </span>
      {amount ? <strong className="text-[0.95rem] whitespace-nowrap">{amount}</strong> : <span />}
    </>
  );
  const className = cn(
    "grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left text-ink sm:px-6",
    selected ? "border-l-4 border-brand bg-brand-soft pl-3 sm:pl-5" : "border-b border-line hover:bg-sunken",
  );
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={className}>
        {body}
      </button>
    );
  return (
    <Link href={href ?? "#"} aria-current={selected ? "true" : undefined} className={className}>
      {body}
    </Link>
  );
}

/** A small titled list in the rail ("Your other jobs"). */
export function RailList({
  title,
  note,
  rows,
}: {
  title: string;
  note?: string;
  rows: { label: string; status: string; tone: RowTone; href?: string }[];
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3.5">
      <h2 className="mb-1 text-base font-semibold tracking-normal">{title}</h2>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0"
        >
          {row.href ? (
            <Link href={row.href} className="underline-offset-2 hover:underline">
              {row.label}
            </Link>
          ) : (
            <span>{row.label}</span>
          )}
          <span className={cn("text-right whitespace-nowrap", TONE_TEXT[row.tone])}>{row.status}</span>
        </div>
      ))}
      {note ? <p className="pt-1 text-xs text-faint">{note}</p> : null}
    </div>
  );
}

/** Who is on the case. `me` is shown as "You". */
export function PeopleRows({ me }: { me?: DemoPerson }) {
  const rows: [string, string][] = [
    ["School", me === "school" ? "You" : CAST.school.name],
    ["Funder", me === "funder" ? "You" : CAST.funder.name],
    ["Contractor", me === "contractor" ? "You" : CAST.contractor.name],
    ["Supplier", SUPPLIER_NAME],
    ["Reviewer", me === "reviewer" ? "You" : CAST.reviewer.name],
  ];
  return (
    <dl className="flex flex-col gap-2 border-t border-line pt-3.5 text-sm">
      {rows.map(([role, name]) => (
        <div key={role} className="flex justify-between gap-3">
          <dt className="text-muted">{role}</dt>
          <dd className="text-right">{name}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The case at the top of the contractor's and the reviewer's rail. */
export function CaseRail({
  demo,
  me,
  lit,
  children,
}: {
  demo: GuidedDemo;
  me: DemoPerson;
  /** Which check is being worked on, for the split bar. */
  lit: [boolean, boolean];
  children?: ReactNode;
}) {
  const [m, l] = splitOf(demo);
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <Photo
        name="toilets_before"
        alt="The toilet block at Thandolwethu Primary"
        shape="free"
        sizes="(min-width: 1024px) 400px, 100vw"
        className="h-44 w-full rounded-xl"
      />
      <p className="-mt-3 text-xs text-faint">Example photo for the demo</p>
      <div>
        <p className="text-[0.8rem] text-muted">
          {demo.schoolName} · {demo.reference}
        </p>
        <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-[-0.03em]">
          Two of four toilets leak
        </h1>
      </div>
      <MoneySplit demo={demo} me={me} lit={lit} split={[m, l]} />
      <PeopleRows me={me} />
      {children}
    </div>
  );
}

export function splitOf(demo: GuidedDemo): [number, number] {
  const t = demo.escrow?.tranches;
  return t ? [Number(t[0].amount), Number(t[1].amount)] : demo.template.amounts;
}

function MoneySplit({
  demo,
  me,
  lit,
  split,
}: {
  demo: GuidedDemo;
  me: DemoPerson;
  lit: [boolean, boolean];
  split: [number, number];
}) {
  const funded = demo.escrow?.funded === true;
  const key = (on: boolean) => (
    <span
      aria-hidden="true"
      className={cn("mr-1.5 inline-block size-2.5 rounded-[2px]", on ? "bg-accent" : "bg-sun")}
    />
  );
  return (
    <div className="flex flex-col gap-2.5">
      <SplitBar split={split} lit={lit} />
      <div className="flex justify-between gap-3 text-[0.95rem]">
        <span>
          {key(lit[0])}Check 1, to {me === "contractor" ? SUPPLIER_NAME : "the supplier"}
        </span>
        <strong className="font-semibold">{rand(split[0])}</strong>
      </div>
      <div className="flex justify-between gap-3 text-[0.95rem]">
        <span>
          {key(lit[1])}Check 2, {me === "contractor" ? "to you" : "labour"}
        </span>
        <strong className="font-semibold">{rand(split[1])}</strong>
      </div>
      <div className="flex justify-between gap-3 border-t border-line pt-2.5 text-[0.95rem]">
        <span>{funded ? "Locked on Solana" : "Not locked yet"}</span>
        <strong className="font-semibold">{rand(split[0] + split[1])}</strong>
      </div>
      {demo.escrow ? (
        <a
          href={demo.escrow.escrow.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-brand-strong underline underline-offset-2"
        >
          See the account on Solana
        </a>
      ) : null}
    </div>
  );
}

/** The phone summary above the task: thumbnail, title and the split. */
export function CaseSummary({ demo, lit }: { demo: GuidedDemo; lit: [boolean, boolean] }) {
  const split = splitOf(demo);
  const funded = demo.escrow?.funded === true;
  return (
    <div className="-mx-4 -mt-5 flex items-center gap-3 border-b border-line bg-surface px-4 py-3.5 sm:-mx-8 sm:px-8">
      <Photo name="toilets_before" alt="" shape="free" sizes="64px" className="size-16 rounded-[10px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="font-semibold">Toilets, {demo.schoolName}</p>
        <SplitBar split={split} lit={lit} size="sm" />
        <p className="text-[0.8rem] text-muted">
          {rand(split[0] + split[1])} {funded ? "locked" : "not locked yet"}
          {lit[0] ? ` · ${rand(split[0])} on this check` : lit[1] ? ` · ${rand(split[1])} on this check` : ""}
        </p>
      </div>
    </div>
  );
}

type TabId = "task" | "history" | "papers";

/** Your task / What happened / Papers, for the live case. */
export function CaseTabs({
  demo,
  line,
  task,
}: {
  demo: GuidedDemo;
  line: CaseLine;
  task: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("task");
  const txs = demo.escrow?.transactions ?? [];
  const papers = txs.length + (demo.budget ? 1 : 0) + 1;
  return (
    <div>
      <Tabs
        label="Case sections"
        idPrefix="bench"
        value={tab}
        onChange={setTab}
        className="sm:max-w-md"
        tabs={[
          { id: "task", label: "Your task" },
          { id: "history", label: "What happened" },
          { id: "papers", label: "Papers", count: papers },
        ]}
      />
      <TabPanel id="task" idPrefix="bench" active={tab === "task"}>
        <div className="flex flex-col gap-5">{task}</div>
      </TabPanel>
      <TabPanel id="history" idPrefix="bench" active={tab === "history"}>
        <MoneyLine line={line} label="What happened to the money" />
      </TabPanel>
      <TabPanel id="papers" idPrefix="bench" active={tab === "papers"}>
        <Papers demo={demo} />
      </TabPanel>
    </div>
  );
}

const TX_LABEL: Record<string, string> = {
  create: "Case account made",
  cash_in: "Sandbox rand issued to the funder",
  fund: "Money sent to the case account",
  activate: "Money locked",
  claim: "Check asked for",
  verify: "Check signed by the reviewer",
  release: "Money released",
  refund: "Money returned to the funder",
  sweep: "Leftover returned",
  reassign_reviewer: "Reviewer changed",
};

function Papers({ demo }: { demo: GuidedDemo }) {
  const txs = demo.escrow?.transactions ?? [];
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-normal">The report</h2>
        <p className="max-w-prose text-[0.95rem] text-muted">{demo.description}</p>
      </section>
      {demo.budget ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-normal">The quote, checked against shops</h2>
          <ul className="flex flex-col text-[0.95rem]">
            {demo.budget.lines.map((l) => (
              <li key={l.description} className="flex justify-between gap-3 border-b border-line py-2">
                <span>
                  {l.quantity} × {l.description}
                </span>
                <span className="tabular-nums">{rand(l.quantity * l.unitPriceCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-normal">On Solana devnet</h2>
        {txs.length === 0 ? (
          <p className="text-[0.95rem] text-muted">Nothing sent yet.</p>
        ) : (
          <ul className="flex flex-col text-[0.95rem]">
            {txs.map((t) => (
              <li key={t.signature} className="flex flex-wrap justify-between gap-x-3 border-b border-line py-2">
                <span>
                  {TX_LABEL[t.step] ?? t.step}
                  {t.index !== undefined ? `, Check ${t.index + 1}` : ""}
                </span>
                <a
                  href={t.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-strong underline underline-offset-2"
                >
                  See it on Solana
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A photo with a caption under it. */
export function ProofPhoto({
  photo,
  alt,
  caption,
  example = false,
}: {
  photo: PhotoName;
  alt: string;
  caption: string;
  example?: boolean;
}) {
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <Photo name={photo} alt={alt} shape="free" sizes="(min-width: 1024px) 240px, 33vw" className="h-28 w-full rounded-xl sm:h-36" />
      <figcaption className="text-[0.8rem] text-muted">
        {caption}
        {example ? <span className="block text-faint">Example photo for the demo</span> : null}
      </figcaption>
    </figure>
  );
}

/** The big question at the top of a task. */
export function TaskHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2
        className="text-[1.75rem] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[2.1rem]"
        data-testid="task-title"
      >
        {title}
      </h2>
      {children ? <div className="max-w-prose text-[1.05rem] leading-normal text-muted">{children}</div> : null}
    </div>
  );
}

/** A small green panel: what Bona Guardian found. */
export function GuardianNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-st-verified-soft p-4 text-[0.95rem] leading-normal text-ink">
      {children}
    </div>
  );
}
