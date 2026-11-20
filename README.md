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

## The trail

One case, eight records. Each step belongs to one role, and each is recorded
as a fingerprint on the Avalanche Fuji test network.

| #     | Step                                       | Who                  |
| ----- | ------------------------------------------ | -------------------- |
| Start | Problem reported                           | Community member     |
| 1     | Work order approved                        | Programme buyer      |
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

## What works today and what is being built

This is a hackathon build in progress. The state of each part, plainly:

| Part                                                                               | State                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reporting, endorsing, school pages, repair claim, independent verify or dispute    | Works. Unit and browser tests.                                                                                                                            |
| `BonaRegistry` contract, ledger adapter, Bona Chain Verify                         | Works. Deployment state per feature is in [`docs/hackathon/FEATURE_MATRIX.md`](docs/hackathon/FEATURE_MATRIX.md).                                         |
| Bona AI: public questions answered from the records                                | Works, with a keyword fallback when no model is configured.                                                                                               |
| Bona AI for the trail: invoice draft, mismatch explanation, "what is blocking it?" | Built and tested in `src/server/ai/`. The invoice draft has its route. The other two are functions waiting to be connected to the procurement routes.     |
| Match rules, release gate, visibility rules (`src/shared/procurement/`)            | Built and tested.                                                                                                                                         |
| Procurement database tables, routes and screens (steps 1 to 5 and 7)               | Being built.                                                                                                                                              |
| `BonaChainFactory`, `InstitutionOperations`, `InstitutionFinance` contracts        | Being built. Not deployed. Until they are, finance steps use the in-memory ledger and are labelled as simulated records, never as Avalanche transactions. |
| Public landing page with the trail of one finished case                            | Built. The trail section appears once a finished case with a procurement trail exists in the data.                                                        |

The contract for everyone building the merged product is
[`docs/merged/BUILD_BRIEF.md`](docs/merged/BUILD_BRIEF.md).

## What is in the repository

| Part              | What it is                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| Bona Chain app    | Next.js 16 application: public screens, HTTP API, database, evidence store       |
| `BonaRegistry`    | Solidity contract for Avalanche Fuji (chain id 43113). Stores digests and ids    |
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

### Demo accounts

Every seeded account uses the password `bona-demo-2026` (override with
`DEMO_ACCOUNT_PASSWORD`). The accounts are synthetic. The full list and the
story behind them are in
[`docs/demo/DEMO_SCENARIO.md` §3](docs/demo/DEMO_SCENARIO.md).

| Role                 | Account                   |
| -------------------- | ------------------------- |
| School administrator | `admin@thandolwethu.demo` |
| Independent reviewer | `reviewer@vaalridge.demo` |
| Community reporter   | `lindiwe@community.demo`  |
| Live reporter        | `zanele@community.demo`   |

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

| Command                                     | What it does                                |
| ------------------------------------------- | ------------------------------------------- |
| `pnpm --filter @bona/contracts test`        | Hardhat tests for `BonaRegistry`            |
| `pnpm --filter @bona/contracts deploy:fuji` | Deploy to Fuji. Needs a funded deployer key |
| `pnpm --filter @bona/contracts roles:fuji`  | Grant the on-chain roles for a school       |
| `pnpm --filter bona-verify dev`             | Bona Chain Verify at http://localhost:3100  |
| `pnpm --filter bona-verify verify`          | Bona Chain Verify from the command line     |

## Configuration

Copy `.env.example` to `.env.local`. Every variable is validated in
`src/server/env.ts`. **None is required locally.** Never commit real values.

