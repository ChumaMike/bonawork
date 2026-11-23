"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Photo } from "@/components/media/photo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { Loading, Notice } from "@/components/ui/page";
import { getApi } from "@/data/api";
import { ApiError } from "@/data/errors";
import { signIn, signInAsDemo, signOut, useSession } from "@/data/session";
import { useQuery } from "@/data/use-query";
import type { DemoAccount, SessionRole } from "@/data/types";
import { useMessages } from "@/i18n";
import { safeNext } from "@/lib/safe-next";

const HOME: Record<SessionRole, string> = {
  school_admin: "/admin",
  independent_reviewer: "/reviewer",
  district_official: "/issues",
  reporter: "/",
  buyer: "/buyer",
  supplier: "/supplier",
  receiving_officer: "/receiving",
  payment_approver: "/payments",
};

/** Icon for each demo role card. Words carry the meaning; the icon is decoration. */
const ROLE_ICON: Record<SessionRole, IconName> = {
  reporter: "hand",
  school_admin: "school",
  district_official: "filter",
  independent_reviewer: "shieldCheck",
  buyer: "file",
  supplier: "building",
  receiving_officer: "check",
  payment_approver: "lock",
};

/**
 * The demo cards in two groups. First the three people the live demo signs in
 * as, in the order they act: the supplier, the independent reviewer and the
 * payment approver. Then everyone else, still in the order people act on a
 * case. Each trail card keeps its step tag, so the order of the trail can
 * still be read off the page.
 */
const CARD_GROUPS: {
  id: "demo" | "more";
  roles: SessionRole[];
}[] = [
  { id: "demo", roles: ["supplier", "independent_reviewer", "payment_approver"] },
  {
    id: "more",
    roles: [
      "reporter",
      "school_admin",
      "buyer",
      "receiving_officer",
      "district_official",
    ],
  },
];

/**
 * The two panels of the sign-in page: the brand on navy, with the problem and
 * the one rule, and beside it whatever the page is showing. On a phone the
 * brand panel is a short band above.
 */
