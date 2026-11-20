# Frontend integration points

Branch `feature/frontend`. The frontend for **Bona Chain for Schools** runs today on
development fixtures. This document lists what has to be connected for it to run on
real data. The HTTP contract itself is owned by the integration lead in
`docs/coordination/API_ROUTES.md` on `integration/bona-release`.

## How the frontend gets data

Every screen calls `getApi()` from `src/data/api.ts` and nothing else. `BonaApi` in that
file is the complete list of what the UI needs from a backend.

| Piece                  | Location                           | Notes                                    |
| ---------------------- | ---------------------------------- | ---------------------------------------- |
| Interface              | `src/data/api.ts`                  | One method per backend capability        |
| View types             | `src/data/types.ts`                | Reuses `@/shared` types where they exist |
| Errors                 | `src/data/errors.ts`               | `ApiError` with the backend error codes  |
| Session store          | `src/data/session.ts`              | `useSession`, `signIn`, `signOut`        |
| Fixture implementation | `src/data/fixtures/fixture-api.ts` | In-browser, sessionStorage, no network   |
| Sample data            | `src/data/fixtures/seed.ts`        | Invented schools, issues and accounts    |
| Scripted assistant     | `src/data/fixtures/assistant.ts`   | Keyword matching, not a model            |

**To connect the backend:** return an HTTP implementation of `BonaApi` from `getApi()`
and set `USING_FIXTURES` to `false`. That constant removes the "Preview with sample
data" banner, the Bona AI preview notice and the "sample data" line on the verification
refusal. The preview accounts on the sign-in screen disappear on their own, because only
the fixture implementation provides `sampleAccounts`. No screen changes.

## `BonaApi` methods and their routes

| `BonaApi` method                          | Route in `API_ROUTES.md`                    | Who                  |
| ----------------------------------------- | ------------------------------------------- | -------------------- |
| `getSession` / `signIn` / `signOut`       | `GET` / `POST` / `DELETE /api/auth/session` | anyone               |
| `searchSchools(query)`                    | `GET /api/schools?q=`                       | public               |
| `getSchool(id)`                           | `GET /api/schools/:schoolId`                | public               |
| `listIssues(filter)`                      | `GET /api/issues`                           | public               |
| `getIssue(idOrReference)`                 | `GET /api/issues/:idOrReference`            | public               |
| `findSimilarIssues({schoolId, text})`     | `POST /api/issues/similar`                  | public               |
| `getSubmissionReceipt(reference)`         | `GET /api/receipts/:reference`              | public               |
| `findEvidenceByDigest(digest)`            | `GET /api/verify/evidence?digest=`          | public               |
| `getRecordProof(issueId, recordId)`       | `GET /api/issues/:id/documents/:recordId`   | public               |
| `askAssistant(history, question)`         | `POST /api/assistant`                       | public               |
| `submitReport(input)`                     | `POST /api/reports` (multipart)             | reporter             |
| `addEvidence(issueId, uploads, purpose)`  | `POST /api/issues/:id/evidence` (multipart) | reporter             |
| `setEndorsement(issueId, affected)`       | `PUT /api/issues/:id/endorsement`           | reporter             |
| `listSchoolQueue(schoolId)`               | `GET /api/admin/queue`                      | school admin         |
| `startAssessment(issueId, note)`          | `POST /api/issues/:id/assessment`           | school admin         |
| `recordProgress(issueId, note)`           | `POST /api/issues/:id/progress`             | school admin         |
| `recordInterimProtection(issueId, text)`  | `POST /api/issues/:id/protection`           | school admin         |
| `submitRepairClaim(issueId, note, files)` | `POST /api/issues/:id/repair-claim`         | school admin         |
| `declineIssue(issueId, reason)`           | `POST /api/issues/:id/decline`              | school admin         |
| `listAssignedReviews()`                   | `GET /api/reviewer/queue`                   | independent reviewer |
| `verifyCompletion` / `disputeCompletion`  | `POST /api/issues/:id/verification`         | independent reviewer |
| `probeVerification(issueId)`              | `POST /api/issues/:id/verification/probe`   | any staff role       |

Failed calls should reject with `ApiError` using the backend's error code. The sign-in
screen reads `unauthenticated`; other screens show a general "try again" message.

## Vocabulary (decisions D2, D5, D6)

- **Statuses.** The UI has seven: `reported`, `under_assessment`, `being_addressed`,
  `repair_claimed`, `independently_verified`, `disputed`, `declined`. The backend maps
  the shared `ReportStatus` onto them.
- **Declined reason.** The UI shows the note of the latest timeline event of type
  `declined` as the public reason. The backend must return that event.
- **Categories.** `classrooms` is now `learning_resources`. The UI still offers
  `sanitation`, `water`, `electricity` and `buildings`, which are not in the shared
  `ReportCategory`. This needs a decision: add them to the shared list, or cut the UI list.
