"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAudience } from "@/data/audience";
import { signOut } from "@/data/session";
import { BENCH, CAST } from "@/features/demo/cast";
import {
  refreshGuided,
  startGuided,
  switchPerson,
  useGuided,
  type GuidedDemo,
} from "@/features/demo/client";
import { useServerClock } from "@/features/demo/demo-screen";
import { personForRole, type DemoPerson, type StepInfo } from "@/features/demo/steps";

/** The guided demo case as this browser has it, with a ticking server clock. */
export function useLive() {
  const guided = useGuided();
  const audience = useAudience();
  const skew = guided.status === "ready" ? guided.clockSkew : 0;
  const now = useServerClock(skew);
  const demo: GuidedDemo | null = guided.status === "ready" ? guided.demo : null;
  const step: StepInfo | null = guided.status === "ready" ? guided.step : null;
  const current = audience.status === "ready" ? personForRole(audience.role) : null;

  // Steps that move on by themselves (the reviewer, the 60 seconds) are read again.
  useEffect(() => {
    if (!step) return;
    if (!["release1", "release2", "review1", "review2", "chain_unreadable"].includes(step.id))
      return;
    const timer = setInterval(() => void refreshGuided(), 6000);
    return () => clearInterval(timer);
  }, [step]);

  return {
    guided,
    demo,
    step,
    now,
    current,
    loading: guided.status === "loading" || audience.status === "loading",
  };
}

/**
 * Becoming one of the demo people: starts the demo first when this browser
 * has none, then signs in as that person and opens their page.
 */
export function useBecome() {
  const router = useRouter();
  const guided = useGuided();
  const [busy, setBusy] = useState<DemoPerson | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function become(person: DemoPerson, target: string = BENCH[person]) {
    setBusy(person);
    setError(null);
    try {
      if (guided.status === "ready") {
        if (!guided.demo) await startGuided(false);
        await switchPerson(person);
      } else if (person === "public") {
        await signOut();
      } else {
        throw new Error("The demo is switched off on this server. Sign in with email instead.");
      }
      await refreshGuided();
      router.push(target);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return { become, busy, error };
}

/** "Nothing for you now", with the way to the person whose turn it is. */
export function NotYourTurn({ step, person }: { step: StepInfo; person: DemoPerson }) {
  const { become, busy, error } = useBecome();
  const next = step.person;
  if (!next) return null;
  return (
    <div className="flex flex-col gap-4" data-testid="not-your-turn">
      <h2 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.035em] sm:text-[2.1rem]">
        Nothing for you right now
      </h2>
      <p className="max-w-prose text-[1.05rem] text-muted">
        Next: {next === "public" ? "anyone" : CAST[next].name} · {step.title.toLowerCase()}.{" "}
        {person === next ? "" : step.why}
      </p>
      <Button
        size="lg"
        className="w-full sm:w-auto sm:self-start"
        loading={busy === next}
        onClick={() => void become(next)}
      >
        {next === "public" ? "Watch as the public" : `Continue as ${CAST[next].name}`}
      </Button>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Shown when this browser has no demo case yet. */
export function StartHere({ person }: { person: DemoPerson }) {
  const { become, busy, error } = useBecome();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.035em]">
        No demo repair yet
      </h2>
      <p className="max-w-prose text-muted">
        Start the demo to get the toilets case at Thandolwethu Primary. You play all five people
        in turn.
      </p>
      <Button
        size="lg"
        className="w-full sm:w-auto sm:self-start"
        loading={busy !== null}
        onClick={() => void become(person)}
      >
        Start the demo
      </Button>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
