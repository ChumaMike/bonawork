# BonaWork

> **This is BonaWork on Solana devnet.** It is not the older Bona Chain /
> BonaBlock project on Avalanche Fuji. The `contracts/` and `verifier/` folders
> are that earlier EVM work, kept for reference only.

Repair money for South African schools, held in escrow on Solana devnet.
BonaWork enforces agreed payment conditions around recorded inspection
evidence.

A community member reports a broken thing at a school. A funder puts money for
the repair into an escrow. An independent reviewer, who does not work for the
school, the funder or the contractor, makes two checks, one per payment part:

| Check                          | What the reviewer confirms            | What it releases                              | Released to                          |
| ------------------------------ | ------------------------------------- | --------------------------------------------- | ------------------------------------ |
| **Check 1: Materials on site** | The delivered items match the invoice | The materials part, paid on verified delivery | The supplier, or else the contractor |
| **Check 2: Work done**         | The work is installed and working     | The rest                                      | The contractor                       |

Each check's payee is written into the escrow when it is made and cannot be
changed afterwards; the program checks every release against it. So the
materials money can go straight to the supplier who delivered them.

The materials part is paid on verified delivery of materials, never as an
upfront advance. For each check the contractor first claims it with
fingerprints of the evidence and of the invoice match; the reviewer then
verifies; after a challenge window anyone can release that part. If nobody
verifies before the deadline, that part goes back to the funder.

Evidence (photos, invoices, notes) stays private in the app. Only SHA-256
fingerprints go on chain. No learner photos are needed.

**What is simulated, and labelled so on screen:** the money is **sandbox demo
rand** (token `BDZAR`, 2 decimals, no real value); the funder, contractor and
reviewer (and the supplier and school, where they appear) sign with or are
**demo keys held by the server on devnet**; and the demo uses
a **60-second challenge window** (real cases would use days). A release is a
sandbox payout instruction carried out by the program, never a payment. AI
never approves, verifies or signs anything.

## Live on devnet

