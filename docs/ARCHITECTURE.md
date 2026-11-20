# Architecture

Bona Chain is one Next.js application, one Solidity contract (`BonaRegistry`)
and one deliberately separate verifier (Bona Chain Verify). A shorter version
for judges is in `docs/hackathon/ARCHITECTURE.md`.

This document describes the reporting and verification flow, which is built.
The procurement trail and the Bona Chain contracts that are being added on top
of it are specified in `docs/merged/BUILD_BRIEF.md`.

This document describes the code on `integration/bona-release`. Whether a
feature has been tested, deployed or run on Avalanche is recorded only in
`docs/hackathon/FEATURE_MATRIX.md`.

## Modules

| Module                         | Location                                         | Built by    | Responsibility                                                                  |
| ------------------------------ | ------------------------------------------------ | ----------- | ------------------------------------------------------------------------------- |
| Public application             | `src/app/`, `src/features/`, `src/components/`   | Frontend    | Screens. Talks to the backend over HTTP only.                                   |
| Frontend data layer            | `src/data/`                                      | Frontend    | `BonaApi`: an HTTP client (`http-api.ts`) and browser fixtures. View models.    |
| Shared interfaces              | `src/shared/`                                    | Foundation  | Schemas, roles, status rules, hashing, on-chain ids, `LedgerPort`.              |
| API                            | `src/app/api/`                                   | Integration | Thin route handlers: parse, authorise, call `src/server`, respond.              |
| Authentication and permissions | `src/server/auth/`                               | Integration | Signed cookie sessions, scrypt password hashes, permission checks.              |
| Report services                | `src/server/reports/`                            | Integration | Create, endorse, evidence, school actions, review, anchoring, similar reports.  |
| Database                       | `database/`, `src/server/db/`                    | Integration | Drizzle schema and migrations. Postgres, or PGlite when unconfigured.           |
| Private evidence storage       | `src/server/evidence/`                           | Integration | Checks uploads, stores files privately, exposes only digests and metadata.      |
| Ledger adapter                 | `src/blockchain/`, `src/server/ledger/memory.ts` | Integration | `LedgerPort` over viem for `BonaRegistry`; in-memory ledger for development.    |
| Contract                       | `contracts/`                                     | Blockchain  | `BonaRegistry` for Avalanche Fuji, tests, deploy and role scripts.              |
| Bona AI                        | `src/server/ai/`                                 | Integration | Guided reporting grounded in recorded cases. Never writes records or the chain. |
| Bona Chain Verify              | `verifier/` (`bona-verify`)                      | Integration | Recomputes digests and checks them against the chain through its own RPC.       |

The decisions that shaped this split are D1–D9 in
`docs/coordination/DEPENDENCIES.md`. In short: `BonaRegistry` is the contract of
record and `LedgerPort` mirrors it (D1); the shared status, category and role
vocabularies are canonical (D2, D5, D6); on-chain ids are `idToBytes32(uuid)`
(D3); the app holds three role keys named `LEDGER_*_PRIVATE_KEY` (D4); the
backend was built on the integration branch (D7); the verifier is a standalone
app (D8); and nothing is reported as on-chain until Fuji is deployed (D9).

## How the modules communicate

```
 Browser
    │  HTTPS, JSON or multipart. Envelope { data } / { error } from src/shared/api.ts
    ▼
 src/app/api ──► src/server ──┬──► database             Postgres, or PGlite locally
   route()        services    ├──► evidence store       private Vercel Blob, or local disk
                              ├──► Bona AI              Vercel AI Gateway, or keyword fallback
                              └──► LedgerPort ──► src/blockchain (viem) ──► BonaRegistry on Fuji
                                       └────────► in-memory ledger (bona:memory)      ▲
                                                                                      │
 Bona Chain Verify ───────────── its own RPC endpoint (VERIFY_RPC_URL) ────────────────┘
   file or document + receipt in, verdict out. Never calls the Bona Chain API.
```

Rules, enforced by ESLint where marked:

1. `src/components/` never imports `src/server/` or `src/blockchain/` _(lint)_.
2. `src/shared/` imports nothing from the app, Next.js or React _(lint)_.
3. Only `src/blockchain/` imports a chain library. The backend sees `LedgerPort`.
4. `verifier/` is a separate package and cannot import the app. It re-implements
   hashing and `idToBytes32` on purpose, so that it does not share code that
   could share a bug, or a lie, with the system it checks.
5. Bona AI output is a suggestion shown to a person. It is never stored as a
   case event or anchored without a human action.

## Request handling

Every route handler is wrapped in `route()` from `src/server/http.ts`. It turns
an `HttpError`, a Zod validation error or a `LedgerError` into the shared error
envelope with the status from `API_ERROR_STATUS`.

`getContext()` in `src/server/context.ts` builds the process-wide dependencies
once: the validated environment, the database (migrated, and seeded if empty),
the ledger, the evidence store and the session secret. `begin(request)` in
`src/server/request.ts` adds the signed-in session for one request.

Routes are grouped by who may call them. The full list, with bodies and
results, is `docs/coordination/API_ROUTES.md`.

