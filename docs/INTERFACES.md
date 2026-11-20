# Shared interfaces

The contracts between teams. The code in `src/shared/` is the source of truth;
this document explains it. Import from `@/shared` — never from a file inside it.

Every shape is a Zod schema with an inferred TypeScript type of the same name
(`ReportSchema` → `Report`). Validate with the schema wherever data crosses a
boundary: HTTP request, HTTP response, database row, chain read.

These interfaces follow the `BonaRegistry` contract and the integration
decisions D1–D9 in `docs/coordination/DEPENDENCIES.md`. Where this document and
the contract's ABI disagree, the ABI wins and this document has a bug — report
it.

Two vocabularies exist on purpose. The **shared domain** described here is what
is stored, hashed and anchored. The **frontend view models** in
`src/data/types.ts` (`Issue`, `School`, `SubmissionReceipt`) are what the HTTP
API returns; `src/server/view.ts` maps one onto the other. The mapping table is
at the end of `docs/coordination/API_ROUTES.md`.

## Changing an interface

`src/shared/` and this file are owned by the **Foundation lead**. Nobody else edits them.

1. Tell the integration lead, or add a line under "Requested changes" at the
   bottom of this file in your own branch.
2. The change is made with tests and merged into `integration/bona-release`.
3. Feature branches pick it up by merging that branch.

`src/shared/ports.ts`, `src/server/env.ts`, `.env.example` and
`src/server/ledger/` are maintained on `integration/bona-release` by the
integration lead.

Adding an optional field or a new enum value at the end is routine. Renaming or
removing anything, or changing what a commitment hashes (section 9), breaks
other teams and needs the integration lead's agreement first.

## 1. Primitives — `primitives.ts`

| Name          | Format                                  | Example                                |
| ------------- | --------------------------------------- | -------------------------------------- |
| `Id`          | UUID string                             | `3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b` |
| `IsoDateTime` | UTC ISO-8601                            | `2026-11-16T09:30:00.000Z`             |
| `Hex32`       | `0x` + 64 **lower-case** hex (32 bytes) | `0xba78…15ad`                          |

Every digest, commitment, transaction hash and on-chain id is a `Hex32`
(Solidity `bytes32`).

## 2. Identifiers: off-chain and on-chain

Off-chain, every record has a UUID `Id`. On-chain, everything is `bytes32`.
One set of functions in `commitment.ts` converts; use them, do not re-derive.

| On-chain value         | Function                      | Rule                                                            |
| ---------------------- | ----------------------------- | --------------------------------------------------------------- |
| `reportId`, `schoolId` | `idToBytes32(id)`             | The UUID's 16 bytes in the low half of the bytes32, zeros above |
| evidence digest        | `sha256Hex(bytes)`            | SHA-256 of the exact file bytes, unsalted                       |
| commitment             | `computeCommitment(document)` | SHA-256 of the canonical JSON of a salted document (§9)         |

`schoolId` is `idToBytes32(institution.id)`. The contract treats it as an
opaque `bytes32`, so it works for any kind of institution.

Ids must be random UUIDs (version 4). Never derive one from personal data.

`contracts/scripts/grant-roles.ts` takes the same value: set `BONA_SCHOOL_ID` to
the institution UUID and compare the `schoolId` it prints with
`idToBytes32(institution.id)`.

## 3. Institutions and schools

`Institution` is anything a report can be about: `id`, `kind`, `name`,
`province`, `district`, `externalRef`. `kind` is currently only `"school"`.

`School` is an `Institution` with `kind: "school"` plus `phase`
(`primary | secondary | combined | special`) and `learnerCount`. For schools,
`externalRef` is the national EMIS number.

Reports reference `institutionId`, not a school id. A new sector is a new
`kind`, not a new schema. (The contract calls the on-chain id `schoolId`; it
is an opaque `bytes32` and works for any kind.)

## 4. Users and roles — `roles.ts`

`User` (public profile): `id`, `displayName`, `role`, `institutionId`, `createdAt`.
Email, phone and credentials are backend-only and never appear in a shared type.

| Role                   | Who                                            | On-chain role (`CHAIN_ROLE_FOR_USER_ROLE`) |
| ---------------------- | ---------------------------------------------- | ------------------------------------------ |
| `reporter`             | Learner, parent, teacher or community member   | `registrar` — the platform signs for them  |
| `school_admin`         | Acts for one institution (`institutionId` set) | `school_admin`                             |
| `district_official`    | Oversees many institutions; read-only          | none                                       |
| `independent_reviewer` | Checks repair claims                           | `reviewer`                                 |

