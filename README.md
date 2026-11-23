# Bona Chain

[![CI](https://github.com/obxalethia-star/BonaChain/actions/workflows/ci.yml/badge.svg)](https://github.com/obxalethia-star/BonaChain/actions/workflows/ci.yml)

**See it. Report it. Prove it.**

Bona Chain lets a community report a problem at a public institution, follow
the repair from the work order to the release instruction, and check every
step independently against Avalanche. The first application is school
infrastructure: broken toilets, unsafe buildings, no water.

It merges two projects: BonaBlock (community reporting and independent
verification of repairs) and Alethia (work orders, invoices, deliveries, a
three-way match and release decisions).

> A report is not protection. A repair claim is not verification. A release is
> an instruction, not a payment.

Live app: https://bonachain.vercel.app · Bona Chain Verify:
https://bonachain-verify.vercel.app · Submission summary for the Avalanche
track: [`docs/AVALANCHE_SUBMISSION.md`](docs/AVALANCHE_SUBMISSION.md)

## The problem

A school reports a broken toilet, a contractor says it is fixed, and an invoice
is approved. The report, the order, the invoice and the inspection sit in
separate places, and the party that claims the work is usually the party that
records it. Nobody outside can check that the work was ordered, delivered and
independently inspected before the money decision was made.

## Avalanche Fuji deployment

Chain id 43113 (Avalanche Fuji C-Chain, test network). Addresses are in
[`contracts/deployments/bonachain.43113.json`](contracts/deployments/bonachain.43113.json).

| Contract                                            | Address                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `BonaChainFactory` (the registry, holds every role) | [`0x9AA7Cf8a0cd0c015F01DF8fdb400510D1407d6E3`](https://testnet.snowtrace.io/address/0x9AA7Cf8a0cd0c015F01DF8fdb400510D1407d6E3) |
| `InstitutionOperations` of the demo school          | [`0xeCc11b37EDDafD99d03e7049bfa3226901dBE4Fd`](https://testnet.snowtrace.io/address/0xeCc11b37EDDafD99d03e7049bfa3226901dBE4Fd) |
| `InstitutionFinance` of the demo school             | [`0xD30762a429FB241D378B11A3f74d3c169c2437A5`](https://testnet.snowtrace.io/address/0xD30762a429FB241D378B11A3f74d3c169c2437A5) |

- Factory deploy transaction:
  [`0xd22e3924d8d7c1d8cf47d6d0bdff7c0e5cc9ec4b2aa5bdb31df0e60b847b3ded`](https://testnet.snowtrace.io/tx/0xd22e3924d8d7c1d8cf47d6d0bdff7c0e5cc9ec4b2aa5bdb31df0e60b847b3ded),
  block 61380998.
- The demo school is institution `00000000-0000-4000-8000-010000000001`,
  Thandolwethu Primary School. It is synthetic, like every school in the data.
- The factory created the same pair of contracts for four more institutions.
  Their addresses are in the deployments file.
- Seven roles are granted per institution, each to a different testnet key:
  registrar, school administrator, reviewer, buyer, supplier, receiver and
  payment approver.
- The contract source is in [`contracts/contracts/chain/`](contracts/contracts/chain/).
  The source of the factory and of the demo school's Operations and Finance contracts is verified on the explorer: [factory](https://testnet.snowtrace.io/address/0x9AA7Cf8a0cd0c015F01DF8fdb400510D1407d6E3#code), [Operations](https://testnet.snowtrace.io/address/0xeCc11b37EDDafD99d03e7049bfa3226901dBE4Fd#code), [Finance](https://testnet.snowtrace.io/address/0xD30762a429FB241D378B11A3f74d3c169c2437A5#code).

## Why Avalanche

Several parties share one history here: a community, a school, a buyer, a
supplier, a reviewer and an approver. The party being checked should not be the
one that controls the record, and neither should we. On Avalanche the rules sit
in contracts anyone can read: the school cannot verify its own repair, nobody
can take two duties on one order, and a release is refused until an independent
reviewer has verified the work. Only fingerprints go on chain, so amounts,
names and documents stay private. Fees close to zero and fast finality on the
C-Chain make it practical to prove every step, not only the last one.

## The trail

One case, eight records. Each step belongs to one role, and each is recorded
as a fingerprint on the Avalanche Fuji test network.

| #     | Step                                       | Who                  |
| ----- | ------------------------------------------ | -------------------- |
| Start | Problem reported                           | Community member     |
| 1     | Work order approved                        | Funder               |
| 2     | Supplier acknowledged the order            | Supplier             |
| 3     | Invoice submitted                          | Supplier             |
| 4     | Delivery recorded                          | Receiving officer    |
| 5     | Invoice checked against order and delivery | Bona Chain rules     |
| 6     | Repair independently verified              | Independent reviewer |
| 7     | Release authorised                         | Payment approver     |

What always holds:

- A school can say a repair is done. Only an independent reviewer can mark it
  verified, and the contract refuses a school administrator who tries.
- No role may do two of approve, invoice, receive and authorise. On one case,
  the person who authorises must be none of the people who acted before.
- Step 5 is code: the order, the invoice and the delivery must agree exactly.
  It is not a person and it is not AI.
- The release stays locked until the invoice matches and the reviewer has
  verified the repair.
- No real money moves. Bona Chain runs on a test network, and the last step
  records a release instruction. Nothing is ever "paid" or "resolved".
- The public sees each step, the role that took it, the time and the proof.
  Amounts, supplier names, documents and people's names are not public.
- Bona AI has no tools and writes nothing. It never approves, verifies,
  matches or authorises.

## What works today

Everything in the trail is live on https://bonachain.vercel.app, against the
Fuji contracts above.

| Part                           | What it does today                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Reporting and following a case | Report a problem, say "I'm affected too", add evidence, follow the case. No account needed to report.                         |
| School and reviewer flow       | The school acknowledges and claims a repair. An independent reviewer verifies or disputes it.                                 |
| Procurement trail              | Work order, supplier acknowledgement, invoice, delivery record, three-way match and release instruction, one role per step.   |
| Role screens                   | A home per role: `/buyer`, `/supplier`, `/receiving`, `/payments`, `/admin`, `/reviewer`. Each shows only that person's work. |
| Contracts                      | `BonaChainFactory`, `InstitutionOperations` and `InstitutionFinance`, deployed on Fuji for five institutions.                 |
| Ledger adapter                 | The app writes each step to the institution's own contracts and shows the receipt with an explorer link.                      |
| Bona Chain Verify              | A separate site and CLI. It reads Avalanche itself and confirms a step was recorded by a contract the factory created.        |
| Bona AI                        | Reads pasted invoice text into fields, explains a blocked invoice, answers "what is blocking payment?". It decides nothing.   |
| Public and staff views         | The public sees steps, roles and proofs. Signed-in roles see the named person, and prices only where their role allows it.    |

What it is not: a production system. It runs on a test network with synthetic
data. No real money moves, a release is an instruction, Bona AI never approves
anything, and no real school uses it yet.

## State-changing transactions in the live demo

The demo case makes six writes on Fuji. Each one changes contract state. In the
90-second version the first two are sent while setting up, and the other four are
sent live.

| #   | Demo moment                                | Contract and function                  |
| --- | ------------------------------------------ | -------------------------------------- |
| 1   | Supplier submits an invoice with a mistake | `InstitutionFinance.submitInvoice`     |
| 2   | The rules block it                         | `InstitutionFinance.recordMatchResult` |
| 3   | Supplier submits the corrected invoice     | `InstitutionFinance.submitInvoice`     |
| 4   | The rules pass it                          | `InstitutionFinance.recordMatchResult` |
| 5   | Independent reviewer verifies the repair   | `InstitutionOperations.verifyRepair`   |
| 6   | Payment approver authorises the release    | `InstitutionFinance.authoriseRelease`  |

To see each transaction, open the case, choose the **Trail** tab and press
**Show proof** on a step. The panel links to the transaction on the block
explorer and to Bona Chain Verify.

While a release is locked, the payment approver can press **Ask the Avalanche
contract**. This is a simulated call to the institution's Finance contract. It
shows the contract's own refusal, for example `RepairNotVerified`, and writes
nothing.

Two buttons are labelled **Demo shortcut**. One sends the corrected sample invoice
in a single press (Bona AI reads it, the rules check it). The other fills the
reviewer's three answers and a sample note. They only save clicks on stage: the
rules, the contracts and the reviewer's own **Verify completion** press are
unchanged.

What the contracts refuse:

| Attempt                                                  | The contract reverts with |
| -------------------------------------------------------- | ------------------------- |
| A release before an independent reviewer has verified    | `RepairNotVerified`       |
| An account acting under a second role on the same order  | `SeparationOfDuties`      |
| A school administrator verifying the school's own repair | `SchoolAdminCannotVerify` |

The full path, including these refusals, is also scripted against Fuji in
[`scripts/chain-smoke.ts`](scripts/chain-smoke.ts).

## Next milestone

- A pool of independent reviewers: three drawn at random for each repair, and
  two must agree.
- Each institution holds its own keys. Today the platform holds all seven
  testnet keys, which is a stated limit of the demo.
- An outside review of the contracts before any mainnet use.

The contract every builder worked from is
[`docs/merged/BUILD_BRIEF.md`](docs/merged/BUILD_BRIEF.md).

## What is in the repository

| Part              | What it is                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| Bona Chain app    | Next.js 16 application: public screens, HTTP API, database, evidence store       |
| Bona Chain suite  | `BonaChainFactory`, `InstitutionOperations`, `InstitutionFinance` (Solidity)     |
| `BonaRegistry`    | The earlier single contract, kept for reference. Not used by Bona Chain          |
| Bona Chain Verify | Separate app and CLI that checks a receipt against the chain through its own RPC |
| Bona AI           | Assistant and three guarded helpers for the trail. Optional; code answers alone  |

Without a ledger configuration the app uses an in-memory ledger and labels its
receipts as sample data, never as Avalanche records.

## Run it locally in 60 seconds

Requirements: Node.js 22 or later, pnpm 11 (`npm install -g pnpm`), and Google
Chrome for the browser tests.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. No account, database, key or network access is
needed:

- **Database:** PGlite, an in-process Postgres, stored in `.data/pglite`. It is
  migrated and seeded with the demo schools and cases on first start.
- **Ledger:** an in-memory ledger with chain id `bona:memory`.
- **Evidence files:** the git-ignored `.evidence` directory.
- **Bona AI:** a keyword-search fallback, used when no AI Gateway key is set.

The `cp` step matters: `.env.example` sets `NEXT_PUBLIC_API_SOURCE=live`, which
makes the screens call the real API. Without it the screens show browser
fixtures and sign-in does nothing useful.

### Demo data

Everything in the data is synthetic: the schools, the cases, the people, the
supplier, the orders and the invoices. No personal customer information is
stored. The keys hold test AVAX only, and no real funds are involved anywhere.

The sign-in page has a one-tap card per role, shown while `DEMO_RESET_ENABLED`
is `true`. Every seeded account uses the password `bona-demo-2026` (override
with `DEMO_ACCOUNT_PASSWORD`).

| Role                 | Demo person                | Account                         | In the live demo  |
| -------------------- | -------------------------- | ------------------------------- | ----------------- |
| Supplier             | Mr Themba Zulu             | `supplier@emseni-supplies.demo` | Yes               |
| Independent reviewer | Mr Sipho Mokoena           | `reviewer@vaalridge.demo`       | Yes               |
| Payment approver     | Mr Pieter van Wyk          | `approver@vaalridge.demo`       | Yes               |
| Funder               | Ms Naledi Dlamini          | `buyer@vaalridge.demo`          | Step already done |
| Receiving officer    | Mrs Ayanda Ngcobo          | `receiving@thandolwethu.demo`   | Step already done |
| School administrator | Ms Nomvula Dlamini         | `admin@thandolwethu.demo`       | Step already done |
| Community reporter   | Ms Zanele Nkosi            | `zanele@community.demo`         | No                |
| District official    | Vaal Ridge district office | `district@vaalridge.demo`       | No                |

The live demo case is `BB-2026-000051`, "No lights in the Grade 7 classrooms".
`BB-2026-000044` is a finished case with a blocked first invoice in its history.

Reporting does not need an account. Endorsing a report ("I'm affected too")
does.

## Commands

| Command            | What it does                                                                   |
| ------------------ | ------------------------------------------------------------------------------ |
| `pnpm install`     | Install dependencies (once per checkout)                                       |
| `pnpm dev`         | Start the app at http://localhost:3000                                         |
| `pnpm check`       | `lint` + `typecheck` + `test`. Run before every commit                         |
| `pnpm lint`        | ESLint, including the module-boundary rules                                    |
| `pnpm typecheck`   | TypeScript for the app and for `verifier/`                                     |
| `pnpm test`        | Unit tests for the app and for `verifier/`                                     |
| `pnpm e2e`         | Browser tests at 390, 768 and 1440px. Starts the dev server if none is running |
| `pnpm e2e:live`    | The demo journey against a deployment. Needs `LIVE_BASE_URL`                   |
| `pnpm build`       | Production build                                                               |
| `pnpm start`       | Serve the production build                                                     |
| `pnpm db:generate` | Regenerate SQL migrations after editing `database/schema.ts`                   |
| `pnpm format`      | Format with Prettier                                                           |

```bash
LIVE_BASE_URL=https://<deployment-url> pnpm e2e:live
```

Other packages:

| Command                                       | What it does                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm --filter @bona/contracts test`          | All Hardhat tests: the Bona Chain suite and the earlier `BonaRegistry` |
| `pnpm --filter @bona/contracts test:chain`    | The Bona Chain suite only, including the stress test                   |
| `pnpm --filter @bona/contracts chain:dry-run` | Deploy, set up and run one case on a throwaway local network           |
| `pnpm --filter @bona/contracts chain:deploy`  | Deploy `BonaChainFactory` to Fuji. Needs a funded deployer key         |
| `pnpm --filter @bona/contracts chain:setup`   | Create the institutions and grant the seven roles. Safe to re-run      |
| `pnpm --filter @bona/contracts chain:fund`    | Top the role keys up with test AVAX                                    |
| `pnpm --filter @bona/contracts chain:export`  | Write `contracts/deployments/bonachain.43113.json`                     |
| `pnpm --filter bona-verify dev`               | Bona Chain Verify at http://localhost:3100                             |
| `pnpm --filter bona-verify verify`            | Bona Chain Verify from the command line                                |

`BonaRegistry` is the earlier single contract. It stays in the repository with
its tests and scripts for reference; `contracts/README.md` describes both.

## Tests

```bash
pnpm check                                    # lint, typecheck, app and verifier unit tests
pnpm --filter @bona/contracts test            # contract tests
pnpm --filter @bona/contracts chain:dry-run   # one whole case on a local network
pnpm e2e                                      # browser tests on fixtures
```

| Suite                   | Count | What it covers                                                                                       |
| ----------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| App (`pnpm test`)       | 596   | Match rules, release gate, routes, permissions, public redaction, ledger adapter, Bona AI guardrails |
| Verifier                | 184   | Receipt checks, genuine and fake contracts, document fingerprints                                    |
| Contracts               | 180   | Every rule and revert, plus a seeded stress test checked against a reference model                   |
| Live smoke test on Fuji | 17    | `scripts/chain-smoke.ts`: one whole case through the app's adapter. 17 of 17 checks passed           |

The smoke test sends real testnet transactions and needs the seven role keys:

```bash
verifier/node_modules/.bin/tsx --env-file=.env.local scripts/chain-smoke.ts
```

## Configuration

Copy `.env.example` to `.env.local`. Every variable is validated in
`src/server/env.ts`. **None is required locally.** Never commit real values.

| Variable                              | Default                        | Purpose                                                                                    |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                        | unset → PGlite                 | Postgres connection string                                                                 |
| `PGLITE_DATA_DIR`                     | `.data/pglite`                 | PGlite directory when `DATABASE_URL` is unset. `memory` keeps nothing                      |
| `AUTH_SECRET`                         | unset                          | Signs session cookies. At least 32 characters. **Required in production**                  |
| `EVIDENCE_STORAGE_DIR`                | `.evidence`                    | Local directory for private evidence files                                                 |
| `BLOB_READ_WRITE_TOKEN`               | unset → local disk             | Private Vercel Blob store for evidence                                                     |
| `DEMO_ACCOUNT_PASSWORD`               | `bona-demo-2026`               | Password of every seeded demo account                                                      |
| `CRON_SECRET`                         | unset                          | Guards `POST /api/ledger/retry` and `POST /api/demo/reset`                                 |
| `DEMO_RESET_ENABLED`                  | unset                          | `true` enables `POST /api/demo/reset`, which wipes and re-seeds the database               |
| `LEDGER_MODE`                         | `auto`                         | `auto`: Avalanche when every `LEDGER_*` value is set, otherwise in-memory. `memory`. `off` |
| `LEDGER_RPC_URL`                      | public Fuji RPC                | Avalanche Fuji C-Chain JSON-RPC endpoint                                                   |
| `LEDGER_CHAIN_ID`                     | `eip155:43113`                 | Only Fuji is accepted. Mainnet is refused                                                  |
| `LEDGER_FACTORY_ADDRESS`              | unset                          | Deployed `BonaChainFactory`. When set, the app writes to each institution's own contracts  |
| `LEDGER_CONTRACT_ADDRESS`             | unset                          | The earlier `BonaRegistry`. Ignored once a factory address is set                          |
| `LEDGER_REGISTRAR_PRIVATE_KEY`        | unset                          | Testnet key that registers reports and reporter evidence                                   |
| `LEDGER_SCHOOL_ADMIN_PRIVATE_KEY`     | unset                          | Testnet key for acknowledgements, interim protection and repair claims                     |
| `LEDGER_REVIEWER_PRIVATE_KEY`         | unset                          | Testnet key for verifying or disputing a repair                                            |
| `LEDGER_BUYER_PRIVATE_KEY`            | unset                          | Testnet key that approves work orders                                                      |
| `LEDGER_SUPPLIER_PRIVATE_KEY`         | unset                          | Testnet key that acknowledges orders and submits invoices                                  |
| `LEDGER_RECEIVER_PRIVATE_KEY`         | unset                          | Testnet key that records deliveries                                                        |
| `LEDGER_PAYMENT_APPROVER_PRIVATE_KEY` | unset                          | Testnet key that authorises release instructions                                           |
| `LEDGER_FINANCE_MODE`                 | `auto`                         | `off` keeps finance steps in the database only and labels them as not anchored             |
| `AI_GATEWAY_API_KEY`                  | unset → keyword fallback       | Vercel AI Gateway key for Bona AI. On Vercel the project's OIDC token is used instead      |
| `AI_MODE`                             | `auto`                         | `off` makes every Bona AI feature answer from code, without a model                        |
| `AI_MODEL`                            | `google/gemini-2.5-flash-lite` | Model Bona AI asks for                                                                     |
| `NEXT_PUBLIC_API_SOURCE`              | `live` in `.env.example`       | `live` calls the HTTP API. Any other value shows browser fixtures                          |

The seven ledger keys must be different from each other, stay on the server,
and must never hold real funds. Bona Chain Verify reads only its own variables:
`VERIFY_RPC_URL`, `VERIFY_CHAIN_ID`, `VERIFY_FACTORY_ADDRESS` and, for receipts
from the earlier registry, `VERIFY_CONTRACT_ADDRESS` (`verifier/.env.example`).
The contracts package has its own `contracts/.env.example`.

## Repository map

```
src/app/          screens, and src/app/api/ route handlers
src/features/     one folder per screen group (report, issues, schools, staff, procurement, verify)
src/components/   shared UI components
src/data/         the frontend's API client, view models and fixtures
src/shared/       shared schemas, roles, status rules, hashing, LedgerPort
src/shared/procurement/  the trail: records, match rules, release gate, visibility
src/server/       auth, report services, database access, evidence store, Bona AI, seed
src/blockchain/   LedgerPort adapters (viem): Bona Chain per institution, the earlier BonaRegistry
src/lib/          small helpers, including the sign-in redirect guard
database/         Drizzle schema and SQL migrations
contracts/        Bona Chain contracts and the earlier BonaRegistry (Hardhat 3), tests, deploy scripts
scripts/          chain-smoke.ts, the live smoke test on Fuji
verifier/         Bona Chain Verify, package bona-verify: web app and CLI
e2e/              browser tests; e2e/live/ runs against a deployment
docs/             brief, architecture, interfaces, build brief, design, hackathon, research
```

## Documentation

- [Avalanche submission summary](docs/AVALANCHE_SUBMISSION.md)
- [Contracts: the Bona Chain suite and the earlier registry](contracts/README.md)
- [Gas and contract sizes](contracts/exports/chain-gas-report.md)
- [Build brief for the merged product](docs/merged/BUILD_BRIEF.md)
- [Screen design](docs/design/BONA_CHAIN_SCREENS.md) and [brand](docs/design/BRAND.md)
- [Security and threat model](SECURITY.md)
- [Project brief](docs/PROJECT_BRIEF.md), [architecture](docs/ARCHITECTURE.md) and
  [shared interfaces](docs/INTERFACES.md)
- [Parallel development workflow](docs/WORKFLOW.md)
- `docs/hackathon/` holds notes from the earlier BonaBlock build. They describe
  the single `BonaRegistry` contract, not the Bona Chain suite.