| Variable                          | Default                        | Purpose                                                                                    |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                    | unset → PGlite                 | Postgres connection string                                                                 |
| `PGLITE_DATA_DIR`                 | `.data/pglite`                 | PGlite directory when `DATABASE_URL` is unset. `memory` keeps nothing                      |
| `AUTH_SECRET`                     | unset                          | Signs session cookies. At least 32 characters. **Required in production**                  |
| `EVIDENCE_STORAGE_DIR`            | `.evidence`                    | Local directory for private evidence files                                                 |
| `BLOB_READ_WRITE_TOKEN`           | unset → local disk             | Private Vercel Blob store for evidence                                                     |
| `DEMO_ACCOUNT_PASSWORD`           | `bona-demo-2026`               | Password of every seeded demo account                                                      |
| `CRON_SECRET`                     | unset                          | Guards `POST /api/ledger/retry` and `POST /api/demo/reset`                                 |
| `DEMO_RESET_ENABLED`              | unset                          | `true` enables `POST /api/demo/reset`, which wipes and re-seeds the database               |
| `LEDGER_MODE`                     | `auto`                         | `auto`: Avalanche when every `LEDGER_*` value is set, otherwise in-memory. `memory`. `off` |
| `LEDGER_RPC_URL`                  | public Fuji RPC                | Avalanche Fuji C-Chain JSON-RPC endpoint                                                   |
| `LEDGER_CHAIN_ID`                 | `eip155:43113`                 | Only Fuji is accepted. Mainnet is refused                                                  |
| `LEDGER_CONTRACT_ADDRESS`         | unset                          | Deployed `BonaRegistry` address                                                            |
| `LEDGER_REGISTRAR_PRIVATE_KEY`    | unset                          | Testnet key that registers reports and reporter evidence                                   |
| `LEDGER_SCHOOL_ADMIN_PRIVATE_KEY` | unset                          | Testnet key for acknowledgements, interim protection and repair claims                     |
| `LEDGER_REVIEWER_PRIVATE_KEY`     | unset                          | Testnet key for verifying or disputing a repair                                            |
| `AI_GATEWAY_API_KEY`              | unset → keyword fallback       | Vercel AI Gateway key for Bona AI. On Vercel the project's OIDC token is used instead      |
| `AI_MODE`                         | `auto`                         | `off` makes every Bona AI feature answer from code, without a model                        |
| `AI_MODEL`                        | `google/gemini-2.5-flash-lite` | Model Bona AI asks for                                                                     |
| `NEXT_PUBLIC_API_SOURCE`          | `live` in `.env.example`       | `live` calls the HTTP API. Any other value shows browser fixtures                          |

The three ledger keys must be different from each other, stay on the server,
and must never hold real funds. Bona Chain Verify reads only its own variables:
`VERIFY_RPC_URL`, `VERIFY_CHAIN_ID` and `VERIFY_CONTRACT_ADDRESS`
(`verifier/.env.example`). The contracts package has its own
`contracts/.env.example`.

The Bona Chain contracts will add `LEDGER_FACTORY_ADDRESS`, four more role keys
and `LEDGER_FINANCE_MODE`. They are listed in `docs/merged/BUILD_BRIEF.md` and
are being built.

## Repository map

```
src/app/          screens, and src/app/api/ route handlers
src/features/     one folder per screen group (report, issues, schools, staff, verify)
src/components/   shared UI components
src/data/         the frontend's API client, view models and fixtures
src/shared/       shared schemas, roles, status rules, hashing, LedgerPort
src/shared/procurement/  the trail: records, match rules, release gate, visibility
src/server/       auth, report services, database access, evidence store, Bona AI, seed
src/blockchain/   LedgerPort adapter for BonaRegistry (viem) and ledger selection
src/lib/          small helpers, including the sign-in redirect guard
database/         Drizzle schema and SQL migrations
contracts/        BonaRegistry (Hardhat 3, Solidity), tests, deploy and role scripts
verifier/         Bona Chain Verify, package bona-verify: web app and CLI
e2e/              browser tests; e2e/live/ runs against a deployment
docs/             brief, architecture, interfaces, coordination, demo, hackathon, research
```

## Documentation

- [Project brief](docs/PROJECT_BRIEF.md)
- [Build brief for the merged product](docs/merged/BUILD_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Shared interfaces](docs/INTERFACES.md)
- [HTTP API routes](docs/coordination/API_ROUTES.md)
- [Security and threat model](SECURITY.md)
- [Feature matrix](docs/hackathon/FEATURE_MATRIX.md)
- [Blockchain proof](docs/hackathon/BLOCKCHAIN_PROOF.md)
- [Demo scenario](docs/demo/DEMO_SCENARIO.md) and [demo guide](docs/hackathon/DEMO_GUIDE.md)
- [Parallel development workflow](docs/WORKFLOW.md)