`CHAIN_ROLE_CODE` gives the ABI numbers: registrar 1, school_admin 2, reviewer 3.
A visitor who is not signed in has no role. They can read public pages, submit
a report, add evidence of the problem to a report, and use BonaBlock Verify.
They cannot endorse. The platform's registrar key signs for them, as it does
for a signed-in reporter.

`district_official` exists in the types and can sign in, but has no dashboard
yet.

| Permission           | reporter | school_admin | district_official | independent_reviewer |
| -------------------- | :------: | :----------: | :---------------: | :------------------: |
| `report:create`      |    ✓     |              |                   |                      |
| `report:endorse`     |    ✓     |              |                   |                      |
| `report:read:own`    |    ✓     |              |                   |                      |
| `report:read:school` |          |      ✓       |                   |                      |
| `report:read:all`    |          |              |         ✓         |          ✓           |
| `report:acknowledge` |          |      ✓       |                   |                      |
| `case:update`        |          |      ✓       |                   |                      |
| `protection:record`  |          |      ✓       |                   |                      |
| `repair:claim`       |          |      ✓       |                   |                      |
| `repair:verify`      |          |              |                   |          ✓           |
| `evidence:upload`    |    ✓     |      ✓       |                   |          ✓           |
| `evidence:read`      |          |      ✓       |         ✓         |          ✓           |
| `audit:read`         |          |              |         ✓         |          ✓           |

Use `can(role, permission)`. The backend enforces; the frontend may call `can`
only to hide controls. `report:create` and `evidence:upload` describe what a
signed-in role may do; the API also accepts a report and problem evidence from
a signed-out visitor, and refuses a report from a signed-in staff account.

**Invariant (tested):** no role holds both `repair:claim` and `repair:verify`.
The contract enforces the same rule with `SchoolAdminCannotVerify`. The
backend chooses the signing key from the signed-in user's role, never from a
request parameter.

## 5. Reports

`Report`: `id`, `reference` (`BB-YYYY-NNNNNN`), `institutionId`, `category`,
`title`, `description`, `status`, `endorsementCount`, `hasInterimProtection`,
`reporterId` (null if anonymous), `createdAt`, `updatedAt`, `commitment`, `receipt`.

- Categories: `sanitation`, `water`, `electricity`, `buildings`, `safety`, `learning_resources`, `other`.
- `CreateReportInput` is the validated input: `institutionId`, `category`, `title`,
  `description`, `anonymous`. The server assigns everything else; unknown fields are stripped.
  On the wire, `POST /api/reports` is multipart so that evidence files travel
  with it, and names the institution `schoolId`.
- `reporterId` is null for a signed-out report and for `anonymous: true`.
- `commitment` is `computeCommitment` of the report's `ReportDocument` (§9).

## 6. Endorsements

`Endorsement`: `id`, `reportId`, `userId`, `createdAt`. Means "this affects me too".

- At most one per user per report. A reporter cannot endorse their own report.
  Only a signed-in `reporter` can endorse; staff roles are refused.
- `Report.endorsementCount` is the number of endorsement rows.
- Endorsements are not evidence and are **not** written on-chain.

## 7. Status history

| Status           | On-chain `Status` (`CHAIN_STATUS_FOR_STATUS`) | Meaning                                              |
| ---------------- | --------------------------------------------- | ---------------------------------------------------- |
| `submitted`      | `reported` (1)                                | Registered                                           |
| `acknowledged`   | `acknowledged` (2)                            | The school has seen it                               |
| `in_progress`    | `acknowledged` (2) — off-chain only           | The school says work has started                     |
| `repair_claimed` | `repair_claimed` (3)                          | The school says it is fixed. Not yet proof           |
| `verified`       | `verified` (4)                                | An independent reviewer confirmed the repair. Final  |
| `disputed`       | `disputed` (5)                                | An independent reviewer rejected the claim           |
| `rejected`       | unchanged — off-chain only                    | The school declined the report, with a reason. Final |

```
submitted ──► acknowledged ──► in_progress ──► repair_claimed ──► verified
    │              │                ▲                │  ▲
    ▼              ▼                │                ▼  │
 rejected       rejected            └──────────── disputed
```

`acknowledged` may also go straight to `repair_claimed`.

- `STATUS_TRANSITIONS` / `canTransition(from, to)` — the only allowed moves.
- `PERMISSION_FOR_STATUS[to]` — the permission needed to enter a status.
- `CHAIN_STATUS_CODE` — the ABI numbers of the contract's `Status` enum.
- `StatusHistoryEntry` — one timeline row: `eventId`, `reportId`, `from`, `to`,
  `actorRole`, `reason`, `occurredAt`, `receipt`. A read model derived from case
  events (§10). `reason` is required when `to` is `rejected`.