| What                           | Where                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Program `bonawork` (Anchor)    | [`5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY`](https://explorer.solana.com/address/5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY?cluster=devnet) |
| Sandbox demo rand mint `BDZAR` | [`5AHRPsVABhZESFmPMXX9jeYb6krkz9XUAsLy1LiWXud3`](https://explorer.solana.com/address/5AHRPsVABhZESFmPMXX9jeYb6krkz9XUAsLy1LiWXud3?cluster=devnet) |
| All public addresses           | [`config/solana-devnet.json`](config/solana-devnet.json) (admin, match, dispute, feepayer, treasury, keeper, demo reviewer)                       |

### One case through the app's API (24 Nov 2026)

Case `BB-2026-000051`, R3 000 materials + R2 000 completion, 60-second challenge
window. Escrow
[`HW7ymY4c…LZ3U`](https://explorer.solana.com/address/HW7ymY4c3UJqCVTNoNWxskw2NA6qKuWUYDRTJvqyLZ3U?cluster=devnet).

| Step                                        | Transaction                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create escrow                               | [3Vurm…kpZmc](https://explorer.solana.com/tx/3VurmVARqNzuM2dDSJt2TrUYMxdKkoKMFEmyLi2q64VkEAAbzwbsT16Ea8n9ic3CnLeeFoQLhwYDcuV93QkkZpmc?cluster=devnet)  |
| Sandbox cash-in R5 000 to the demo funder   | [24oaN…5mLzrv](https://explorer.solana.com/tx/24oaN3bDZHb5BqknHfvuoU6zZNPLecRRv1P6bkxDU73EahdGiZg2Ee788SMZAAnzubDj2PFncNiZmY7Hpu5mLzrv?cluster=devnet) |
| Demo funder moves R5 000 into the vault     | [3VN56…qeR21P](https://explorer.solana.com/tx/3VN56orGmRiNNtqvHSywL3H4qxSM5VQjWKaiw1KLuxjGmruB8rTtwTpzFqujNn6iYQCVnBKFSh4SeXXR5gqeR21P?cluster=devnet) |
| Activate funding                            | [47VhC…kw71cr](https://explorer.solana.com/tx/47VhCE4KFe52Fk8gxdH9DnPg755mzC6qnDTPqpfRCP8YGYC1KTCWuGUpxVa7jocqZMG7torbjnYqoi7iq4kw71cr?cluster=devnet) |
| Contractor claims Check 1                   | [noucU…1vzGS](https://explorer.solana.com/tx/noucUuvwem6tEDC1JKX3kzJ3QiNWDvHnuqhEQjhzLjPZXR7NcgPadD7AWEFgBfPNF9j2kjnFWosPhsTTsF1vzGS?cluster=devnet)   |
| Reviewer verifies (Guardian: no findings)   | [Noi9A…D7yUiM](https://explorer.solana.com/tx/Noi9ADnqWF6fPTDNtnFNyJQ2uEyE7ZYVDQs8tVPDAEmYtwgh77ELAJcste2E1La338h5WoAD693DsHuYGD7yUiM?cluster=devnet)  |
| Release straight away                       | Refused by the program: `ChallengeWindowActive`, "The money is locked until the challenge window ends." (HTTP 409)                                     |
| Escrow Watchdog releases Check 1 after 60 s | [iaWaj…A9Upu8](https://explorer.solana.com/tx/iaWaj3B94SupCnA4W89QwSqMEddkdJxSWUSctGgCyjYoBerwpicxTf9RkueA3XRBaeoKR6CSsZtWocHdSA9Upu8?cluster=devnet)  |

`scripts/solana/demo-journey.ts` runs the same journey from the command line.

## How it fits together

```
Anchor program bonawork (solana/programs/bonawork, 34 LiteSVM tests)
  create_escrow (with a payee per check) · activate_funding · claim_tranche
  verify_tranche · release_tranche (to that check's payee) · refund_expired
  open/resolve dispute · reassign_reviewer · sweep_surplus
        ▲
src/solana/              client: instruction builders, account decoders, error names
src/solana/guardian/     Bona Guardian: decodes a transaction, checks it against
                         what the case expects, describes it in plain lines
src/server/solana/       escrow adapter (server keys, RPC, retries) + Escrow Watchdog (keeper)
src/server/escrow/       ties a case to its escrow (table escrow_cases), each step, ReviewerSigner
src/app/api/issues/[id]/escrow/   fund · claim · verify/prepare · verify/submit · release · refund
                                  sweep · reviewer · GET
src/app/api/cron/watchdog/        keeper run, behind CRON_SECRET
src/features/escrow/     screens: /issues/:id/escrow and /issues/:id/escrow/review
src/server/price-check/  invoice prices against South African shops (Firecrawl)
```

**Bona Guardian** is a set of fixed rules, not AI. Before the reviewer signs, it
checks that the transaction calls only the BonaWork program, names the right
escrow, stage, evidence revision and fingerprints, caps the compute budget, and
pays the fee from the platform feepayer. The reviewer screen shows its findings
and the plain description; signing is disabled if it finds an error. The server
checks the signed transaction again before adding the feepayer signature.

**Who signs.** Funder: a server-held demo funder key ("Fund this repair"), with a
wallet seam ready (`prepareWalletFunding` + `confirmWalletFundingAndActivate` in
`src/server/escrow/cases.ts`). Contractor: a demo contractor key plus the match
key. Reviewer: the **Demo reviewer key (devnet)**, labelled as such on screen.
Reviewer signing sits behind the `ReviewerSigner` interface
(`src/server/escrow/reviewer-signer.ts`), so an embedded wallet can replace the
demo key later. Release, refund and sweep: the keeper key, when the program
allows it. Reviewer change: the platform admin key and the school key together
(a demo school key on devnet), through `POST /api/issues/:id/escrow/reviewer`.

## Who can stop or delay each step

Read from the program (`solana/programs/bonawork/src/lib.rs`). "Stop" means a step cannot happen; the fallback says where the
money goes then.

| Key                                     | What it can do                                                                             | What it can stop or delay                                                | Fallback                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Admin (platform)                        | Creates escrows, pauses new escrows, adds or deactivates reviewers                         | New escrows (pause). Verification, by deactivating the assigned reviewer | Unverified parts refund to the funder after the verification deadline                                             |
| Admin + school, together                | Replace an escrow's reviewer with another listed, active reviewer                          | Nothing on their own; blocked while a check is verified or disputed      | Neither can do it alone                                                                                           |
| Match key (platform)                    | Co-signs every claim, after the invoice / order / delivery match                           | Claims: without its signature the contractor cannot claim                | Refund to the funder after the verification deadline                                                              |
| Reviewer                                | Verifies each check                                                                        | Release: nothing is released without the reviewer's verification         | Refund to the funder after the verification deadline                                                              |
| School (or the funder's challenger)     | Opens a dispute on a verified check during its challenge window                            | Release of that check while the dispute is open                          | Dispute authority decides; if it does not, refund after the dispute timeout                                       |
| Dispute authority (platform)            | Settles a dispute: refund that part, or send it back for a fresh check with a new deadline | Release of a disputed check                                              | If it does nothing, anyone can refund after the dispute timeout                                                   |
| Keeper (platform)                       | Sends release, refund and sweep transactions when the rules allow (Escrow Watchdog)        | Nothing: these are open to any caller, and the screen has "Release now"  | Anyone can send the same transaction                                                                              |
| Upgrade key (program upgrade authority) | Can deploy a new version of the program on devnet                                          | Anything, in principle: a new version can change the rules               | None on chain. This is a devnet build; a production release would need the authority locked or held by a multisig |

The current program moves vault money in three ways only: release (to the
payee fixed in the escrow for that check, after verification and the challenge
window), refund (to the funder), and sweep (only tokens beyond what the open
checks are owed, to the funder). An upgrade of the program could change that, as the last row says.

## Run it

Requirements: Node.js 22+, pnpm 11.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Without any variables the app runs on PGlite (in-process Postgres in
`.data/pglite`, migrated and seeded on first start) with an in-memory ledger.
For the escrow screens, create `.env.local` with only the values you set (an
empty `NAME=` line fails validation):

```bash
NEXT_PUBLIC_API_SOURCE=live
BONAWORK_KEYS_DIR=/path/outside/the/repo/keys   # local dev only: keypair files
CRON_SECRET=<random>
```

Sign in from `/sign-in` (password `bona-demo-2026`): `buyer@vaalridge.demo`
funds, `supplier@emseni-supplies.demo` claims, `reviewer@vaalridge.demo`
verifies. Open a case, then **Repair money**.

| Command            | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `pnpm check`       | lint + typecheck + unit tests                        |
| `pnpm e2e`         | browser tests at 390, 768 and 1440 px                |
| `pnpm build`       | production build                                     |
| `pnpm db:generate` | new SQL migration after editing `database/schema.ts` |

### Program and its tests

Rust, the Solana CLI with `cargo-build-sbf` (CI uses v4.1.2):

```bash
cargo build-sbf --manifest-path solana/programs/bonawork/Cargo.toml --features localtest
(cd solana/tests-litesvm && cargo test -- --test-threads=4)
```

The `localtest` feature is for tests only; the
[deployment workflow](.github/workflows/solana-deploy.yml) builds the devnet
program without it.

### Environment for a deployment

| Variable                                                                                            | Purpose                                                              |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                      | Postgres (Neon or Supabase). Without it Vercel uses in-memory PGlite |
| `AUTH_SECRET`                                                                                       | Session cookies, 32+ characters. Required in production              |
| `CRON_SECRET`                                                                                       | Guards `/api/cron/watchdog` and `/api/ledger/retry`                  |
| `SOLANA_RPC_URL`                                                                                    | Devnet RPC (default: public devnet endpoint, rate limited)           |
| `BONAWORK_ADMIN_KEY`, `_MATCH_KEY`, `_DISPUTE_KEY`, `_FEEPAYER_KEY`, `_TREASURY_KEY`, `_KEEPER_KEY` | Platform keys, base58 or JSON array. One per role, server-side only  |
| `BONAWORK_DEMO_FUNDER_KEY`, `BONAWORK_DEMO_CONTRACTOR_KEY`, `BONAWORK_DEMO_REVIEWER_KEY`            | Demo stand-ins until people sign with their own wallets              |
| `BONAWORK_REVIEWER_ADDRESS`                                                                         | Optional registered reviewer wallet to name in new escrows           |
| `NEXT_PUBLIC_API_SOURCE=live`                                                                       | Screens call the real API                                            |
| `FIRECRAWL_API_KEY`                                                                                 | Invoice price check                                                  |

Key files in `BONAWORK_KEYS_DIR` are read only outside production and outside
Vercel. Never commit keys. The Vercel cron runs the watchdog once a day (Hobby
limit); call `/api/cron/watchdog` with the secret more often from any scheduler.

## Built before vs during the hackathon

| When               | What                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before (to 23 Nov) | The reporting and review app from Bona Chain / BonaBlock: reports, evidence, roles, school pages, work orders, invoices, three-way match, release gate, Bona AI explanations. That version wrote to Avalanche Fuji. |
| From 24 Nov        | The Anchor program and its 34 LiteSVM tests, the Solana client, Bona Guardian, the invoice price check (Firecrawl), the escrow adapter and the Escrow Watchdog, devnet bootstrap and demo-journey scripts.          |
| 27 to 29 Nov       | Case escrows in the database, the escrow API and cron, the fund / claim / verify / release screens, honest Solana copy, and the agent, voice and wallet integrations.                                               |

## Prize tracks

| Track              | Why it fits                                                                       | Source                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Best App           | One working path from a school report to a released check, on devnet              | [`src/features/escrow/`](src/features/escrow/), [`src/server/escrow/`](src/server/escrow/)                                                                              |
| South Africa local | School repairs, rand amounts, South African shop prices                           | [`src/server/price-check/`](src/server/price-check/), [`src/features/issues/`](src/features/issues/)                                                                    |
| DeFi               | Escrow released per check, with challenge window, refunds and disputes            | [program on `solana/escrow`](https://github.com/ChumaMike/bonawork/tree/solana/escrow/solana), [`src/solana/`](src/solana/), [`src/server/solana/`](src/server/solana/) |
| Pollar             | Funder wallet funding through the wallet seam                                     | [`src/features/agent/`](src/features/agent/), [`src/server/escrow/cases.ts`](src/server/escrow/cases.ts)                                                                |
| Agentic            | Fixed-rule keeper (Escrow Watchdog) and Bona Guardian; agents explain, never sign | [`src/features/agent/`](src/features/agent/), [`src/server/solana/keeper.ts`](src/server/solana/keeper.ts), [`src/solana/guardian/`](src/solana/guardian/)              |
| Firecrawl          | Invoice line prices checked against South African shops                           | [`src/server/price-check/firecrawl.ts`](src/server/price-check/firecrawl.ts)                                                                                            |
| ElevenLabs         | Voice                                                                             | [`src/server/voice/`](src/server/voice/), [`src/features/agent/`](src/features/agent/)                                                                                  |
| Supabase           | Postgres through Drizzle; point `DATABASE_URL` at Supabase Postgres               | [`database/schema.ts`](database/schema.ts), [`src/server/db/`](src/server/db/)                                                                                          |

## Limitations

A hackathon prototype with synthetic school data and test tokens. The program
checks signatures and payment conditions; it cannot tell on its own whether the
physical work happened. Reviewer independence and evidence quality remain
operational responsibilities. The program keeps an upgrade authority on devnet;
it is not immutable or independently audited. No production funds or real
school adoption are claimed.

## Repository map

```
src/app/          screens, and src/app/api/ route handlers
src/features/     screen groups (issues, escrow, procurement, verify, ...)
src/server/       auth, services, database, escrow, solana adapter, price check
src/solana/       BonaWork program client and Bona Guardian
database/         Drizzle schema and SQL migrations
scripts/solana/   bootstrap-devnet.ts, demo-journey.ts
config/           public devnet addresses
contracts/, verifier/   the earlier Avalanche (EVM) contracts and verifier, kept for reference
```

## Licence

MIT. See [LICENSE](LICENSE).