- **Roles.** `SessionRole` in `src/data/types.ts` mirrors the shared `UserRole`
  (`reporter`, `school_admin`, `district_official`, `independent_reviewer`). It should be
  replaced by the shared import once this branch has the updated `src/shared`.

## Ledger state

The UI renders `LedgerRecord` (`src/data/types.ts`):

- `{ source: "none" }` — nothing written.
- `{ source: "simulated" }` — sample. Carries no transaction data.
- `{ source: "ledger", receipt }` — a `BlockchainReceipt` from `@/shared`.

"Recorded on Avalanche", transaction details and an explorer link are shown only when the
receipt's `chainId` is `eip155:43113` (Fuji) or `eip155:43114` (C-Chain). A receipt from
any other network, including the in-memory ledger `bona:memory`, is shown as a sample.
The panel reads only `chainId`, `txId`, `status`, `blockNumber` and `blockTimestamp`, so
it works with both the old and the new receipt shape.

### Copy receipt

Evidence items and timeline entries whose ledger state is not `none` show "Copy receipt".
It calls `getRecordProof` with the evidence id or the timeline event id and copies the
`receipt` field of the response as JSON. Timeline entries of type `reported`,
`interim_protection`, `repair_claimed`, `verified` and `disputed` also show "Copy
document", which copies the `document` field: the salted commitment document the verifier
needs to recompute the commitment. After either copy, "Open in Bona Chain Verify" links to
`NEXT_PUBLIC_VERIFY_URL`, or to `/verify` when that is not set. In fixture mode both are
labelled samples (`sample: true`, no transaction, no salt), which the verifier refuses.

## Sign-in and roles

- `/sign-in` signs in with email and password and returns to `?next=` (same-site paths
  only) or to the role's home page.
- `/admin` requires `school_admin`; `/reviewer` requires `independent_reviewer`. Anyone
  else sees a prompt to sign in. There is no client-side role switch.
- The header shows the signed-in display name and role, with "Sign out".
- The gate is a courtesy. The backend must refuse the data and the actions itself; the
  fixture layer does the same, so the UI is tested against refusals.

## Open decisions

1. **Reporting and "I'm affected too" need a signed-in reporter** in `API_ROUTES.md`. The
   UI does not ask for sign-in on those journeys yet. On the live API they will be refused
   for signed-out visitors. Either the UI adds a sign-in step, or the backend accepts
   anonymous visitors. This is a product decision: a sign-in step is a real barrier for
   older caregivers.
2. **`description` is optional in the form.** The UI sends the title as the description
   when it is left empty.
3. **Fields the backend must supply per issue:** endorsement count and `endorsedByMe`,
   interim protection, responsible authority, independent review state and note, evidence
   purpose, free-text `location`; and per school: participation and counts.

## Not built yet

| Area                        | Current state                                                         | Needs                                          |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| Evidence upload             | Fingerprint computed in the browser; file bytes are not sent anywhere | Private evidence store and upload endpoint     |
| Evidence viewing            | Reviewer sees metadata and fingerprints only                          | Authorised file URLs for reviewers and admins  |
| Bona AI                     | Scripted keyword answers, labelled as a preview                       | AI service behind `askAssistant`               |
| Blockchain                  | No ledger calls. Fixtures show `none` or a labelled sample            | Receipts from BonaRegistry via the backend     |
| Bona Chain Verify           | `/verify` checks a fingerprint against the app's records              | Direct on-chain lookup, independent of the app |
| District official           | Can sign in; has no screen of their own                               | A decision on what a district official sees    |
| Translations                | English only. All strings are in `src/i18n/en.ts`                     | Translated message files and a language picker |
| Notifications               | None                                                                  | SMS or WhatsApp updates for reporters          |
| South African Sign Language | Not implemented and not claimed anywhere in the UI                    | A decision on whether and how to support it    |

## Notes for the integration lead

- This branch started from a copy of the uncommitted scaffold, because `main` had no
  commits. The first commit is that copy.
- Files changed outside frontend-only folders: `src/app/layout.tsx`, `src/app/page.tsx`,
  `src/app/page.test.tsx`, `src/app/globals.css`, `src/components/ui/button.tsx`,
  `src/components/ui/card.tsx`. `e2e/home.spec.ts` is replaced by `e2e/screens.spec.ts`.
- No changes to `package.json`, the lockfile, `src/shared`, `src/server`, `contracts` or
  `verifier`. No new dependencies.
- Browser tests sign in through the form with the fixture accounts in
  `e2e/support.ts` (`accounts`). Against the live backend these need the seeded demo
  accounts instead.
- Playwright must run on its own port when another dev server is using 3000:
  `PORT=3100 pnpm e2e`. The specs warm up every route first, because the dev server
  compiles routes on first request.
