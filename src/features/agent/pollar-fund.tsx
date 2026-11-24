"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PollarClient } from "@pollar/core";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { formatRand } from "@/shared/price-check";
import devnet from "../../../config/solana-devnet.json";
import { AgentRequestError, postJson } from "./client";

/** Publishable key: public by design. Inlined at build time. */
const POLLAR_KEY = process.env.NEXT_PUBLIC_POLLAR_API_KEY ?? "";

type Step = "email" | "sending" | "code" | "verifying" | "wallet" | "sending_tx" | "checking" | "done";

type CheckResult =
  | { ok: true; vault: string; slot: number; status: string }
  | { ok: false; reason: string; message: string };

export interface PollarFunded {
  signature: string;
  funderWallet: string;
  explorerUrl: string;
}

const explorerTx = (sig: string) => `${devnet.explorerBase}/tx/${sig}?cluster=devnet`;

/**
 * Fund an escrow with Pollar, on this page. The funder types an email, gets
 * a 6-digit code from Pollar by email, types it here, and Pollar's embedded
 * Solana wallet (test mode: devnet) sends BDZAR sandbox rand to the escrow.
 * We never send the funder to Pollar's website. Then the server reads the
 * transaction from Solana and checks it; only after that may the fund route
 * activate the escrow.
 *
 * - `onWallet` gives the funder's Pollar Solana address as soon as it is
 *   known: the escrow must be created with this address as its funder.
 * - `onFunded` fires only after the server's check passed.
 */
