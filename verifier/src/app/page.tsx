import { connection } from "next/server";
import { loadVerifierConfig, trustedContracts } from "../lib/config";
import { networkName, OUTCOME_GUIDE } from "../lib/plain";
import type { Trust } from "./result";
import { VerifyApp } from "./verify-app";

export default async function Page() {
  // Read the environment at request time so the page shows the RPC that is
  // actually in use, not the one baked in at build time.
  await connection();
  let trust: Trust | null = null;
  let configError: string | null = null;
  try {
    const config = loadVerifierConfig();
    trust = {
      chainId: config.chainId,
      network: networkName(config.chainId),
      rpcHost: safeHost(config.rpcUrl),
      contract: trustedContracts(config),
    };
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  return (
    <>
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex min-h-16 w-full max-w-xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 sm:px-6">
          <span className="inline-flex min-w-0 items-center gap-2.5">
            {/* The BonaWork mark: two chain links, and an eye where they join. */}
            <svg
              viewBox="0 0 40 40"
              fill="none"
              className="size-9 shrink-0 text-brand"
              aria-hidden="true"
            >
              <circle cx="20" cy="15" r="11.5" stroke="currentColor" strokeWidth="3.5" />
              <circle cx="20" cy="25" r="11.5" stroke="currentColor" strokeWidth="3.5" />
              <circle cx="20" cy="20" r="3.1" className="fill-earth" />
            </svg>
            <span className="font-display text-xl font-bold tracking-tight text-ink">
              Bona <span className="text-earth">Chain</span>{" "}
              <span className="font-semibold">Verify</span>
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-strong">
            Independent
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {trust ? (
          <>
            <VerifyApp trust={trust} />
            <noscript>
              <p className="rounded-xl border border-accent bg-accent-soft px-4 py-3 font-medium text-accent">
                This page needs JavaScript. It works out the fingerprint of your photo or
                document on your own device, so the file never has to be sent anywhere.
              </p>
            </noscript>
            <HowItWorks trust={trust} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              This site cannot check records right now
            </h1>
            <p
              role="alert"
              className="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-danger"
            >
              It is not set up correctly. This says nothing about any record. The person
              who runs this site needs to fix it.
            </p>
            <details className="mt-4 rounded-xl border border-line bg-surface px-4 py-1 text-sm shadow-card">
              <summary className="cursor-pointer py-3 font-semibold">
                Technical details
              </summary>
              <p className="pb-3 font-mono [overflow-wrap:anywhere]">{configError}</p>
            </details>
          </>
        )}
      </main>

      <footer className="no-print border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-xl px-4 py-6 text-sm text-muted sm:px-6">
          Your photo or document never leaves your device. Only its fingerprint is sent to
          this site, which then reads the blockchain. Nothing is stored.
        </div>
      </footer>
    </>
  );
}

/** Everything a careful reader may want, closed until asked for. */
function HowItWorks({ trust }: { trust: Trust }) {
  return (
    <details className="no-print mt-10 rounded-xl border border-line bg-surface px-4 py-1 text-sm shadow-card">
      <summary className="cursor-pointer py-3 text-base font-semibold">
        How this check works
      </summary>
      <div className="border-t border-line pt-3 pb-4">
        <p>
          Your device works out the fingerprint of the photo or document you choose: a
          short code that changes if anything in the file changes. Only that fingerprint
          is sent to this site. This site then reads the {trust.network} and compares the
          fingerprint with what was recorded there. BonaWork&rsquo;s servers are not asked
          anything.
        </p>
        <p className="mt-2">
          Receipts from BonaWork&rsquo;s practice data are not on any network. This site
          says so, and does not call the network for them.
        </p>

        <h2 className="mt-4 text-base font-semibold">What this site trusts</h2>
        <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-muted sm:grid-cols-[auto_1fr]">
          <dt className="font-medium text-ink">Network</dt>
          <dd className="font-mono break-all">
            eip155:{trust.chainId}
            {trust.chainId === 43113 ? " (Avalanche Fuji, a test network)" : ""}
          </dd>
          <dt className="mt-2 font-medium text-ink sm:mt-0">RPC node</dt>
          <dd className="font-mono break-all">{trust.rpcHost}</dd>
          <dt className="mt-2 font-medium text-ink sm:mt-0">Contract</dt>
          <dd className="font-mono break-all">
            {trust.contract ?? "not pinned: the receipt's own address is used"}
          </dd>
        </dl>

        <h2 className="mt-4 text-base font-semibold">What each answer means</h2>
        <dl className="mt-1">
          {OUTCOME_GUIDE.map(({ outcome, plain, means }) => (
            <div key={outcome} className="mt-2 first:mt-0">
              <dt className="font-semibold">
                {plain}{" "}
                <span className="font-mono font-normal text-muted">{outcome}</span>
              </dt>
              <dd className="text-muted">{means}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