`in_progress` and `rejected` exist only off-chain: they have no contract call
and no receipt. Interface labels map from these values; do not store labels.

There is deliberately no `resolved` or `fixed` status. The school can only say
`repair_claimed`; only an independent reviewer can produce `verified`.

## 8. Interim protection, repair claims and independent reviews

**`InterimProtection`** — `id`, `reportId`, `measure`, `recordedBy`, `createdAt`,
`commitment`, `receipt`. A temporary safety measure while the repair is
outstanding. Allowed from `acknowledged` until `verified`, any number of times.
It **never changes status**: the interface must not show a protected report as
repaired. `Report.hasInterimProtection` is the flag to display.

**`RepairClaim`** — `id`, `reportId`, `index`, `summary`, `claimedBy`, `outcome`
(`pending | verified | disputed`), `createdAt`, `commitment`, `receipt`.
Allowed from `acknowledged` or `disputed`. `index` equals the on-chain `claimIndex`.

**`IndependentReview`** — `id`, `reportId`, `claimId`, `reviewerId`, `outcome`
(`verified | disputed`), `findings`, `evidenceIds`, `createdAt`, `commitment`, `receipt`.

- Only allowed while the report is `repair_claimed`.
- The reviewer must never have acted as school admin for that institution.
- Review evidence must be registered **before** the review: after `verified`
  every on-chain write for the report reverts.

## 9. Evidence commitments and commitment documents — what gets hashed

**`EvidenceCommitment`** — `id`, `reportId`, `algorithm` (always `"sha256"`),
`digest`, `kind`, `sizeBytes`, `mediaType`, `createdAt`, `receipt`.

- `digest` = `sha256Hex(bytes)` of the exact uploaded file. Unsalted, so anyone
  holding the file can check it.
- `kind` and who may submit it (`EVIDENCE_KIND_ROLE`, `EVIDENCE_KIND_CODE`):

  | Kind     | Code | Submitted by             |
  | -------- | :--: | ------------------------ |
  | `report` |  0   | `reporter`, or a visitor |
  | `repair` |  1   | `school_admin`           |
  | `review` |  2   | `independent_reviewer`   |

- The file, its filename and its storage location are private and never appear in this shape.
- Accepted files: JPEG, PNG, WebP, HEIC and PDF, up to 10 MB each and 10 per
  request. The type is read from the file's bytes, not from the request.
- The same digest twice on one report is a `conflict`.

**Commitment documents.** A commitment is `computeCommitment(document)`:
SHA-256 of `canonicalJson(document)` (keys sorted, no whitespace, UTF-8).
Every document carries a random `salt` from `newSalt()`, because report text
is short and guessable and an unsalted hash could be brute-forced.

| Document (`type`)                                  | Fields besides `type` and `salt`                                                         | Written by                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| `ReportDocument` (`report`)                        | `reportId`, `institutionId`, `category`, `title`, `description`, `createdAt`             | `registerReport`                 |
| `InterimProtectionDocument` (`interim_protection`) | `protectionId`, `reportId`, `measure`, `createdAt`                                       | `recordInterimProtection`        |
| `RepairClaimDocument` (`repair_claim`)             | `claimId`, `reportId`, `summary`, `evidenceDigests`, `createdAt`                         | `claimRepair`                    |
| `ReviewDocument` (`review`)                        | `reviewId`, `reportId`, `claimId`, `outcome`, `findings`, `evidenceDigests`, `createdAt` | `verifyRepair` / `disputeRepair` |

The backend stores each document with its salt (table `commitment_documents`).
`GET /api/issues/:id/documents/:recordId` returns the document, its commitment
and its receipt. BonaBlock Verify recomputes the hash from the document and
compares it with the chain.

## 10. Case events and blockchain receipts

**`CaseEvent`** — the append-only timeline of a report: `id`, `reportId`,
`sequence`, `type`, `actorId`, `actorRole`, `occurredAt`, `subjectId`,
`anchoredValue`, `statusTo`, `reason`, `receipt`. Never updated or deleted.
Every type except `status_changed` mirrors exactly one contract event
(`CASE_EVENT_REGISTRY_EVENT`):

