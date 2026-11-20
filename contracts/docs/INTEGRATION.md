# BonaRegistry — integration notes

For the BonaBlock backend (`apps/web/src/modules/blockchain`) and the independent verifier,
BonaBlock Verify (the `verifier` package).

> `docs/INTERFACES.md` did not exist when this was written. The section
> [Proposed additions to docs/INTERFACES.md](#proposed-additions-to-docsinterfacesmd) is the
> blockchain side's proposal; it has **not** been applied to any shared file.

## Network

| Item     | Value                                                   |
| -------- | ------------------------------------------------------- |
| Chain    | Avalanche Fuji C-Chain                                  |
| Chain ID | `43113`                                                 |
| RPC      | `https://api.avax-test.network/ext/bc/C/rpc`            |
| Explorer | `https://testnet.snowtrace.io`                          |
| Address  | `deployments/43113.json` → `address` (not deployed yet) |
| ABI      | `contracts/abi/BonaRegistry.json` / `.ts`               |

## Naming

- The contract is `BonaRegistry`. It was briefly called `GcinaRegistry` during development;
  nothing was deployed or integrated under that name, so there is no alias to support.
- A product "case" is a contract **report** (`reportId`). A product "approval" by a reviewer
  is `verifyRepair`.

## Identifiers and digests

Every on-chain value is a `bytes32`. Nothing human-readable goes on-chain.

| Value                                | How to compute it (off-chain)                                                |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `schoolId`                           | `idToBytes32(institution UUID)`: the 16 UUID bytes left-padded with zeros    |
| `reportId`                           | `idToBytes32(report UUID)` — a random UUID, never derived from personal data |
| evidence `digest`                    | `0x` + SHA-256 of the exact file bytes (same as `verifier.digestEvidence`)   |
| report / claim / review `commitment` | `0x` + SHA-256 of the canonical JSON document, **including a random salt**   |

The salt matters: report documents have low entropy (school, category, date), so an unsalted
hash could be guessed by brute force. Store the salt with the off-chain document.

The verifier's `digestEvidence` returns bare hex; prefix `0x` when sending to the contract and
strip it (the verifier already does) when comparing.

## Enums (numeric values in the ABI)

```
Role          0 None  1 Registrar  2 SchoolAdmin  3 Reviewer
Status        0 None  1 Reported   2 Acknowledged 3 RepairClaimed 4 Verified 5 Disputed
EvidenceKind  0 Report (Registrar) 1 Repair (SchoolAdmin) 2 Review (Reviewer)
ClaimOutcome  0 Pending 1 Verified 2 Disputed
```

## Signing keys the backend needs

Three separate keys per school, each used only for its own calls:

| Env var (suggested)             | Role        | Calls                                                                                     |
| ------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `BONA_REGISTRAR_PRIVATE_KEY`    | Registrar   | `registerReport`, `registerEvidence(kind=0)`                                              |
| `BONA_SCHOOL_ADMIN_PRIVATE_KEY` | SchoolAdmin | `acknowledgeReport`, `recordInterimProtection`, `registerEvidence(kind=1)`, `claimRepair` |
| `BONA_REVIEWER_PRIVATE_KEY`     | Reviewer    | `registerEvidence(kind=2)`, `verifyRepair`, `disputeRepair`                               |

- Each address needs a little test AVAX for gas.
- The owner must grant each role first (`pnpm roles:fuji`, addresses only).
- The backend must choose the signing key from the **authenticated user's role**, never from a
  request parameter. The contract will still reject a school admin who reaches `verifyRepair`,
  but only if the admin and reviewer really are different keys.
- Server-side only. None of these keys may reach the browser bundle.

## Call order

```
registerReport ─► registerEvidence(0)* ─► acknowledgeReport ─► registerEvidence(1)* ─► claimRepair
      ─► registerEvidence(2)* ─► verifyRepair            (closed)
                              └► disputeRepair ─► claimRepair ─► ... (repeat)
```

- `claimRepair` requires `Acknowledged` or `Disputed`.
- `recordInterimProtection(reportId, commitment)` may be called any number of times once the
  report is acknowledged and until it is `Verified`. It never changes the status, so the UI
  must not present a protected case as repaired.
- Evidence must be registered **before** `verifyRepair`; after `Verified` every write reverts.
- Treat a write as final only after the transaction receipt (`status === 1`). Fuji finality is ~1–2 s.

## Events (the audit trail)

`ReportRegistered`, `EvidenceRegistered`, `ReportAcknowledged`, `InterimProtectionRecorded`, `RepairClaimed`,
`RepairVerified`, `RepairDisputed` — all have `reportId` as the first indexed topic, so one
`getLogs` filter on `reportId` returns a report's full history in order. Store the transaction
hash of each write next to the off-chain record so the UI can link to Snowtrace.

Reads that avoid log scanning: `getReport`, `statusOf`, `getAllEvidence`, `getAllProtections`, `getAllClaims`, `hasActedForSchool(reportId, account)`,
`isEvidenceRegistered(reportId, digest)`, `reportIdByCommitment(commitment)`, `roleOf(schoolId, account)`.

The verifier should read these directly from an RPC node, not through the web app.

## Errors to map to user messages

| Custom error                                                                                    | Meaning                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `SchoolAdminCannotVerify(account, reportId)`                                                    | School tried to verify/dispute its own repair                       |
| `Unauthorized(account, schoolId, required)`                                                     | Caller lacks the required role for that school                      |
| `InvalidState(reportId, current)`                                                               | Call is out of order or a repeat (e.g. already claimed/verified)    |
| `ReportAlreadyRegistered` / `DuplicateCommitment` / `DuplicateEvidence` / `DuplicateProtection` | Duplicate submission — safe to treat as "already anchored" on retry |
| `ReportNotFound`, `SchoolNotRegistered`, `ZeroValue`                                            | Bad input                                                           |
| `RoleConflict(schoolId, account, existing)`                                                     | Account already holds another role for that school                  |

## Proposed additions to docs/INTERFACES.md

1. Chain: Fuji `43113`; contract address read from `contracts/deployments/43113.json`.
2. ABI source of truth: `contracts/abi/BonaRegistry.ts` (import, do not copy).
3. Digest rule: SHA-256, `bytes32`, `0x`-prefixed on-chain; commitments are salted.
4. Identifier rule: `schoolId` and `reportId` derivations as in the table above.
5. Three server-side signing keys with the env var names above.
6. Off-chain records keep `reportId`, salt, and the tx hash of every on-chain write.
