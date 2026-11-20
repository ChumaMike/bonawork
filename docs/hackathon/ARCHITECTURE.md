# BonaBlock — architecture (judge edition)

**See it. Report it. Prove it.** BonaBlock for Schools is one Next.js application, one
Solidity contract written for Avalanche Fuji (**not yet deployed there**), and one deliberately
separate verifier.

```
                 ┌──────────────────────────── Vercel project `bona` ────────────────────────────┐
  phone/browser  │  Next.js 16 (App Router)                                                      │
  ─────────────► │  src/app        mobile-first screens (report, issues, school, admin, reviewer) │
                 │  src/app/api    route handlers: parse → authorise → service → envelope         │
                 │  src/server     auth (signed cookie), services, Postgres (Drizzle), Bona AI    │
                 │  src/blockchain LedgerPort → viem → BonaRegistry (three role-bound signers)    │
                 └───────┬─────────────────────────────┬────────────────────────────────┬────────┘
                         │ private files               │ JSON-RPC (Fuji)                │ AI Gateway
                 ┌───────▼────────┐          ┌─────────▼──────────┐             ┌────────▼────────┐
                 │ Evidence store │          │ BonaRegistry.sol   │             │ Claude via      │
                 │ (Vercel Blob,  │          │ chain id 43113     │             │ Vercel AI GW    │
                 │  private)      │          │ digests + ids only │             │ (optional)      │
                 └────────────────┘          └─────────▲──────────┘             └─────────────────┘
                                                       │ own RPC, never the app API
                                             ┌─────────┴──────────┐
                                             │ BonaBlock Verify   │  Vercel project `bona-verify`
                                             │ (verifier/)        │  file/document + receipt → ✓/✗
                                             └────────────────────┘
```

## The one rule everything enforces

> A report is not protection. A repair claim is not verification.

| Layer    | How it is enforced                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types    | `ROLE_PERMISSIONS`: no role holds both `repair:claim` and `repair:verify` (tested).                                                                              |
| API      | `POST /api/issues/:id/verification` requires `repair:verify`; a school admin gets 403.                                                                           |
| Signing  | The server holds three different keys. The operation picks the key; nothing in a request can.                                                                    |
| Contract | `verifyRepair`/`disputeRepair` revert with `SchoolAdminCannotVerify` for any school admin of that school or anyone who ever acted for the school on that report. |
| Demo     | `POST …/verification/probe` simulates the call with the caller's key, so the audience sees the contract's refusal.                                               |

## Data boundaries

| Data                                       | Database | Private evidence store | Avalanche |
| ------------------------------------------ | :------: | :--------------------: | :-------: |
| Evidence files                             |          |           ✓            |           |
| Names, emails, report text, notes          |    ✓     |                        |           |
| Salted commitment documents (+ salt)       |    ✓     |                        |           |
| SHA-256 digests, bytes32 ids, roles, times |    ✓     |                        |     ✓     |

By design nothing personal is written on-chain, because it could never be removed (unit-tested, TS-12).

## What gets anchored, and how it is checked

| Off-chain record   | On-chain write                                   | Value written                               |
| ------------------ | ------------------------------------------------ | ------------------------------------------- |
| Report             | `registerReport(reportId, schoolId, commitment)` | SHA-256 of the salted `ReportDocument`      |
| Evidence file      | `registerEvidence(reportId, digest, kind)`       | SHA-256 of the exact bytes                  |
| Acknowledgement    | `acknowledgeReport(reportId)`                    | — (the act itself, by the school admin key) |
| Interim protection | `recordInterimProtection(reportId, commitment)`  | SHA-256 of the salted protection document   |
| Repair claim       | `claimRepair(reportId, commitment)`              | SHA-256 of the salted claim document        |
| Independent review | `verifyRepair` / `disputeRepair(reportId, c)`    | SHA-256 of the salted review document       |

`reportId` and `schoolId` are the UUIDs left-padded into `bytes32` (`idToBytes32`). The
salt stops anyone brute-forcing a short report from its public hash. BonaBlock Verify
recomputes the hash from the file or the document (including salt), reads the transaction
through its own RPC endpoint, decodes the BonaRegistry event, and compares. It never calls
the BonaBlock API, so it keeps working if BonaBlock is down or dishonest — for anyone who kept
the file (or document and salt) and its receipt.

## Reliability

- A report is saved and visible before the chain is touched; anchoring runs in the same
  request with a 15 s confirmation wait and otherwise stays `pending`.
- RPC outage → record kept, `ledger_jobs` row, retried by `POST /api/ledger/retry` (Vercel cron,
  once a day on the current plan; the route can also be called on demand).
- Every write is simulated (`eth_call`) before it is sent, so a contract refusal costs no gas
  and is reported with the contract's own error name.
- The UI shows "Recorded on Avalanche" only for a `confirmed` receipt on `eip155:43113`.
  The in-memory development ledger uses chain id `bona:memory` and is always labelled as sample data.

## Deployment state (17 November 2026)

- Vercel projects `bona` and `bona-verify` exist. A preview of `bona` is ready but sits behind
  Vercel Authentication, so there is no public URL yet.
- That preview reports: database PGlite, evidence store Blob, ledger in-memory, assistant fallback.
- **Postgres is not attached yet.** The preview's database is in memory, per instance, so data does
  not persist. Without Blob configured the evidence store falls back to temporary disk.
- **`BonaRegistry` is not on Fuji.** The diagram above shows the intended production wiring.

## Where things live

| Path                                                    | Owner stream | Notes                                                          |
| ------------------------------------------------------- | ------------ | -------------------------------------------------------------- |
| `contracts/`                                            | Blockchain   | Hardhat 3, Solidity 0.8.28, 26 tests, Fuji deploy/role scripts |
| `src/shared/`                                           | Foundation   | Zod schemas, roles, status machine, commitments, `LedgerPort`  |
| `src/blockchain/`                                       | Integration  | viem adapter, env-based ledger selection                       |
| `src/server/`                                           | Integration  | auth, services, DB, evidence, Bona AI                          |
| `src/app`, `src/features`, `src/components`, `src/data` | Frontend     | screens, view models, HTTP client                              |
| `verifier/`                                             | Integration  | standalone BonaBlock Verify app + CLI                          |
| `docs/research`, `docs/demo`                            | Research     | evidence, pitch, QA scenarios, demo data                       |