function Panels({ children }: { children: ReactNode }) {
  const m = useMessages();
  const b = m.auth.brand;
  return (
    <div className="vl-split">
      <div className="vl vl-split-brand vl-on-dark" data-testid="sign-in-brand">
        <div className="vl-pagehero-photo" aria-hidden="true">
          <Photo
            name="signin_side"
            alt=""
            shape="free"
            sizes="(min-width: 1024px) 42vw, 100vw"
          />
        </div>
        <p className="vl-badge self-start">{m.brand.forSchools}</p>
        <p className="vl-split-statement">{b.statement}</p>
        <p className="vl-split-body">{b.body}</p>
        <ul className="vl-ticks">
          {b.points.map((point) => (
            <li key={point}>
              <Icon name="check" className="size-5" />
              {point}
            </li>
          ))}
        </ul>
        <p className="vl-split-foot">{m.procurement.testnet}</p>
      </div>
      <div className="vl-split-main">
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * Sign in for staff and registered reporters. Calm and linear: the two fields
 * read as steps, errors are plain sentences, and nothing nags. Where sample
 * accounts exist they are offered as role cards under the form: one tap signs
 * in as that person, so a presenter can switch roles without typing.
 */
export function SignInScreen() {
  const m = useMessages();
  const a = m.auth;
  const s = m.procurement.signIn;
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { status, session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoFor, setDemoFor] = useState<DemoAccount | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const demoAccounts =
    useQuery("demo-accounts", () => getApi().listDemoAccounts()).data ?? [];

  async function enterAs(account: DemoAccount) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDemoFor(account);
    try {
      const signedIn = await signInAsDemo(account.email);
      router.push(next ?? HOME[signedIn.user.role]);
    } catch {
      setError(m.common.actionError);
      setDemoFor(null);
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return setError(a.missing);
    setBusy(true);
    setError(null);
    try {
      const signedIn = await signIn(email, password);
      router.push(next ?? HOME[signedIn.user.role]);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "unauthenticated"
          ? a.wrongDetails
          : m.common.actionError,
      );
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <Panels>
        <Loading lines={2} />
      </Panels>
    );
  }

  if (session && !busy) {
    return (
      <Panels>
        <h1 className="mb-6 text-4xl tracking-tight">{a.accountTitle}</h1>
        <Card data-testid="account" className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong"
            >
              <Icon name={ROLE_ICON[session.user.role]} />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-medium break-words">
                {session.user.displayName}
              </p>
              <p className="text-muted">{a.signedInAs(a.role[session.user.role])}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={next ?? HOME[session.user.role]}>
              {m.common.continue}
              <Icon name="arrowRight" />
            </ButtonLink>
            <Button variant="secondary" onClick={() => void signOut()}>
              {a.signOut}
            </Button>
          </div>
        </Card>
      </Panels>
    );
  }

  const emailInvalid = error !== null && !email.trim();
  const passwordInvalid = error !== null && !password;

  const sampleAccounts =
    demoAccounts.length > 0 ? (
      <section aria-labelledby="sample-accounts" className="mt-12">
        <h2 id="sample-accounts" className="text-2xl tracking-tight">
          {a.sampleTitle}
        </h2>
        <p className="mt-2 text-muted">{s.note}</p>
        {CARD_GROUPS.map((group) => {
          const accounts = group.roles.flatMap((role) =>
            demoAccounts.filter((account) => account.role === role),
          );
          if (accounts.length === 0) return null;
          return (
            <div key={group.id} data-testid="card-group" data-group={group.id}>
              <h3 className="mt-6 flex w-fit items-center rounded-full bg-sunken px-3 py-1 font-sans text-xs font-medium tracking-wider text-muted uppercase">
                {s.groups[group.id]}
              </h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {accounts.map((account) => {
                  const entering = demoFor?.email === account.email && busy;
                  const step = s.step[account.role as keyof typeof s.step];
                  return (
                    <li key={account.email}>
                      <button
                        type="button"
                        aria-busy={entering || undefined}
                        disabled={busy && !entering}
                        onClick={() => enterAs(account)}
                        className={cn(
                          "flex h-full min-h-12 w-full items-start gap-3 rounded-2xl border bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow] hover:border-brand hover:shadow-raised disabled:opacity-60",
                          entering ? "border-brand" : "border-line",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink"
                        >
                          <Icon name={ROLE_ICON[account.role]} className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                            <span className="font-display text-lg font-medium tracking-tight">
                              {a.role[account.role]}
                            </span>
                            {step ? (
                              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-strong">
                                {step}
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-sm text-muted">
                            {account.displayName}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted">
                            {account.email}
                          </span>
                          <span className="mt-2 block text-sm">
                            {a.roleCan[account.role]}
                          </span>
                          <span className="mt-2 flex items-center gap-1 text-sm font-medium text-brand-strong">
                            {s.signInAs(a.aRole[account.role])}
                            <Icon name="arrowRight" className="size-4" />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <p
          aria-live="polite"
          className="mt-3 min-h-5 text-sm font-medium text-brand-strong"
        >
          {demoFor && busy ? a.sampleSigningIn(a.role[demoFor.role]) : ""}
        </p>
      </section>
    ) : null;

  return (
    <Panels>
      <h1 className="text-4xl tracking-tight">{a.title}</h1>
      <p className="mt-3 text-lg text-muted">{a.intro}</p>

      <Card className="mt-8">
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <h2 className="text-xl">{a.formTitle}</h2>
          <Field id="sign-in-email" label={a.email} hint={a.emailHint}>
            <Input
              id="sign-in-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby="sign-in-email-hint"
              aria-invalid={emailInvalid || undefined}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="email"
            />
          </Field>

          <Field
            id="sign-in-password"
            label={a.password}
            hint={email.trim() ? a.passwordNext : undefined}
          >
            <div className="flex gap-2">
              <Input
                id="sign-in-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={email.trim() ? "sign-in-password-hint" : undefined}
                aria-invalid={passwordInvalid || undefined}
                autoComplete="current-password"
              />
              <Button
                variant="secondary"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                className="shrink-0 px-4"
              >
                <Icon name="eye" className="size-4" />
                <span aria-hidden="true">{showPassword ? "Hide" : "Show"}</span>
                <span className="sr-only">
                  {showPassword ? a.hidePassword : a.showPassword}
                </span>
              </Button>
            </div>
          </Field>

          {error ? (
            <Notice tone="danger" icon="alert">
              <p role="alert">{error}</p>
            </Notice>
          ) : null}

          <Button
            ref={submitRef}
            type="submit"
            loading={busy && demoFor === null}
            disabled={busy && demoFor !== null}
            className="w-full sm:w-auto sm:self-start"
          >
            {busy ? null : <Icon name="lock" />}
            {a.submit}
          </Button>
          <p className="text-sm text-muted">{a.sessionNote}</p>
        </form>
      </Card>

      <p className="mt-4 text-sm text-muted">{a.noAccountNeeded}</p>

      {sampleAccounts}
    </Panels>
  );
}