| Case event `type`             | Contract call             | Contract event              | Status after     | `anchoredValue`       |
| ----------------------------- | ------------------------- | --------------------------- | ---------------- | --------------------- |
| `report_registered`           | `registerReport`          | `ReportRegistered`          | `submitted`      | report commitment     |
| `evidence_registered`         | `registerEvidence`        | `EvidenceRegistered`        | unchanged        | evidence digest       |
| `report_acknowledged`         | `acknowledgeReport`       | `ReportAcknowledged`        | `acknowledged`   | null                  |
| `interim_protection_recorded` | `recordInterimProtection` | `InterimProtectionRecorded` | unchanged        | protection commitment |
| `repair_claimed`              | `claimRepair`             | `RepairClaimed`             | `repair_claimed` | claim commitment      |
| `repair_verified`             | `verifyRepair`            | `RepairVerified`            | `verified`       | review commitment     |
| `repair_disputed`             | `disputeRepair`           | `RepairDisputed`            | `disputed`       | review commitment     |

`status_changed` is the one off-chain-only type: a move to `in_progress` or
`rejected`, carried in `statusTo` (with `reason` for `rejected`). It has no
contract call and its `receipt` is always null.

`CASE_EVENT_RESULTING_STATUS` holds the "status after" column. Because every
contract event has `reportId` as its first indexed topic, one `getLogs` filter
on `idToBytes32(report.id)` returns the on-chain part of the timeline.

**`BlockchainReceipt`** — `chainId`, `contractAddress`, `txId`, `status`
(`pending | confirmed | failed`), `blockNumber`, `blockTimestamp`, `event`.

- `chainId` is CAIP-2: `AVALANCHE_CHAINS.fuji` = `eip155:43113`, `.mainnet` = `eip155:43114`.
  The app's ledger adapter accepts only Fuji. The in-memory development ledger
  uses `bona:memory`; a receipt with that chain id is sample data, not an
  Avalanche record.
- `blockNumber` and `blockTimestamp` are null until `confirmed`.
- `event` is one of `REGISTRY_EVENTS`.
- Snowtrace link: `https://testnet.snowtrace.io/tx/<txId>`.

**`LedgerPort`** (`ports.ts`) — the TypeScript side of the contract. One method
per contract write (`registerReport`, `registerEvidence`, `acknowledgeReport`,
`recordInterimProtection`, `claimRepair`, `verifyRepair`, `disputeRepair`) plus
`statusOf` (returns a `ChainStatus`), `getReceipt`, `info()` and `probeVerify`. Methods take off-chain `Id`s; the adapter derives
the `bytes32` ids and picks the signing key. There are three implementations,
chosen by `createLedger(env)` in `src/blockchain/index.ts`:

| `LEDGER_MODE` and configuration           | Implementation                                        | `info().live` |
| ----------------------------------------- | ----------------------------------------------------- | :-----------: |
| `auto` with every `LEDGER_*` value set    | `createViemLedger` in `src/blockchain/viem-ledger.ts` |     true      |
| `auto` with anything missing, or `memory` | `createMemoryLedger` in `src/server/ledger/memory.ts` |     false     |
| `off`                                     | every write rejects with `not_configured`             |     false     |

The backend calls the port from `src/server/`. No other code imports a chain
library.

- `info()` returns a `LedgerInfo`: `chainId`, `contractAddress`, `networkName`,
  `explorerTxUrl(txId)` and `live`. `live` is true only for a real chain adapter
  with every signer configured. The interface must check it before presenting
  a receipt as an Avalanche proof.
- `probeVerify({ reportId, as })` simulates `verifyRepair` with the key of the
  given `ChainRole`, without spending gas, and returns `{ allowed, revert }`,
  where `revert` is a contract error name or null. It exists so the contract's own `SchoolAdminCannotVerify` refusal can be shown.
- Every write rejects with a `LedgerError`. It has a `code` — one of
  `not_configured`, `unauthorized`, `self_verification`, `invalid_state`,
  `duplicate`, `not_found`, `rpc_unavailable`, `reverted` — and a
  `contractError`: the name of the `BonaRegistry` custom error (one of
  `CONTRACT_ERRORS`), or null when the failure did not come from the contract.

A record is valid and visible while its receipt is `pending` or null. Contract
errors `ReportAlreadyRegistered`, `DuplicateCommitment`, `DuplicateEvidence`
and `DuplicateProtection` arrive as code `duplicate`, mean "already anchored",
and are safe on retry.

## 11. HTTP API

Built on the integration branch (D7). The full route list, with bodies and
results, is `docs/coordination/API_ROUTES.md`; this section gives the rules
every route follows.

- Routes live under `/api`. Bodies are JSON, or multipart where files are sent.
- Success: `{ "data": … }`. Failure: `{ "error": { "code": string, "message": string } }`.
- Error codes: `unauthenticated` (401), `forbidden` (403), `not_found` (404),
  `invalid_input` (422), `invalid_transition` (409), `conflict` (409),
  `ledger_unavailable` (503). Types: `ApiErrorCode`, `API_ERROR_STATUS`,
  `ApiErrorSchema`, `apiSuccessSchema(schema)` in `api.ts`. An unexpected
  failure is a 500 with code `internal`, which is not part of `ApiErrorCode`.
