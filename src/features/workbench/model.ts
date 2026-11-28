/**
 * The money line as data: four stations (money in, locked on Solana, Check 1
 * to the supplier, Check 2 to the contractor), each with what happened there.
 * Built from the guided demo's real escrow, or from an example repair.
 * Pure: no React.
 */
import type { EscrowTx, PublicEscrow } from "@/features/escrow/api";
import { CAST, SUPPLIER_NAME } from "@/features/demo/cast";
import type { GuidedDemo } from "@/features/demo/client";
import type { DemoPerson, StepId, StepInfo } from "@/features/demo/steps";
import { exampleTotal, type ExampleRepair } from "./fixtures";

/** 300000 -> "R3 000". */
export function rand(cents: number): string {
  const whole = Math.round(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R${whole}`;
}

/** 32 -> "0:32", 75 -> "1:15". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type LineEvent = {
  text: string;
  link?: { href: string; label: string };
  strong?: boolean;
};

export type StationId = "in" | "locked" | "check1" | "check2";
export type StationState = "done" | "now" | "next" | "stopped";

export type Station = {
  id: StationId;
  /** The big line: "R5 000 in", "R3 000". */
  amount: string;
  /** The bold line under it: who or what. */
  label: string;
  state: StationState;
  events: LineEvent[];
};

export type CaseLine = {
  stations: Station[];
  /** How far the blue line reaches, 0 to 1. */
  fill: number;
};

function lastTx(
  txs: readonly EscrowTx[],
  steps: EscrowTx["step"][],
  index?: 0 | 1,
): EscrowTx | null {
  for (let i = txs.length - 1; i >= 0; i--) {
    const t = txs[i];
    if (steps.includes(t.step) && (index === undefined || t.index === index)) return t;
  }
  return null;
}

const SOLANA = "See it on Solana";

function day(at: string): string {
  const seconds = Number(at);
  const date = Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Marks the first station that is not done as "now", and the line's reach. */
function finish(stations: Omit<Station, "state">[], done: boolean[], stopped: boolean[]) {
  let current = -1;
  const withState: Station[] = stations.map((s, i) => {
    if (stopped[i]) return { ...s, state: "stopped" };
    if (done[i]) return { ...s, state: "done" };
    if (current < 0) {
      current = i;
      return { ...s, state: "now" };
    }
    return { ...s, state: "next" };
  });
  const doneCount = done.filter(Boolean).length;
  const fill = doneCount >= 4 ? 1 : (doneCount + 0.5) / 4;
  return { stations: withState, fill };
}

/** The guided demo's line, from the escrow as Solana devnet has it. */
export function guidedLine(demo: GuidedDemo, now: number): CaseLine {
  const escrow: PublicEscrow | null = demo.escrow;
  const funded = escrow?.funded === true;
  const tranches = escrow?.tranches ?? null;
  const txs = escrow?.transactions ?? [];
  const [m, l] = tranches
    ? [Number(tranches[0].amount), Number(tranches[1].amount)]
    : demo.template.amounts;
  const total = m + l;
  const held = escrow?.vault.amount != null ? Number(escrow.vault.amount) : funded ? total : 0;
  const lock = lastTx(txs, ["activate", "fund"]);

  const inEvents: LineEvent[] = funded
    ? [
        {
          text: lock ? `Locked on ${day(lock.at)}.` : "Locked.",
          link: lock ? { href: lock.url, label: SOLANA } : undefined,
        },
      ]
    : [{ text: "Not locked yet. The funder puts it in after the quote is checked." }];
  if (demo.budget) inEvents.push({ text: "Prices were checked against local shops." });

  const lockedEvents: LineEvent[] = funded
    ? [
        {
          text: `Split in two: ${rand(m)} for materials, ${rand(l)} for labour.`,
          link: escrow ? { href: escrow.escrow.url, label: "The account" } : undefined,
        },
      ]
    : [{ text: "Nothing is held yet." }];

  const checkEvents = (index: 0 | 1): LineEvent[] => {
    const t = tranches?.[index];
    const payee = index === 0 ? SUPPLIER_NAME : CAST.contractor.name;
    const what = index === 0 ? "the materials on site" : "the finished work";
    if (!funded || !t) return [{ text: "Waits for the money to be locked." }];
    const events: LineEvent[] = [];
    const claim = lastTx(txs, ["claim"], index);
    const verify = lastTx(txs, ["verify"], index);
    const release = lastTx(txs, ["release"], index);
    if (t.state === "Pending") {
      return [
        {
          text:
            index === 0
              ? "Not asked for yet. Themba asks when the materials are at the school."
              : "Not asked for yet. Themba asks when the toilets work, then the school confirms and Sipho checks again.",
        },
      ];
    }
    if (claim)
      events.push({
        text: `Themba asked for Check ${index + 1}.`,
        link: { href: claim.url, label: SOLANA },
      });
    if (verify)
      events.push({
        text: `Sipho Mokoena saw ${what} and signed.`,
        link: { href: verify.url, label: SOLANA },
      });
    if (t.state === "Claimed") events.push({ text: "Waiting for Sipho to check.", strong: true });
    if (t.state === "Verified") {
      const left = Number(t.challengeUntil) - now;
      events.push(
        left > 0
          ? { text: `Waiting ${clock(left)} for the school`, strong: true }
          : { text: "The wait is over. Anyone can release it.", strong: true },
      );
    }
    if (t.state === "Released")
      events.push({
        text: `Released to ${payee}.`,
        link: release ? { href: release.url, label: SOLANA } : undefined,
      });
    if (t.state === "Disputed")
      events.push({ text: "The school objected. The money is stopped.", strong: true });
    if (t.state === "Refunded") events.push({ text: "Returned to the funder." });
    return events;
  };

  const s0 = tranches?.[0]?.state;
  const s1 = tranches?.[1]?.state;
  return finish(
    [
      { id: "in", amount: `${rand(total)} in`, label: `${CAST.funder.name}, funder`, events: inEvents },
      {
        id: "locked",
        amount: funded ? `${rand(held)} locked` : "Not locked",
        label: "On Solana, not with us",
        events: lockedEvents,
      },
      {
        id: "check1",
        amount: rand(m),
        label: `Check 1: materials, to ${SUPPLIER_NAME}`,
        events: checkEvents(0),
      },
      {
        id: "check2",
        amount: rand(l),
        label: `Check 2: work done, to ${CAST.contractor.name}`,
        events: checkEvents(1),
      },
    ],
    [funded, funded, s0 === "Released", s1 === "Released"],
    [false, false, s0 === "Disputed" || s0 === "Refunded", s1 === "Disputed" || s1 === "Refunded"],
  );
}

/** An example repair's line. No links: nothing here ran on Solana. */
export function exampleLine(r: ExampleRepair): CaseLine {
  const total = exampleTotal(r);
  const [m, l] = r.split ?? [0, 0];
  const funded = ["check1", "check2", "objected", "fixed"].includes(r.stage);
  const c1 = ["check2", "objected", "fixed"].includes(r.stage);
  const c2 = r.stage === "fixed";
  return finish(
    [
      {
        id: "in",
        amount: total ? `${rand(total)} in` : "No quote yet",
        label: funded ? "A funder, Vaal Ridge repair fund" : "Waiting for a funder",
        events: [{ text: total ? "Prices checked against local shops." : "A contractor will quote first." }],
      },
      {
        id: "locked",
        amount: funded && total ? `${rand(total)} locked` : "Not locked",
        label: "On Solana, not with us",
        events: [
          {
            text: r.split
              ? `Split in two: ${rand(m)} for materials, ${rand(l)} for labour.`
              : "Nothing is held yet.",
          },
        ],
      },
      {
        id: "check1",
        amount: r.split ? rand(m) : "Check 1",
        label: "Check 1: materials, to the supplier",
        events: [{ text: c1 ? "Checked and released." : "Not asked for yet." }],
      },
      {
        id: "check2",
        amount: r.split ? rand(l) : "Check 2",
        label: "Check 2: work done, to the contractor",
        events: [
          {
            text: c2
              ? `Checked on ${r.checkedOn} and released.`
              : r.stage === "objected"
                ? "The school objected. A dispute reviewer is looking at it."
                : "Not asked for yet.",
            strong: r.stage === "objected",
          },
        ],
      },
    ],
    [funded, funded, c1, c2],
    [false, false, false, r.stage === "objected"],
  );
}

/** The explainer line on the home page. */
export const HOME_LINE: CaseLine = {
  fill: 0.37,
  stations: [
    {
      id: "in",
      amount: "R5 000",
      label: "A funder puts it in",
      state: "done",
      events: [{ text: "For one repair, with prices already checked against local shops." }],
    },
    {
      id: "locked",
      amount: "Locked",
      label: "It waits on Solana",
      state: "done",
      events: [{ text: "Not in our bank account. Nobody can move it without a signed check." }],
    },
    {
      id: "check1",
      amount: "R3 000",
      label: "Materials checked, supplier gets it",
      state: "now",
      events: [
        {
          text: "A reviewer sees the materials on site and signs. A short wait lets the school object.",
        },
      ],
    },
    {
      id: "check2",
      amount: "R2 000",
      label: "Work checked, builder gets it",
      state: "next",
      events: [{ text: "The same again for the labour, once the school agrees the job is done." }],
    },
  ],
};

/** The live case's status for one person's list, in plain words. */
export function liveStatus(
  step: StepInfo | null,
  person: DemoPerson,
): { text: string; tone: "need" | "muted" | "done" | "stopped" } {
  if (!step) return { text: "Not started", tone: "muted" };
  const mine = step.person === person;
  const id: StepId = step.id;
  if (id === "done") return { text: "Fixed and checked", tone: "done" };
  if (id === "off_path") return { text: "Stopped", tone: "stopped" };
  if (id === "chain_unreadable") return { text: "Reading Solana…", tone: "muted" };
  const need = (text: string) => ({ text: `Needs you: ${text}`, tone: "need" as const });
  if (person === "school") {
    if (id === "report") return need("finish the report");
    if (id === "scope") return need("check the quote");
    if (id === "release1") return need("materials arrived");
    if (id === "school2") return need("is it finished?");
  }
  if (mine) {
    if (id === "fund") return need("lock the money");
    if (id === "claim1") return need("ask for Check 1");
    if (id === "claim2") return need("ask for Check 2");
    if (id === "review1") return need("sign Check 1");
    if (id === "review2") return need("sign Check 2");
  }
  const muted = (text: string) => ({ text, tone: "muted" as const });
  switch (id) {
    case "report":
    case "scope":
      return muted("Being reported");
    case "fund":
      return muted("Waiting for a funder");
    case "claim1":
      return muted("Being fixed: materials on the way");
    case "review1":
      return muted("Being fixed: waiting for Check 1");
    case "release1":
      return muted("Check 1 signed: short wait");
    case "proof":
    case "claim2":
      return muted("Being fixed: work under way");
    case "school2":
      return muted("Waiting for the school");
    case "review2":
      return muted("Being fixed: waiting for Check 2");
    case "release2":
      return muted("Check 2 signed: short wait");
  }
  return muted(step.title);
}
