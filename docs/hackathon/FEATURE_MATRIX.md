# BonaBlock — feature matrix

Status key: **Built** = code merged on `integration/bona-release`; **Unit-tested** = covered by
vitest/Hardhat tests that pass; **Browser-tested** = exercised by Playwright with screenshots in
`docs/screenshots/`; **Live** = verified on the deployed app; **On-chain** = produced a real
Avalanche Fuji transaction. A dash means not yet. This table is updated only from real runs
(see `docs/coordination/STATUS.md` for evidence).

Evidence behind this version:

- Unit tests: 79 vitest tests (including `src/server/api.test.ts`), 26 Hardhat tests, 36 verifier tests.
- Browser tests: the 17-step demo run in Playwright (5/5) against the **production bundle with the
  in-memory ledger**, live data layer (`NEXT_PUBLIC_API_SOURCE=live`), 42 screenshots at
  375/390/768/1440 in `docs/screenshots/release/`.
- Live: not run. The same suite has not yet been run against the Vercel deployment, so every
  "Live" cell is a dash.
- On-chain: nothing. `BonaRegistry` is not on Fuji, so every "On-chain" cell is a dash.

## P0 — must work for the demo

| Feature                                                                | Built |     Unit-tested      |   Browser-tested   | Live | On-chain | Notes                                                                                                                     |
| ---------------------------------------------------------------------- | :---: | :------------------: | :----------------: | :--: | :------: | ------------------------------------------------------------------------------------------------------------------------- |
| Mobile report journey (school → problem → evidence → review → receipt) |   ✓   |          ✓           | ✓ 375/390/768/1440 |  –   |    –     | Live data layer; sign-in with the demo accounts                                                                           |
| Real evidence commitment (SHA-256 of bytes, computed on device)        |   ✓   |          ✓           |         ✓          |  –   |    –     | `EvidenceRegistered(reportId, digest, kind)`                                                                              |
| Report commitment (salted document → `registerReport`)                 |   ✓   |          ✓           |         –          |  –   |    –     | `computeCommitment` in `src/shared/commitment.ts`                                                                         |
| Accurate confirmation state (pending / confirmed / sample)             |   ✓   |          ✓           |         ✓          |  –   |    –     | Browser run shows "Sample record"; "Recorded on Avalanche" only for confirmed `eip155:43113` receipts                     |
| Separate school-admin and reviewer roles                               |   ✓   |          ✓           |         ✓          |  –   |    –     | `ROLE_PERMISSIONS` test: no role claims and verifies; each role signs in separately                                       |
| Rejection of unauthorised verification (app layer)                     |   ✓   |          ✓           |         ✓          |  –   |    –     | 403 `forbidden` from `POST …/verification`; refusal panel in demo step 12                                                 |
| Rejection of unauthorised verification (contract)                      |   ✓   | ✓ (26 Hardhat tests) |         –          |  –   |    –     | `SchoolAdminCannotVerify`. The browser run shows the in-memory ledger's refusal, not the contract's                       |
| Independent review (verify / dispute) with evidence                    |   ✓   |          ✓           |         ✓          |  –   |    –     | Dispute keeps the claim in history; re-claim allowed. Browser run disputed without a reviewer photo                       |
| No private data on-chain                                               |   ✓   |      ✓ (TS-12)       |         –          |  –   |    –     | Only `bytes32` ids, digests, commitments, roles, timestamps                                                               |
| BonaRegistry on Avalanche Fuji                                         |   ✓   |          ✓           |        n/a         |  –   |  **–**   | **Blocked: needs a funded Fuji deployer key** (`docs/hackathon/BLOCKCHAIN_PROOF.md`)                                      |
| In-app "Check a file" (matches / no matching record)                   |   ✓   |          –           |         ✓          |  –   |    –     | Demo steps 15–17. Compares against the app's own records                                                                  |
| BonaBlock Verify (separate app, own RPC)                               |   ✓   |        ✓ (36)        |         –          |  –   |    –     | VERIFIED / MISMATCH / NOT_FOUND / REJECTED / CANNOT_VERIFY. Deployed separately; not browser-tested; needs a real receipt |

## P1 — strengthens the pitch

| Feature                                                         | Built | Unit-tested |    Browser-tested    | Live | Notes                                                                                                                    |
| --------------------------------------------------------------- | :---: | :---------: | :------------------: | :--: | ------------------------------------------------------------------------------------------------------------------------ |
| "I'm affected too" endorsements (one per person)                |   ✓   |      ✓      |          ✓           |  –   | Not for own report; staff cannot endorse                                                                                 |
| School pages with status counts and latest updates              |   ✓   |      –      |          ✓           |  –   |                                                                                                                          |
| Public issue discovery (search, filters, sort by most affected) |   ✓   |      –      |          ✓           |  –   |                                                                                                                          |
| Duplicate detection before submitting                           |   ✓   |      ✓      |          ✓           |  –   | `POST /api/issues/similar`; shown through Bona AI in demo step 4                                                         |
| Bona AI guided reporting, grounded in recorded cases            |   ✓   |      ✓      |  ✓ (fallback only)   |  –   | AI Gateway (`anthropic/claude-haiku-5-5`) with deterministic fallback. No model reply has been captured in a browser run |
| Interim protection record ("made safe, not fixed")              |   ✓   |      ✓      |   ✓ (fixture only)   |  –   | `InterimProtectionRecorded`. Not on the demo case                                                                        |
| Track a report by reference (`BB-YYYY-NNNNNN`)                  |   ✓   |      –      |          ✓           |  –   |                                                                                                                          |
| Mobile UI at 375/390/768/1440, no sideways scroll               |   ✓   |      –      | ✓ (375/390/768/1440) |  –   |                                                                                                                          |
| Accessibility basics (labels, roles, 44 px targets, focus)      |   ✓   |      –      |       partial        |  –   | Playwright uses role/label queries throughout                                                                            |
| Cloud persistence (Postgres + private Blob)                     |   ✓   |      –      |          –           |  –   | Preview uses the Blob evidence store, but **Postgres is not attached**: PGlite in memory, per instance                   |
| Sign-in with synthetic demo accounts                            |   ✓   |      –      |          ✓           |  –   | Signed cookie sessions; no client-side role switch                                                                       |

## P2 — nice to have

| Feature                               | State | Notes                                             |
| ------------------------------------- | ----- | ------------------------------------------------- |
| Declined-by-school with public reason | Built | Off-chain; kept out of the live demo (TS-13)      |
| District official dashboard           | –     | Role exists in shared types; no screen            |
| Multi-language UI (isiZulu, Sesotho)  | –     | `src/i18n` is structured for it; only `en` exists |
| Push / SMS notifications              | –     |                                                   |
| Export of a case file (PDF)           | –     | Print styles exist on the receipt page            |

## Known gaps (honest list)

1. **No Fuji deployment** → every "On-chain" cell is a dash. Demo steps 7 and 12 show the in-memory ledger ("Sample record"), and there is no transaction to look up, until a funded key is supplied.
2. **Not verified live.** Vercel projects `bona` and `bona-verify` exist and a preview of `bona` is ready, but it is behind Vercel Authentication, so there is no public URL, and the browser suite has not been run against it.
3. **No Postgres on Vercel yet.** The preview's database is in memory, per instance: data does not persist and two instances can disagree.
4. **Bona AI on the preview runs in fallback mode** (keyword match). No model reply has been captured.
5. **Standalone BonaBlock Verify is not browser-tested.** The tested file check is the in-app page.
6. **Anchoring retries run once a day** (hosting plan limit), or on demand with `POST /api/ledger/retry`.
