# BonaBlock

[![CI](https://github.com/obxalethia-star/BonaChain/actions/workflows/ci.yml/badge.svg)](https://github.com/obxalethia-star/BonaChain/actions/workflows/ci.yml)

**See it. Report it. Prove it.**

BonaBlock lets a community report a problem at a public institution, follow how
the institution responds, and check the evidence and decisions independently
against Avalanche. The first application is **BonaBlock for Schools**: broken
toilets, unsafe buildings, no water.

> A report is not protection. A repair claim is not verification.

A school can say a repair is done. Only an independent reviewer can mark it
verified, and the `BonaRegistry` contract refuses a school administrator who
tries. That rule is enforced in the types, the API, the signing keys and the
contract.

## What is in the repository

| Part             | What it is                                                                       |
| ---------------- | -------------------------------------------------------------------------------- |
| BonaBlock app    | Next.js 16 application: public screens, HTTP API, database, evidence store       |
| `BonaRegistry`   | Solidity contract for Avalanche Fuji (chain id 43113). Stores digests and ids    |
| BonaBlock Verify | Separate app and CLI that checks a receipt against the chain through its own RPC |
| Bona AI          | Assistant that guides reporting and points to existing cases. Optional           |

Current test and deployment status for every feature is in
[`docs/hackathon/FEATURE_MATRIX.md`](docs/hackathon/FEATURE_MATRIX.md). The
contract is **not deployed to Fuji** until that matrix says so; without a
deployment the app uses an in-memory ledger and labels its receipts as sample
data, never as Avalanche records.

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
| `pnpm --filter bona-verify dev`             | BonaBlock Verify at http://localhost:3100   |
| `pnpm --filter bona-verify verify`          | BonaBlock Verify from the command line      |

## Configuration

Copy `.env.example` to `.env.local`. Every variable is validated in
`src/server/env.ts`. **None is required locally.** Never commit real values.

| Variable                          | Default                      | Purpose                                                                                    |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                    | unset → PGlite               | Postgres connection string                                                                 |
| `PGLITE_DATA_DIR`                 | `.data/pglite`               | PGlite directory when `DATABASE_URL` is unset. `memory` keeps nothing                      |
| `AUTH_SECRET`                     | unset                        | Signs session cookies. At least 32 characters. **Required in production**                  |
| `EVIDENCE_STORAGE_DIR`            | `.evidence`                  | Local directory for private evidence files                                                 |
| `BLOB_READ_WRITE_TOKEN`           | unset → local disk           | Private Vercel Blob store for evidence                                                     |
| `DEMO_ACCOUNT_PASSWORD`           | `bona-demo-2026`             | Password of every seeded demo account                                                      |
| `CRON_SECRET`                     | unset                        | Guards `POST /api/ledger/retry` and `POST /api/demo/reset`                                 |
| `DEMO_RESET_ENABLED`              | unset                        | `true` enables `POST /api/demo/reset`, which wipes and re-seeds the database               |
| `LEDGER_MODE`                     | `auto`                       | `auto`: Avalanche when every `LEDGER_*` value is set, otherwise in-memory. `memory`. `off` |
| `LEDGER_RPC_URL`                  | public Fuji RPC              | Avalanche Fuji C-Chain JSON-RPC endpoint                                                   |
| `LEDGER_CHAIN_ID`                 | `eip155:43113`               | Only Fuji is accepted. Mainnet is refused                                                  |
| `LEDGER_CONTRACT_ADDRESS`         | unset                        | Deployed `BonaRegistry` address                                                            |
| `LEDGER_REGISTRAR_PRIVATE_KEY`    | unset                        | Testnet key that registers reports and reporter evidence                                   |
| `LEDGER_SCHOOL_ADMIN_PRIVATE_KEY` | unset                        | Testnet key for acknowledgements, interim protection and repair claims                     |
| `LEDGER_REVIEWER_PRIVATE_KEY`     | unset                        | Testnet key for verifying or disputing a repair                                            |
| `AI_GATEWAY_API_KEY`              | unset → keyword fallback     | Vercel AI Gateway key for Bona AI                                                          |
| `AI_MODEL`                        | `anthropic/claude-haiku-5-5` | Model Bona AI asks for                                                                     |
| `NEXT_PUBLIC_API_SOURCE`          | `live` in `.env.example`     | `live` calls the HTTP API. Any other value shows browser fixtures                          |

The three ledger keys must be different from each other, stay on the server,
and must never hold real funds. BonaBlock Verify reads only its own variables:
`VERIFY_RPC_URL`, `VERIFY_CHAIN_ID` and `VERIFY_CONTRACT_ADDRESS`
(`verifier/.env.example`). The contracts package has its own
`contracts/.env.example`.

## Repository map

```
src/app/          screens, and src/app/api/ route handlers
src/features/     one folder per screen group (report, issues, schools, staff, verify)
src/components/   shared UI components
src/data/         the frontend's API client, view models and fixtures
src/shared/       shared schemas, roles, status rules, hashing, LedgerPort
src/server/       auth, report services, database access, evidence store, Bona AI, seed
src/blockchain/   LedgerPort adapter for BonaRegistry (viem) and ledger selection
src/lib/          small helpers, including the sign-in redirect guard
database/         Drizzle schema and SQL migrations
contracts/        BonaRegistry (Hardhat 3, Solidity), tests, deploy and role scripts
verifier/         BonaBlock Verify, package bona-verify: web app and CLI
e2e/              browser tests; e2e/live/ runs against a deployment
docs/             brief, architecture, interfaces, coordination, demo, hackathon, research
```

## Documentation

- [Project brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Shared interfaces](docs/INTERFACES.md)
- [HTTP API routes](docs/coordination/API_ROUTES.md)
- [Security and threat model](SECURITY.md)
- [Feature matrix](docs/hackathon/FEATURE_MATRIX.md)
- [Blockchain proof](docs/hackathon/BLOCKCHAIN_PROOF.md)
- [Demo scenario](docs/demo/DEMO_SCENARIO.md) and [demo guide](docs/hackathon/DEMO_GUIDE.md)
- [Parallel development workflow](docs/WORKFLOW.md)
