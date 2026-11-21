"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Input } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { Container, Loading, Notice, PageHeader } from "@/components/ui/page";
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
 * Sign in for staff and registered reporters. Calm and linear: the two fields
 * read as steps, errors are plain sentences, and nothing nags. In demo mode
 * the sample accounts are offered as role cards: one tap signs in as that
 * person, so a presenter can switch roles without typing.
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
      <Container size="narrow">
        <Loading lines={2} />
      </Container>
    );
  }

  if (session && !busy) {
    return (
      <Container size="narrow">
        <PageHeader title={a.accountTitle} />
        <Card data-testid="account" className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong"
            >
              <Icon name={ROLE_ICON[session.user.role]} />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-bold break-words">{session.user.displayName}</p>
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
      </Container>
    );
  }

  const emailInvalid = error !== null && !email.trim();
  const passwordInvalid = error !== null && !password;

  return (
    <Container>
      <div className="mx-auto max-w-2xl">
        {/* The logo above the heading, with its clear space around it. */}
        <BrandLogo className="mb-5" />
        <PageHeader title={a.title} intro={a.intro} />
      </div>

      {demoAccounts.length > 0 ? (
        <section
          aria-labelledby="sample-accounts"
          className="mx-auto mb-8 max-w-2xl rounded-2xl border border-dashed border-accent bg-accent-soft p-4 sm:p-5 xl:max-w-5xl"
        >
          <h2 id="sample-accounts" className="font-semibold text-accent">
            {a.sampleTitle}
          </h2>
          <p className="mt-1 text-sm">{s.note}</p>
          {CARD_GROUPS.map((group) => {
            const accounts = group.roles.flatMap((role) =>
              demoAccounts.filter((account) => account.role === role),
            );
            if (accounts.length === 0) return null;
            return (
              <div key={group.id} data-testid="card-group" data-group={group.id}>
                <h3 className="mt-4 flex w-fit items-center rounded-full bg-sunken px-2.5 text-sm font-semibold tracking-wide text-muted uppercase">
                  {s.groups[group.id]}
                </h3>
                <ul className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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
                            "flex h-full min-h-12 w-full items-start gap-3 rounded-xl border-2 bg-surface p-3 text-left hover:border-brand disabled:opacity-60",
                            entering ? "border-brand" : "border-line",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-earth-soft text-earth-strong"
                          >
                            <Icon name={ROLE_ICON[account.role]} className="size-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <span className="font-display text-lg font-semibold">
                                {a.role[account.role]}
                              </span>
                              {step ? (
                                <span className="text-xs font-semibold text-earth-strong">
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
                            <span className="mt-1 block text-sm">
                              {a.roleCan[account.role]}
                            </span>
                            <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-brand-strong">
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
            className="mt-3 min-h-5 text-sm font-semibold text-accent"
          >
            {demoFor && busy ? a.sampleSigningIn(a.role[demoFor.role]) : ""}
          </p>
        </section>
      ) : null}

      <form
        onSubmit={submit}
        noValidate
        className="mx-auto flex max-w-2xl flex-col gap-6"
      >
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

      <p className="mx-auto mt-8 max-w-2xl text-muted">{a.noAccountNeeded}</p>
    </Container>
  );
}
