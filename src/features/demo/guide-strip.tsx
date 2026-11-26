"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useAudience } from "@/data/audience";
import "./demo.css";
import { CAST } from "./cast";
import { refreshGuided, startGuided, switchPerson, useGuided } from "./client";
import { rand } from "./money-path";
import {
  DEMO_PEOPLE,
  DEMO_PERSON_LABEL,
  personForRole,
  stepCounter,
  stepHref,
  type DemoPerson,
} from "./steps";

/** One line of where the money is, for pages other than the guided page. */
function MiniPath({
  states,
  funded,
  amounts,
}: {
  states: string[] | null;
  funded: boolean;
  amounts: [number, number];
}) {
  const part = (i: 0 | 1, to: string) => {
    const s = states?.[i];
    const released = s === "Released";
    return (
      <span className={released ? "font-semibold text-ink" : undefined}>
        <Icon
          name={released ? "lockOpen" : "lock"}
          className="inline size-3.5 align-[-2px]"
        />{" "}
        Check {i + 1} {rand(amounts[i])} {released ? `released to the ${to}` : "held"}
      </span>
    );
  };
  if (!funded) return <span>No money held yet</span>;
  return (
    <>
      {part(0, "supplier")}
      <span aria-hidden="true">·</span>
      {part(1, "contractor")}
    </>
  );
}

/**
 * The guide strip: on every page while this browser runs the guided demo.
 * "Step N of 7", why it matters, a "Next step" button that switches to the
 * right demo person and opens the right screen, "Demo: switch person" and
 * "Restart demo".
 */
export function GuideStrip() {
  const guided = useGuided();
  const audience = useAudience();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Read the demo again whenever the visitor moves to another page.
  useEffect(() => {
    void refreshGuided();
  }, [pathname]);

  const step = guided.status === "ready" ? guided.step : null;
  useEffect(() => {
    if (!step || pathname === "/demo") return;
    if (!["review1", "review2", "release1", "release2"].includes(step.id)) return;
    const timer = setInterval(() => void refreshGuided(), 8000);
    return () => clearInterval(timer);
  }, [step, pathname]);

  if (guided.status !== "ready" || !guided.demo || !step) return null;
  const demo = guided.demo;
  const current = audience.status === "ready" ? personForRole(audience.role) : null;
  const href = stepHref(step.id, demo.caseId);
  const onGuidedPage = pathname === "/demo";
  const here = pathname === href.split("?")[0];
  const ready = step.person === null || step.person === current;

  async function go(person: DemoPerson | null, target: string) {
    setBusy(true);
    setError(null);
    try {
      if (person && person !== current) await switchPerson(person);
      setOpen(false);
      router.push(target);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    setBusy(true);
    setError(null);
    try {
      await startGuided(true);
      router.push("/demo");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const states = demo.escrow?.tranches?.map((t) => t.state) ?? null;

  return (
    <aside
      aria-label="Guided demo"
      data-testid="guide-strip"
      data-step={step.id}
      className="demo-strip no-print border-b-2 border-brand bg-brand-soft text-ink"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
        {onGuidedPage ? null : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.08em] text-brand-strong uppercase">
                Demo · {stepCounter(step)}
              </p>
              <p className="font-display text-lg leading-snug font-semibold">
                {step.title}
              </p>
              <p className="text-[0.95rem]">{step.why}</p>
            </div>
            {here && ready ? (
              <p className="shrink-0 text-sm font-semibold">Your turn: below.</p>
            ) : (
              <Button
                className="w-full shrink-0 sm:w-auto"
                loading={busy}
                onClick={() => go(step.person, href)}
              >
                Next step
                {step.person && step.person !== current
                  ? `: ${DEMO_PERSON_LABEL[step.person]}`
                  : ""}
                <Icon name="arrowRight" className="size-5" />
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-x-2 text-muted">
            <MiniPath
              states={states}
              funded={demo.escrow?.funded === true}
              amounts={demo.template.amounts}
            />
          </p>
          <span className="flex-1" />
          <p>
            <span className="text-xs font-semibold tracking-[0.12em] uppercase">
              Demo person
            </span>{" "}
            <span className="font-semibold">
              {current
                ? `${DEMO_PERSON_LABEL[current]}: ${CAST[current].name}`
                : "Someone else"}
            </span>
          </p>
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={open}
            aria-controls="demo-people"
            onClick={() => setOpen((o) => !o)}
          >
            Demo: switch person
          </Button>
          <Button size="sm" variant="quiet" loading={busy && !open} onClick={restart}>
            Restart demo
          </Button>
        </div>

        {open ? (
          <ul id="demo-people" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {DEMO_PEOPLE.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={p === current}
                  onClick={() => go(p, pathname === "/demo" ? "/demo" : pathname)}
                  className="flex min-h-14 w-full flex-col items-start justify-center rounded-xl border-2 border-line bg-surface px-3 py-2 text-left aria-pressed:border-brand disabled:opacity-50"
                >
                  <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    {DEMO_PERSON_LABEL[p]}
                  </span>
                  <span className="font-semibold">{CAST[p].name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
