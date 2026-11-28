"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useAudience, workspaceFor } from "@/data/audience";
import { ApiError } from "@/data/errors";
import { signIn, signOut, useSession } from "@/data/session";
import { BENCH, CAST } from "@/features/demo/cast";
import { DEMO_PEOPLE, personForRole, type DemoPerson } from "@/features/demo/steps";
import { useBecome } from "./live";

const DOES: Record<DemoPerson, { who: string; does: string; cta: string }> = {
  school: {
    who: "School admin",
    does: "Reports the problem, can object, confirms the job is finished.",
    cta: "Be Nomvula",
  },
  funder: {
    who: "Funder, Vaal Ridge repair fund",
    does: "Locks the money for a repair she wants fixed.",
    cta: "Be Naledi",
  },
  contractor: {
    who: "Contractor, plumber",
    does: "Does the work and asks for each check.",
    cta: "Be Themba",
  },
  reviewer: {
    who: "Independent reviewer",
    does: "Works for none of them. Visits the site and signs each check.",
    cta: "Be Sipho",
  },
  public: {
    who: "Parent, journalist, you",
    does: "No sign-in. Watches the money and can release it after the wait.",
    cta: "Just look",
  },
};

/** Sign in: pick one of the five demo people, or sign in with email. */
export function DemoSignIn() {
  const audience = useAudience();
  const { become, busy, error } = useBecome();
  const current = audience.status === "ready" ? personForRole(audience.role) : null;

  return (
    <div className="page-wrap flex flex-wrap items-start gap-10 py-10 sm:gap-14 sm:py-14">
      <section className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
        <h1 className="text-[2.25rem] leading-none font-bold tracking-[-0.045em] sm:text-5xl">
          Who do you want to be?
        </h1>
        <p className="max-w-[600px] text-[1.1rem] leading-relaxed text-muted">
          Five demo people share one repair at Thandolwethu Primary. Pick one to see their page. You
          can switch from the top of any page.
        </p>
        <ul className="mt-3 border-t border-line" data-testid="demo-people">
          {DEMO_PEOPLE.map((p) => (
            <li key={p}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void become(p)}
                aria-current={p === current ? "true" : undefined}
                className={cn(
                  "grid w-full gap-x-5 gap-y-1 border-b border-line px-1 py-5 text-left text-ink hover:bg-sunken disabled:opacity-60 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-center",
                  p === current && "bg-brand-soft",
                )}
              >
                <span>
                  <span className="block text-[1.15rem] font-semibold">{CAST[p].name}</span>
                  <span className="text-sm text-muted">
                    {DOES[p].who}
                    {p === current ? " · you now" : ""}
                  </span>
                </span>
                <span className="leading-snug text-muted">{DOES[p].does}</span>
                <span className="font-semibold text-brand-strong">
                  {busy === p ? "Opening…" : DOES[p].cta}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="font-medium text-danger">
            {error}
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Demo people only. Sandbox rand. The transactions are real, on Solana devnet.
        </p>
      </section>
      <EmailSignIn />
    </div>
  );
}

function EmailSignIn() {
  const router = useRouter();
  const { session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return setError("Type your email and password.");
    setBusy(true);
    setError(null);
    try {
      const signedIn = await signIn(email, password);
      const person = personForRole(signedIn.user.role);
      router.push(
        person && person !== "public"
          ? BENCH[person]
          : (workspaceFor(signedIn.user.role)?.href ?? "/"),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "unauthenticated"
          ? "That email and password do not match an account."
          : "Something went wrong. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-6">
      <h2 className="text-[1.375rem] font-semibold tracking-[-0.02em]">Sign in with email</h2>
      <p className="text-[0.95rem] leading-normal text-muted">
        For real accounts. Funders can also lock money from an email wallet (Pollar) on the funding
        step, so they never handle crypto.
      </p>
      {session ? (
        <div className="flex flex-col gap-3">
          <p>
            Signed in as <strong className="font-semibold">{session.user.displayName}</strong>.
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 font-medium">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.co.za"
              autoComplete="username"
              className="h-12 rounded-xl border border-line-strong px-3.5 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-12 rounded-xl border border-line-strong px-3.5 font-normal"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={busy}>
            Sign in
          </Button>
        </form>
      )}
    </aside>
  );
}