export function PollarFund({
  escrow,
  amountCents,
  onWallet,
  onFunded,
}: {
  /** The escrow PDA. Pollar sends to its BDZAR account, which is the vault. */
  escrow: string | null;
  amountCents: number;
  onWallet?: (address: string) => void;
  onFunded?: (funded: PollarFunded) => void;
}) {
  const id = useId();
  const client = useRef<PollarClient | null>(null);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onWalletRef = useRef(onWallet);
  useEffect(() => {
    onWalletRef.current = onWallet;
  }, [onWallet]);

  useEffect(() => {
    if (!POLLAR_KEY) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const { PollarClient: Client } = await import("@pollar/core");
      if (cancelled) return;
      const c = new Client({ apiKey: POLLAR_KEY });
      client.current = c;
      unsubscribe = c.onAuthStateChange((state) => {
        switch (state.step) {
          case "sending_email":
          case "creating_session":
            setStep("sending");
            break;
          case "entering_code":
            setStep("code");
            break;
          case "verifying_email_code":
          case "authenticating":
            setStep("verifying");
            break;
          case "authenticated":
            void findSolanaWallet(c).then((address) => {
              if (!address) {
                setError(
                  "Your Pollar account has no Solana wallet. Solana must be switched on for this Pollar app.",
                );
                setStep("email");
                return;
              }
              setWallet(address);
              setStep((s) => (s === "done" ? s : "wallet"));
              onWalletRef.current?.(address);
            });
            break;
          case "error":
            setError(friendlyAuthError(state.errorCode));
            setStep(state.errorCode.startsWith("EMAIL_CODE") ? "code" : "email");
            break;
        }
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  function sendCode() {
    setError(null);
    client.current?.login({ provider: "email", email: email.trim() });
    setStep("sending");
  }

  function verify() {
    setError(null);
    client.current?.verifyEmailCode(code.trim());
    setStep("verifying");
  }

  async function check(sig: string, funderWallet: string) {
    if (!escrow) return;
    setStep("checking");
    setError(null);
    try {
      const result = await postJson<CheckResult>("/api/agent/pollar/verify", {
        signature: sig,
        funderWallet,
        escrow,
        amountCents,
      });
      if (result.ok) {
        setStep("done");
        onFunded?.({ signature: sig, funderWallet, explorerUrl: explorerTx(sig) });
      } else {
        setError(result.message);
        setStep("wallet");
      }
    } catch (e) {
      setError(e instanceof AgentRequestError ? e.message : "Could not check the transfer. Try again.");
      setStep("wallet");
    }
  }

  async function send() {
    const c = client.current;
    if (!c || !wallet || !escrow) return;
    setError(null);
    setStep("sending_tx");
    try {
      const outcome = await c.sendPayment({
        chain: "SOLANA",
        destination: escrow,
        mint: devnet.mint,
        amount: String(amountCents),
      });
      if (outcome.status === "success" || outcome.status === "pending") {
        setSignature(outcome.hash);
        await check(outcome.hash, wallet);
        return;
      }
      if (outcome.status === "cosign_pending") {
        setError("Pollar needs you to confirm this transfer on your device first.");
      } else {
        const codeText = `${outcome.resultCode ?? ""} ${outcome.code ?? ""}`;
        setError(
          /NO_TRUSTLINE/i.test(codeText)
            ? "Your Pollar wallet holds no BDZAR yet. Use the sandbox cash-in first."
            : "Pollar could not send the transfer. Nothing moved.",
        );
      }
    } catch {
      setError("Pollar could not send the transfer. Nothing moved.");
    }
    setStep("wallet");
  }

  if (!POLLAR_KEY) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Fund with Pollar</h2>
        <Alert tone="warning" title="Pollar not configured">
          Set NEXT_PUBLIC_POLLAR_API_KEY to a Pollar test-mode key to fund from an email wallet.
        </Alert>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Fund with Pollar</h2>
        <p className="text-sm text-muted">
          Sign in with your email. Pollar emails you a 6-digit code. Your wallet is created for you.
        </p>
        <Badge tone="accent" className="self-start">
          Solana devnet · BDZAR sandbox rand, no real money
        </Badge>
      </div>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {step === "email" || step === "sending" ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          <label htmlFor={`${id}-email`} className="sr-only">
            Email
          </label>
          <Input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" loading={step === "sending"} disabled={!email.includes("@")}>
            Email me a code
          </Button>
        </form>
      ) : null}

      {step === "code" || step === "verifying" ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <label htmlFor={`${id}-code`} className="sr-only">
            6-digit code
          </label>
          <Input
            id={`${id}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <Button type="submit" loading={step === "verifying"} disabled={code.length !== 6}>
            Sign in
          </Button>
        </form>
      ) : null}

      {wallet ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Your Pollar wallet: <span className="font-mono break-all">{wallet}</span>
          </p>
          {step !== "done" ? (
            escrow ? (
              <Button onClick={send} loading={step === "sending_tx" || step === "checking"} className="self-start">
                Send {formatRand(amountCents)} to the escrow
              </Button>
            ) : (
              <p className="text-sm text-muted">The escrow is being set up for this wallet.</p>
            )
          ) : null}
          {step === "checking" ? (
            <p className="text-sm text-muted" role="status">
              Checking the transfer on Solana.
            </p>
          ) : null}
          {step === "wallet" && signature ? (
            <Button variant="secondary" size="sm" className="self-start" onClick={() => check(signature, wallet)}>
              Check the transfer again
            </Button>
          ) : null}
          {step === "done" && signature ? (
            <Alert tone="success" title="Transfer checked on Solana">
              The escrow&apos;s vault received {formatRand(amountCents)} from your wallet.{" "}
              <a href={explorerTx(signature)} target="_blank" rel="noreferrer" className="underline">
                See it on Solana Explorer
              </a>
            </Alert>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/** The signed-in user's Pollar Solana wallet, created on demand if the app does that. */
async function findSolanaWallet(c: PollarClient): Promise<string | null> {
  const existing = c.getWallets().find((w) => w.chain === "SOLANA");
  if (existing) return existing.address;
  try {
    const created = await c.createWallet();
    if (created.chain === "SOLANA") return created.address;
  } catch {
    // no wallet on demand for this app
  }
  return c.getWallets().find((w) => w.chain === "SOLANA")?.address ?? null;
}

function friendlyAuthError(code: string): string {
  switch (code) {
    case "EMAIL_CODE_INVALID":
      return "That code is not right. Check the email from Pollar and try again.";
    case "EMAIL_CODE_EXPIRED":
      return "That code has expired. Ask for a new one.";
    case "EMAIL_SEND_FAILED":
      return "Pollar could not send the email. Check the address and try again.";
    default:
      return "Sign-in did not work. Try again.";
  }
}