- Handlers are wrapped in `route()` from `src/server/http.ts` and respond with
  `ok(data)`, or throw `HttpError(code, message)`.
- A contract refusal maps to an API error: `self_verification` and
  `unauthorized` → `forbidden`; `invalid_state` → `invalid_transition`;
  `duplicate` → `conflict`; `not_found` → `not_found`; anything else →
  `ledger_unavailable`.
- Responses carry the frontend view models, not the shared shapes (see the top
  of this document).

| Group          | Routes                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | `POST`, `GET`, `DELETE /api/auth/session`                                                                                                                                                           |
| Public reads   | `GET /api/schools`, `/api/schools/:schoolId`, `/api/issues`, `/api/issues/:idOrReference`, `/api/receipts/:reference`, `/api/verify/evidence`, `/api/ledger`, `/api/issues/:id/documents/:recordId` |
| Community      | `POST /api/reports`, `POST /api/issues/:id/evidence`, `PUT /api/issues/:id/endorsement`, `POST /api/issues/similar`, `POST /api/assistant`                                                          |
| School admin   | `GET /api/admin/queue`; `POST /api/issues/:id/assessment`, `/progress`, `/protection`, `/repair-claim`, `/decline`                                                                                  |
| Reviewer       | `GET /api/reviewer/queue`; `POST /api/issues/:id/verification`, `/verification/probe`                                                                                                               |
| Private file   | `GET /api/evidence/:id/file`                                                                                                                                                                        |
| Operations     | `GET /api/health`, `POST /api/ledger/retry`, `POST /api/demo/reset`                                                                                                                                 |

How the school and reviewer routes move a report:

| Route            | Status change                        | Contract call                                                       |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `…/assessment`   | `submitted` → `acknowledged`         | `acknowledgeReport`                                                 |
| `…/progress`     | → `in_progress`                      | none (off-chain `status_changed`)                                   |
| `…/protection`   | unchanged                            | `recordInterimProtection`                                           |
| `…/repair-claim` | → `repair_claimed`                   | `registerEvidence` (repair), then `claimRepair`                     |
| `…/decline`      | → `rejected`, public reason required | none (off-chain `status_changed`)                                   |
| `…/verification` | → `verified` or `disputed`           | `registerEvidence` (review), then `verifyRepair` or `disputeRepair` |

**Sessions.** Cookie `bona_session`: HttpOnly, SameSite=Lax, signed with
`AUTH_SECRET`. `Session` is `{ user: { id, displayName, role, institutionId },
permissions }`. There is no client-side role switch.

**Anchoring.** A write is saved first, then anchored in the same request with
a 15-second confirmation wait. A record's receipt is `confirmed`, `pending`,
or null when anchoring failed; failed and pending records are picked up by
`POST /api/ledger/retry`.

## 12. Environment variables

In `.env.example`, validated by `src/server/env.ts`. None is required locally.

| Group    | Variables                                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | `DATABASE_URL`, `PGLITE_DATA_DIR`, `AUTH_SECRET`, `EVIDENCE_STORAGE_DIR`, `BLOB_READ_WRITE_TOKEN`                                                                                                         |
| Demo     | `DEMO_ACCOUNT_PASSWORD`, `CRON_SECRET`, `DEMO_RESET_ENABLED`                                                                                                                                              |
| Ledger   | `LEDGER_MODE` (`auto \| memory \| off`), `LEDGER_RPC_URL`, `LEDGER_CHAIN_ID`, `LEDGER_CONTRACT_ADDRESS`, `LEDGER_REGISTRAR_PRIVATE_KEY`, `LEDGER_SCHOOL_ADMIN_PRIVATE_KEY`, `LEDGER_REVIEWER_PRIVATE_KEY` |
| Bona AI  | `AI_GATEWAY_API_KEY`, `AI_MODEL`                                                                                                                                                                          |
| Frontend | `NEXT_PUBLIC_API_SOURCE` (`live` calls the API; anything else shows browser fixtures)                                                                                                                     |

The three keys must be different, are server-side only, and must never hold
real funds. BonaBlock Verify reads only `VERIFY_RPC_URL`, `VERIFY_CHAIN_ID` and
`VERIFY_CONTRACT_ADDRESS`. The contracts package has its own
`contracts/.env.example`. The README describes each variable.

## Requested changes

_None yet._
