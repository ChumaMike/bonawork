# BonaBlock — demo backup plan

The live demo depends on three things outside our control: conference Wi-Fi, the Avalanche
Fuji public RPC, and the AI provider. Each has a fallback that is **real evidence captured
earlier**, never a fabricated result.

**Chain status: NOT YET.** `BonaRegistry` is not on Fuji. Until it is, the health check reports
the in-memory ledger, the chain steps are not live, and the presenter says so on stage.

## 1. Pre-flight (30 minutes before)

| Check                                        | Command / where                                                                                                                                                   | Pass looks like                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| App is up                                    | `GET https://<app>/api/health`                                                                                                                                    | `{"status":"ok","ledger":"avalanche",…}`. **Today it reports `memory`**: chain steps are not live |
| Verifier is up and on Fuji                   | `GET https://<verifier>/api/verify`                                                                                                                               | `chainId: 43113`, RPC host shown                                                                  |
| Fuji RPC answers                             | `curl -s -X POST https://api.avax-test.network/ext/bc/C/rpc -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'` | `"result":"0xa869"`                                                                               |
| Signer balances > 0.05 AVAX each             | Snowtrace, the three role addresses in `BLOCKCHAIN_PROOF.md`                                                                                                      | balance visible. **Not yet funded**                                                               |
| Demo accounts sign in                        | `/sign-in` with each account                                                                                                                                      | dashboard loads                                                                                   |
| Case BB-2026-000042 is in **Repair claimed** | `/issues/BB-2026-000042`                                                                                                                                          | status + 7 people affected                                                                        |
| Phone and laptop both open on `/`            |                                                                                                                                                                   |                                                                                                   |
| Backup tab open                              | this file's §3 + `docs/screenshots/release/`                                                                                                                      |                                                                                                   |

The app and verifier addresses are not written here: the preview is behind Vercel Authentication
and no public URL has been confirmed.

If the seeded case has drifted (someone verified/disputed it during rehearsal), reset with
`POST /api/demo/reset` (requires `CRON_SECRET`; available only when `DEMO_RESET_ENABLED=true`).
With a real chain **this re-anchors the seed on Fuji and costs testnet gas; run it at least
10 minutes before**.

The preview's database is in memory, per instance (Postgres is not attached yet). Data can be
lost or differ between instances; check the case state immediately before going on stage.

## 2. Failure modes and what to do

| What breaks                  | What the audience sees                                                                | What you do                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract not on Fuji         | Items read **Sample record**; no transaction link                                     | Say so: "This runs on a sample ledger; the contract is not on the testnet yet." Do not call it Avalanche.                                                                         |
| Fuji RPC slow (> 15 s)       | Evidence item shows **Anchoring pending**                                             | Say "pending — it confirms in the background". Continue; come back to it at step 8.                                                                                               |
| Fuji RPC down                | Report/evidence saved; banner "anchoring will be retried"                             | Point out the report is not lost. If §3 holds a real earlier transaction, show it; otherwise say there is none yet.                                                               |
| Wi-Fi down on the phone      | Phone cannot load                                                                     | Use the laptop at 390 px (browser device toolbar). Screenshots in `docs/screenshots/release/` as last resort.                                                                     |
| App down                     | Health check fails                                                                    | Walk through the release screenshots (§4) with the narrated script in `docs/demo/PITCH_SCRIPT.md` §4.2.                                                                           |
| AI provider down             | Bona AI answers with the keyword-match fallback and says the assistant is unavailable | It still lists BB-2026-000042 first; cases from other schools may appear below it. Say so: the product does not depend on the model.                                              |
| Standalone verifier down     | —                                                                                     | Use the in-app **Check a file** page (browser-tested), or the CLI: `pnpm --filter bona-verify verify -- --receipt receipt.json --file photo.jpg` (own RPC; needs a real receipt). |
| Seeded case already disputed | Step 14 has nothing to dispute                                                        | Reset with `POST /api/demo/reset`, or sign in as the administrator and record a fresh repair claim (allowed after a dispute). There is no second seeded repair-claimed case.      |

Anchoring retries run once a day on the hosting plan's cron. To retry sooner, call
`POST /api/ledger/retry` by hand.

## 3. Previously confirmed transactions (real, Fuji)

Filled in only after a successful rehearsal on the deployed app. Until then: **none**.

| Step | Event              | Tx link | Block | Captured |
| ---- | ------------------ | ------- | ----- | -------- |
| 7    | EvidenceRegistered | —       | —     | —        |
| 10   | RepairClaimed      | —       | —     | —        |
| 12   | (simulation only)  | n/a     | n/a   | —        |
| 14   | RepairDisputed     | —       | —     | —        |

Receipts (JSON) for steps 7 and 14 and the matching photo go in `docs/hackathon/backup/`
(git-ignored originals, committed receipts) so the verifier can be demonstrated offline from
any machine with RPC access. That folder does not exist yet.

## 4. Screenshots and recording

- Release screenshots: `docs/screenshots/release/` — 42 files at 375/390/768/1440 from the
  17-step Playwright run against the production bundle with the **in-memory ledger**. Every
  record in them reads "Sample record".
- Earlier fixture screenshots: `docs/screenshots/frontend/*.png` (generated by `pnpm e2e`).
- Demo recording: `docs/hackathon/backup/demo.gif` — **not recorded yet**.

## 5. What never to do on stage

- Do not show the in-memory ledger (`bona:memory`) and call it Avalanche.
- Do not refresh repeatedly while a receipt is pending.
- Do not paste private keys, `.env` files or the `CRON_SECRET` anywhere visible.
- Do not switch roles without signing in — there is no role switch, and that is the point.
