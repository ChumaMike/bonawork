import { cn } from "@/components/ui/cn";
import type { CaseLine, LineEvent, Station, StationState } from "./model";

const DOT: Record<StationState, string> = {
  done: "bg-brand border-canvas",
  now: "bg-surface border-accent",
  next: "bg-surface border-line-strong",
  stopped: "bg-surface border-danger",
};

function Dot({ state, small = false }: { state: StationState; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block shrink-0 rounded-full border-4",
        small ? "size-3.5 border-[3px]" : "size-[26px]",
        DOT[state],
      )}
    />
  );
}

function EventLine({ event, onAmber }: { event: LineEvent; onAmber: boolean }) {
  return (
    <p
      className={cn(
        "border-t pt-2.5 text-sm leading-normal",
        onAmber ? "border-accent/25 text-accent-strong" : "border-line text-muted",
        event.strong && "font-semibold",
      )}
    >
      {event.text}
      {event.link ? (
        <>
          {" "}
          <a
            href={event.link.href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-strong underline underline-offset-2"
          >
            {event.link.label}
            <span className="sr-only"> (opens Solana Explorer)</span>
          </a>
        </>
      ) : null}
    </p>
  );
}

const STATE_WORD: Record<StationState, string> = {
  done: "done",
  now: "happening now",
  next: "still to come",
  stopped: "stopped",
};

/**
 * The money line: four stations along one line, across the page on a wide
 * screen and down it on a phone. The blue part is how far the money has
 * moved. Each station lists what happened there.
 */
export function MoneyLine({
  line,
  size = "md",
  label = "The money line",
  events = true,
}: {
  line: CaseLine;
  /** `lg`: the home page's big numbers. */
  size?: "md" | "lg";
  label?: string;
  /** Show each station's events (the case page) or only its sentence. */
  events?: boolean;
}) {
  const pct = `${Math.round(line.fill * 100)}%`;
  return (
    <section aria-label={label} className="relative" data-testid="money-line">
      {/* The track and the blue reach, across: wide screens only. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-[11px] hidden h-1 bg-line lg:block" />
      <div
        aria-hidden="true"
        className="absolute left-0 top-[11px] hidden h-1 bg-brand lg:block"
        style={{ width: pct }}
      />
      <ol className="relative grid gap-0 lg:grid-cols-4 lg:gap-6">
        {line.stations.map((station, index) => (
          <StationItem
            key={station.id}
            station={station}
            last={index === line.stations.length - 1}
            nextDone={line.stations[index + 1]?.state === "done"}
            size={size}
            events={events}
          />
        ))}
      </ol>
    </section>
  );
}

function StationItem({
  station,
  last,
  nextDone,
  size,
  events,
}: {
  station: Station;
  last: boolean;
  nextDone: boolean;
  size: "md" | "lg";
  events: boolean;
}) {
  const amber = station.state === "now" && events;
  const amountTone =
    station.id === "locked" && station.state === "done"
      ? "text-brand"
      : station.state === "next"
        ? "text-muted"
        : "text-ink";
  return (
    <li
      data-station={station.id}
      data-state={station.state}
      className="relative grid grid-cols-[26px_minmax(0,1fr)] gap-x-3 pb-6 lg:flex lg:flex-col lg:gap-2.5 lg:pb-0"
    >
      {/* The track, down: phones only. */}
      {last ? null : (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-6 bottom-0 left-[11px] w-1 lg:hidden",
            station.state === "done" && nextDone ? "bg-brand" : "bg-line",
          )}
        />
      )}
      <Dot state={station.state} />
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2.5",
          amber && "rounded-2xl bg-accent-soft p-3.5 lg:-mx-3.5 lg:mt-[-2px]",
        )}
      >
        <div>
          <p
            className={cn(
              "leading-none font-bold tracking-[-0.04em] tabular-nums",
              size === "lg" ? "text-[2.5rem] sm:text-[3.25rem]" : "text-[1.6rem] sm:text-[2.1rem]",
              amountTone,
            )}
          >
            {station.amount}
          </p>
          <p className={cn("mt-1.5 font-semibold", size === "lg" ? "text-[1.05rem]" : "text-[0.95rem]")}>
            {station.label}
            <span className="sr-only">, {STATE_WORD[station.state]}</span>
          </p>
        </div>
        {events ? (
          station.events.map((e, i) => <EventLine key={i} event={e} onAmber={amber} />)
        ) : (
          <p className="text-[0.95rem] leading-normal text-muted">
            {station.events.map((e) => e.text).join(" ")}
          </p>
        )}
      </div>
    </li>
  );
}

/** A small line for a list row: where one repair is, 0 to 1. */
export function MiniLine({ fill, stopped = false }: { fill: number; stopped?: boolean }) {
  const pct = `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`;
  return (
    <span aria-hidden="true" className="relative block h-3.5 w-full">
      <span className="absolute inset-x-0 top-[5px] h-1 rounded-full bg-line" />
      <span className="absolute left-0 top-[5px] h-1 rounded-full bg-brand" style={{ width: pct }} />
      <span
        className={cn(
          "absolute top-0 size-3.5 -translate-x-1/2 rounded-full border-[3px] bg-surface",
          stopped ? "border-danger" : fill >= 1 ? "border-brand bg-brand" : fill > 0 ? "border-accent" : "border-line-strong",
        )}
        style={{ left: fill <= 0 ? "7px" : fill >= 1 ? "calc(100% - 7px)" : pct }}
      />
    </span>
  );
}

/** The split of one case's money: Check 1 and Check 2 as two segments. */
export function SplitBar({
  split,
  lit = [false, false],
  size = "md",
}: {
  split: [number, number];
  /** Which segment is the one being checked now. */
  lit?: [boolean, boolean];
  size?: "sm" | "md";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex gap-[3px] overflow-hidden rounded-md", size === "sm" ? "h-2" : "h-3")}
    >
      <span style={{ flex: `${split[0]} 1 0` }} className={lit[0] ? "bg-accent" : "bg-sun"} />
      <span style={{ flex: `${split[1]} 1 0` }} className={lit[1] ? "bg-accent" : "bg-sun"} />
    </div>
  );
}
