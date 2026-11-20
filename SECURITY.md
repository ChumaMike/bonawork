# Security

Bona Chain is a hackathon build that runs on **Avalanche Fuji, a test network**,
with **synthetic demo accounts**. It has not had a security audit. This document
says what the design protects, how, and what it does not protect yet.

Bona Chain adds a procurement trail (work order, invoice, delivery record,
three-way match, release instruction) to the reporting and verification flow.
The sections on the trail and on Bona AI describe controls that exist in code
and tests today; the contracts and routes of the trail are still being built,
and [Known limits](#known-limits) says so.

Report a problem privately to the owners of the `obxalethia-star/BonaChain` repository.
Please do not open a public issue for it.

## What we protect

| Asset                         | Why it matters                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| The verification rule         | A school must never be able to mark its own repair as verified.                             |
| Reporter identity             | People report on institutions that have power over them or their children.                  |
| Evidence files                | Photos may show children, staff or private places.                                          |
| Integrity of the record       | Nobody, including Bona Chain, should be able to rewrite what was reported or when.          |
| The three ledger signing keys | Whoever holds one can write to the contract in that role.                                   |
| Amounts, suppliers and names  | Prices, supplier names, documents and people's names are for the people handling an order.  |
| The release decision          | A release instruction must need a matched invoice, a verified repair and a separate person. |

## Who we defend against

1. **A school administrator** who wants a report to disappear or a repair to
   count as verified without independent review.
2. **A signed-in user** acting outside their role or their institution.
3. **An outside visitor** forging a session, reading private evidence, or using
   the sign-in page to send a victim to another site.
4. **Bona Chain itself**, or whoever controls its server and database, quietly
   editing a record after the fact.

## Controls

### Roles and permissions

- Eight roles: `reporter`, `school_admin`, `district_official`,
  `independent_reviewer`, and for the procurement trail `buyer`, `supplier`,
  `receiving_officer` and `payment_approver`. Permissions are a fixed table,
  `ROLE_PERMISSIONS` in `src/shared/roles.ts`.
- A test asserts that no role holds both `repair:claim` and `repair:verify`.
- Every protected route checks the session, then the permission, then the
  institution: a school administrator may act only on reports for their own
  institution (`requirePermission`, `requireInstitution` in
  `src/server/auth/session.ts`).
- There is no client-side role switch. The role comes from the database row of
  the signed-in user, re-read on every request, so a role change takes effect
  immediately.
- The frontend hides controls a role cannot use, but that is presentation. The
  backend makes the decision.

### The verification rule is enforced four times

| Layer    | Control                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Types    | The permission table above.                                                                                   |
| API      | `POST /api/issues/:id/verification` returns 403 `forbidden` without `repair:verify`.                          |
| Signing  | The operation chooses the signing key. No request field can select a key.                                     |
| Contract | `BonaRegistry.verifyRepair` reverts with `SchoolAdminCannotVerify` for a school administrator of that school. |

The contract check is the one that does not depend on trusting the Bona Chain
server. Once `BonaRegistry` is deployed, a compromised backend holding the
school administrator key still cannot produce a `RepairVerified` event.

### Keys stay on the server

- Three different keys, one per on-chain role: `LEDGER_REGISTRAR_PRIVATE_KEY`,
  `LEDGER_SCHOOL_ADMIN_PRIVATE_KEY`, `LEDGER_REVIEWER_PRIVATE_KEY`.
  `src/server/env.ts` refuses to start if any two are the same.
- They are read only by server code. None has a `NEXT_PUBLIC_` name, so none is
  bundled for the browser. Users never hold a wallet; the platform signs for them.
- The ledger adapter accepts only Fuji (`eip155:43113`) and refuses mainnet, so
  a misconfiguration cannot spend real funds. The keys must never hold real funds.
- Every write is simulated before it is sent. A refusal costs no gas.
- Keys, the session secret and the cron secret live in environment variables.
  `.env.local` and `contracts/.env` are git-ignored; only `.env.example` files
  with empty values are committed. CI builds without any secret.

### No personal data on-chain

Anything written to a public chain is permanent, so only these go on-chain:

- `bytes32` ids derived from random version-4 UUIDs (`idToBytes32`). Ids are
  never derived from personal data.
- SHA-256 digests of evidence files.
- SHA-256 commitments of **salted** documents. Report text is short and
  guessable; the random salt stops anyone recovering it from the public hash
  by guessing.
- The role of the signer, and the block time.

Names, emails, report text, notes and files stay off-chain. Endorsements are
not written on-chain at all.

### Reporter identity

- Reporting needs no account. A signed-out report stores no reporter id.
- A signed-in reporter may tick "anonymous", which also stores no reporter id.
- Public views show a pseudonym such as `Reporter R-7F3A`, never a name.
- Emails and password hashes never appear in any shared type or API response.

### Private evidence storage

- Files go to a Vercel Blob store created with `access: "private"`, or to a
  git-ignored local directory in development. Storage keys are random UUIDs,
  not filenames.
- The public API returns digests and metadata only. The bytes are served by one
  route, `GET /api/evidence/:id/file`, which requires `evidence:read` and the
  institution check, and responds with `cache-control: private, no-store`.
- Uploads are limited to 10 MB and 10 files, and to JPEG, PNG, WebP, HEIC and
  PDF. The type is taken from the file's leading bytes; the type the browser
  claims is ignored, so a renamed file is rejected.
- The local disk store resolves every key and refuses one that leaves its
  directory.

### Sessions

- The cookie `bona_session` is `HttpOnly`, `SameSite=Lax`, `Path=/`, and
  `Secure` in production. It lasts 7 days.
- Its value is `payload.signature`, signed with HMAC-SHA256 under `AUTH_SECRET`
  and compared in constant time. The payload holds only a user id and an
  expiry. A forged, altered or expired cookie is treated as signed out.
- In production the server refuses to start a session without `AUTH_SECRET`
  (at least 32 characters). Outside production a fixed development secret is
  used, with a warning.
- Passwords are stored as scrypt hashes with a random salt per account.
- `SameSite=Lax` keeps the cookie off cross-site `POST`, `PUT` and `DELETE`
  requests. Every state-changing route uses one of those methods.

### Open-redirect guard

After sign-in the app returns the user to the page named in `?next=`. An
attacker could put another site there and send the link to a victim.
`safeNext` in `src/lib/safe-next.ts` returns the value only if it is a path on
this site. It rejects anything that does not start with `/`, anything with a
backslash or control character (browsers read `/\evil.example` as
`//evil.example`), and anything that resolves to another origin or collapses
into a protocol-relative path such as `/.//evil.example`. It is covered by
`src/lib/safe-next.test.ts`.

### The procurement trail

- **Separation of duties.** No role holds two of `order:approve`,
  `invoice:submit`, `receipt:record` and `release:authorise`, and the role that
  authorises holds neither `repair:claim` nor `repair:verify`. Tests assert it
  (`src/shared/shared.test.ts`). Per case, the release gate also refuses a
  person who approved, invoiced, received or reviewed on that case
  (`same_person`).
- **The match is code.** `matchThreeWay` in `src/shared/procurement/match.ts`
  is pure and deterministic, with no tolerances. No person and no model can
  mark an invoice as matched.
- **The release gate is code.** `releaseGate` opens only when the report is
  `verified`, the latest invoice is matched on the current order version, the
  order is acknowledged and nothing was released before.
- **No money moves.** The last step records a release instruction on a test
  network. Nothing in the product says "paid".
- **Public responses carry no finance data.** The public trail is built from
  case events only: the step, the role, the time and the proof. Amounts,
  supplier names, documents and people's names are served only to signed-in
  procurement roles, filtered by `src/shared/procurement/visibility.ts`.

### Bona AI

The model has no tools. It cannot write a record, call the ledger, or act.
Every feature follows the same pattern (`src/server/ai/guard.ts`):

- Text written by people goes to the model inside a delimited DATA block, with
  the rule that what is inside is data and never an instruction.
- Email addresses, phone numbers and ID numbers are removed before anything is
  sent. Input is clamped (invoice text: 6 000 characters).
- The reply must be JSON of an exact shape. An unknown key, such as a status or
  a decision, refuses the whole reply.
- The provider gets 8 seconds. Any failure gives the code-written answer.
- The line that states an outcome is always written by code.

| Feature              | What the model sees                        | What code checks before using its text                                                                                                                       |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assistant            | Public records and the question            | Cited cases exist; an invented case number discards the answer; each case's recorded status is put first by code.                                            |
| Invoice draft        | The pasted invoice text                    | Every string and number must occur in the text, or it becomes empty. Totals are added again and a difference is flagged, never corrected. Nothing is stored. |
| Mismatch explanation | The rule engine's reason codes and numbers | The reason codes equal the engine's, every number is one of the engine's, and no word of decision appears.                                                   |
| What is blocking it  | The release gate's blocker codes           | The blockers equal the gate's and the text has no number. For a viewer who may not see finance data the model is not called at all.                          |

The tests for each feature use an "obedient attacker": a stand-in model that
returns exactly what an injected instruction asks for (`src/server/ai/*.test.ts`).
This limits what a manipulated model can cause. It does not make model text
true: a rewording can still be clumsy or incomplete, which is why the
code-written line is always shown with it.

### Operational routes

- `POST /api/ledger/retry` requires `CRON_SECRET`.
- `POST /api/demo/reset` wipes and re-seeds the database. It answers 404 unless
  `DEMO_RESET_ENABLED=true` **and** the request carries `CRON_SECRET`.

### Independent verification

Bona Chain Verify (`verifier/`) is a separate application with its own RPC
endpoint and its own copy of the hashing code. It never calls the Bona Chain
API. A person holding a file or a commitment document and a receipt can check
them against Avalanche without trusting Bona Chain. That is the control against
adversary 4.

The app also refuses to overstate its own evidence. A receipt is shown as
"Recorded on Avalanche" only when it is `confirmed` on `eip155:43113`. Receipts
from the in-memory development ledger are always labelled as sample data.

## Known limits

These are accepted for the hackathon and must be fixed before any real use.

0. **The trail is being built.** The Bona Chain contracts
   (`BonaChainFactory`, `InstitutionOperations`, `InstitutionFinance`) are not
   deployed, and the procurement routes and screens are in progress. Until the
   contracts are deployed, the on-chain separation of duties for the finance
   steps protects nothing in the running app, and finance steps are simulated
   records.

1. **Fuji deployment.** Until `BonaRegistry` is deployed, the contract-level
   controls above exist in code and tests but protect nothing in the running
   app. See `docs/hackathon/FEATURE_MATRIX.md` for the current state.
2. **Demo accounts.** Every seeded account shares one password, which is
   published in the README. They are not real people. There is no
   registration, password reset, multi-factor sign-in or account lockout.
3. **Rate limiting is basic.** Since 19 November 2026 a Vercel firewall rule
   allows 20 `POST` requests per minute per IP address to `/api/reports` and
   `/api/assistant`, then answers 429 Too Many Requests. Sign-in, uploads and
   other routes are not limited, and someone with many IP addresses can still
   send spam reports, because reporting needs no account.
4. **Sessions cannot be revoked.** Signing out clears the cookie in that
   browser. A copied cookie stays valid until it expires.
5. **The platform holds all three keys.** The separation between school
   administrator and reviewer is real on-chain, but both keys sit on one
   server. A full server compromise can sign as either. Real use needs the
   reviewer key held by the reviewing body.
6. **Commitment documents are public.** `GET /api/issues/:id/documents/:recordId`
   returns a record's salted document so that anyone can verify it. It contains
   the report's title and description. It never contains the reporter's
   identity or any evidence file. Reporters should still not put names in the
   text of a report.
7. **Evidence is not scanned.** Files are type-checked but not checked for
   malware, and image metadata such as GPS position is not removed. Reviewers
   and school administrators who open a file see it as uploaded.
8. **No audit log of evidence reads**, and no security headers beyond the
   framework defaults.
9. **Local fallbacks are not durable.** Without `BLOB_READ_WRITE_TOKEN` a
   deployment stores evidence in a temporary directory, and without
   `DATABASE_URL` it uses an in-memory database. Both lose data on restart.
