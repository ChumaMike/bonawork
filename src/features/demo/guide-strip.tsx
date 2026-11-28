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
import { personForRole, stepCounter, stepHref, type DemoPerson } from "./steps";

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
 * The guide strip: a slim bar on every page but the public case page while
 * this browser runs the guided demo. "Step N of 7", what it is, a "Next step"
 * button that switches to the right demo person and opens their page, and
 * "Restart demo". Switching person is in the header.
 */
export function GuideStrip() {
  const guided = useGuided();
  const audience = useAudience();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  if (pathname === "/demo") return null;
  const demo = guided.demo;
  const current = audience.status === "ready" ? personForRole(audience.role) : null;
  const href = stepHref(step.id);
  const here = pathname === href;
  const ready = step.person === null || step.person === current;

  async function go(person: DemoPerson | null, target: string) {
    setBusy(true);
    setError(null);
    try {
      if (person && person !== current) await switchPerson(person);
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
      className="demo-strip no-print border-b border-line bg-brand-soft text-ink"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-6">
        <p className="min-w-0 flex-[1_1_320px]">
          <span className="text-muted">Demo · {stepCounter(step)}:</span>{" "}
          <span className="font-semibold">{step.title}</span>
          <span className="hidden text-muted md:inline">
            {" "}
            · <MiniPath states={states} funded={demo.escrow?.funded === true} amounts={demo.template.amounts} />
          </span>
        </p>
        {here && ready ? (
          <span className="font-semibold">Your turn: below.</span>
        ) : (
          <Button size="sm" loading={busy} onClick={() => go(step.person, href)}>
            Next step
            {step.person && step.person !== current
              ? `: ${step.person === "public" ? "the public" : CAST[step.person].name}`
              : ""}
          </Button>
        )}
        <Button size="sm" variant="quiet" disabled={busy} onClick={restart}>
          Restart demo
        </Button>
        {error ? (
          <p role="alert" className="w-full font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