| Group          | Routes                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication | `POST`, `GET`, `DELETE /api/auth/session`                                                                                                  |
| Public reads   | `/api/schools`, `/api/issues`, `/api/receipts/:reference`, `/api/verify/evidence`, `/api/ledger`, `/api/issues/:id/documents/:recordId`    |
| Community      | `POST /api/reports`, `POST /api/issues/:id/evidence`, `PUT /api/issues/:id/endorsement`, `POST /api/issues/similar`, `POST /api/assistant` |
| School admin   | `GET /api/admin/queue`; `POST /api/issues/:id/assessment`, `progress`, `protection`, `repair-claim`, `decline`                             |
| Reviewer       | `GET /api/reviewer/queue`; `POST /api/issues/:id/verification`, `verification/probe`                                                       |
| Private file   | `GET /api/evidence/:id/file` (needs `evidence:read`)                                                                                       |
| Operations     | `GET /api/health`, `POST /api/ledger/retry`, `POST /api/demo/reset`                                                                        |

The API speaks the frontend's view models (`Issue`, `School`, `SubmissionReceipt`
in `src/data/types.ts`). `src/server/view.ts` maps the shared domain onto them,
for example `submitted` → `reported` and `rejected` → `declined`. Stored values
are always the shared ones.

## Writing a record (example: a new report with a photo)

1. The browser sends a multipart `POST /api/reports`. No session is needed.
2. `checkUploads` rejects files over 10 MB and anything that is not a JPEG,
   PNG, WebP, HEIC image or a PDF. The type is read from the file's first
   bytes, not from what the browser claims. It computes `sha256Hex(bytes)`.
3. The file goes to the private evidence store. The report, its salted
   `ReportDocument`, the evidence commitment and the case events are saved to
   the database. The report is now visible.
4. In the same request the backend calls `LedgerPort.registerReport` and
   `registerEvidence`, signed by the registrar key, and waits up to 15 seconds
   for confirmation.
5. The response is a `SubmissionReceipt` with the reference `BB-YYYY-NNNNNN`.

The outcome of step 4 is one of three states per record:

| State                         | Meaning                   | What happens next                              |
| ----------------------------- | ------------------------- | ---------------------------------------------- |
| `receipt.status: "confirmed"` | Mined                     | Nothing                                        |
| `receipt.status: "pending"`   | Sent, not yet mined       | Refreshed by `POST /api/ledger/retry`          |
| `receipt: null`, failed       | The RPC endpoint was down | A `ledger_jobs` row; re-sent by the same route |

`POST /api/ledger/retry` is guarded by `CRON_SECRET`. A Vercel cron calls it
once a day (`vercel.json`), and it can be called on demand. A chain outage
never blocks reporting.

The viem adapter simulates every write with `eth_call` before sending it, so a
contract refusal costs no gas and comes back with the contract's own error name.

## The verification rule, layer by layer

> A report is not protection. A repair claim is not verification.

| Layer    | How it is enforced                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Types    | `ROLE_PERMISSIONS`: no role holds both `repair:claim` and `repair:verify` (tested).                                  |
| API      | `POST /api/issues/:id/verification` requires `repair:verify`. A school administrator gets 403 `forbidden`.           |
| Signing  | The server holds three different keys. The operation picks the key; nothing in a request can.                        |
| Contract | `verifyRepair` and `disputeRepair` revert with `SchoolAdminCannotVerify` for a school administrator of that school.  |
| Demo     | `POST /api/issues/:id/verification/probe` simulates the call with the caller's key and shows the contract's refusal. |

## Honest receipts

`GET /api/ledger` and `LedgerPort.info()` say which ledger is in use. The
interface shows "Recorded on Avalanche" only for a `confirmed` receipt whose
`chainId` is `eip155:43113`. Receipts from the in-memory ledger carry the chain
id `bona:memory` and are always labelled as sample data. With `LEDGER_MODE=off`
every write is refused with `not_configured` and records keep a null receipt.

## Bona Chain Verify

A separate Next.js app and CLI in `verifier/`, deployed as its own project. It
takes a receipt plus the evidence file or commitment document, recomputes the
hash, reads the transaction through `VERIFY_RPC_URL`, decodes the
`BonaRegistry` event and compares. Its verdicts are `VERIFIED`, `MISMATCH`,
`NOT_FOUND`, `REJECTED` and `CANNOT_VERIFY`. It reads only `VERIFY_*`
variables and never calls the Bona Chain API, so it keeps working if Bona Chain
is down or dishonest.

`GET /api/issues/:id/documents/:recordId` hands out the salted document and
receipt that a person pastes into Bona Chain Verify.

## Privacy boundary

| Data                                          | Database | Evidence store | Chain |
| --------------------------------------------- | :------: | :------------: | :---: |
| Evidence files                                |          |       ✓        |       |
| Names, emails, report text, notes             |    ✓     |                |       |
| Salted commitment documents and their salt    |    ✓     |                |       |
| SHA-256 digests, ids as bytes32, roles, times |    ✓     |                |   ✓   |

Nothing personal is ever written on-chain, because it could never be removed.
The threat model is in `SECURITY.md`.

## Configuration

All variables are documented in `.env.example` and validated by
`src/server/env.ts`. None is required to run locally: the defaults are PGlite,
the in-memory ledger, local-disk evidence and the Bona AI keyword fallback.
`GET /api/health` reports which of each is in use. The README has the full
table.
