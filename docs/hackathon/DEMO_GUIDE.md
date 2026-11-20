# BonaBlock — live demo guide (17 steps)

> **On stage, use `docs/hackathon/guide/04-demo-runbook.md`.** It has the exact click path and
> wording for the simplified screens, the two-minute Team1 version and the full version, the
> pre-flight, and what to do when something goes wrong. This file keeps the 17-step list because
> the automated live check (`e2e/live/demo.spec.ts`) follows it. The steps below use the current
> screen names, as walked on production on **2026-11-18**.

**Live URLs:** BonaBlock → **https://bonablock.vercel.app** · BonaBlock Verify →
**https://bona-verify.vercel.app**. Production runs `main` @ `a6f15ba` (walked on `336fdd2`, staff screens re-walked after `d17748a`) on Postgres (Neon), private
Blob storage and the **Avalanche Fuji ledger** (contract `0xa8BB5Dc1c031d850AB32768Ed020e9aA604e1aae`).

**Before every run** reset the demo data: `POST /api/demo/reset`, then `POST /api/ledger/retry`
until `remaining` is 0 (both with the production `x-cron-secret`, held by the integration
coordinator). Measured on 2026-11-18: reset 29 s, then one retry call anchored 48 of 48 in
189 s. Plan for 5 minutes. Do not demo in between.

Everything shown is **fictional demo data** (Thandolwethu Primary School,
`docs/demo/DEMO_SCENARIO.md`). It is a testnet: never call it mainnet, and never call a
**Recording…** receipt confirmed. Real hashes: `docs/hackathon/BLOCKCHAIN_PROOF.md`.

"Walked" means clicked through by hand in Chrome on production on 2026-11-18, with the result
shown. "Live test" means the automated check covers it (5 of 5 passing on production with Fuji).

| #   | Step (what the audience sees)                                                                                                                                                                                                                                                                                                                            | Signed in as | Where                        | Checked              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------- | -------------------- |
| 1   | Home page: the school photograph, **See it. Report it. Prove it.**, **Which school is it about?** with **Find school**, and three shortcuts (**Report a problem**, **Check on my report**, **See all problems**).                                                                                                                                        | nobody       | `/`                          | Walked, live test    |
| 2   | Search **Thando**, tap **Thandolwethu Primary School**. **Open 2 · Waiting for a check 1 · Confirmed fixed 1** and picture tiles grouped as open, waiting for review, verified.                                                                                                                                                                          | nobody       | `/schools/<id>`              | Walked, live test    |
| 3   | **Bona AI**: type "The girls' toilets at Thandolwethu are blocked and the floor is wet." and **Send**.                                                                                                                                                                                                                                                   | anyone       | `/assistant`                 | Walked, live test    |
| 4   | Bona AI shows **BB-2026-000042** (Repair claimed · Not verified yet · 7 people affected) with **I'm affected too**. Production has no AI key, so it says it is a keyword match on the public record, not a written reply.                                                                                                                                | anyone       | `/assistant`                 | Walked, live test    |
| 5   | On the case, **I'm affected too** (signed out → **Sign in** → **Community reporter** card → back). The ring goes **7 → 8**; the button reads **You're affected too**, **Tap again to remove**. Leave it at 8.                                                                                                                                            | zanele       | `/issues/<id>`               | Walked, live test    |
| 6   | **Proof** tab → **Add evidence** → **Choose from your phone**. **1 file chosen** with **Fingerprint 0x…** made on the phone before upload. **Add to this issue**.                                                                                                                                                                                        | zanele       | `/issues/<id>/evidence`      | Walked, live test    |
| 7   | **Evidence added** · **Evidence 6 · Recorded** (5–8 s). **Show proof** opens **Recorded on Avalanche** with the transaction, block and **View on the block explorer** (Snowtrace: Success, to our contract, 1 event).                                                                                                                                    | zanele       | same screen                  | Walked, live test    |
| 8   | **Timeline** tab: Problem reported · Assessment started (**Recorded**) · Progress recorded (**Not on blockchain**) · **Repair claimed — not yet verified** (**Recorded**).                                                                                                                                                                               | zanele       | `/issues/<id>`               | Walked, live test    |
| 9   | **Sign out**, then on `/sign-in` tap **School administrator** (Ms Nomvula Dlamini). **School dashboard**: "1 report needs your reply", **Reply needed · 1**, **Being fixed · 1**, **Waiting for a reviewer · 1**.                                                                                                                                        | admin        | `/sign-in` → `/admin`        | Walked, live test    |
| 10  | Optional: open **Perimeter fence cut near the sports field** (**Waiting 6 days**). **What is your answer?** with **We are looking into it** / **This is not ours to fix**. Show it; do not press it.                                                                                                                                                     | admin        | `/admin?report=<id>`         | Walked (not pressed) |
| 11  | Under **Waiting for a reviewer**, open the toilet block. **You said this is fixed**. Press **Try to verify this repair** ("It costs nothing and changes nothing").                                                                                                                                                                                       | admin        | `/admin?report=<id>`         | Walked, live test    |
| 12  | **Refused. A school cannot verify its own repair.** … "Nothing was changed." **Contract answer SchoolAdminCannotVerify**, **Your role on the ledger school_admin**: the contract's own answer to a free `eth_call`.                                                                                                                                      | admin        | same screen                  | Walked, live test    |
| 13  | **Sign out**, tap **Independent reviewer** (Mr Sipho Mokoena). **Independent reviews**: "1 repair to check", **To check · 1**.                                                                                                                                                                                                                           | reviewer     | `/sign-in` → `/reviewer`     | Walked, live test    |
| 14  | Open it. Answer **Yes / No / No**, **Next: compare and decide**, type "Two toilets still not flushing; cubicle 3 door still off its hinges.", **No, not fixed** → **Check before you record** → **Dispute completion**. **Recorded. You disputed this repair.** The case reads **Disputed**; the school's claim stays in the timeline below the dispute. | reviewer     | `/reviewer` → `/issues/<id>` | Walked, live test    |
| 15  | In the step-7 proof sheet, **Open in BonaBlock Verify** (or scan the square code). The separate site opens on **Checking Evidence 6**, **Choose your photo or document**.                                                                                                                                                                                | nobody       | bona-verify.vercel.app       | Walked               |
| 16  | Choose the original photo: **Verified** · "Avalanche has this exact photo on record. It has not been changed."                                                                                                                                                                                                                                           | nobody       | bona-verify.vercel.app       | Walked               |
| 17  | Choose the edited copy: **Not the same** · "This is not the exact photo that was recorded. Even a small change makes it different."                                                                                                                                                                                                                      | nobody       | bona-verify.vercel.app       | Walked               |

Steps 15–17 now use the standalone **BonaBlock Verify**, which reads Avalanche and never asks
BonaBlock anything. It was walked on production on 2026-11-18 with a real Evidence 6 receipt, and
with the report's own receipt (no file needed: **Verified**, "Avalanche has this exact report on
record"). The live test still checks the same two answers on the in-app page **Check a file**
(`/verify`, "Is this the real file?"), which is the fallback if the verifier is slow.

Close: "A report is not protection. A repair claim is not verification. BonaBlock makes 'fixed'
something a second person has to confirm, on a record nobody can rewrite."

## Accounts and files to prepare

| Item                     | Where / how                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Demo accounts            | `/sign-in` shows one card per role: tap it, no password. If it shows **Your account … Signed in as …** instead, press **Sign out** first |
| Photo for steps 6 and 16 | Any JPEG up to 10 MB, the **original file**. A copy sent through a chat app or a screenshot does not match                               |
| Edited photo for step 17 | The same photo with one small change                                                                                                     |

## Timing

| Version                  | Steps           | Time           |
| ------------------------ | --------------- | -------------- |
| Two-minute Team1 version | 1, 2, 7, 11, 12 | 2 minutes      |
| Full demo                | 1–17            | 6 to 8 minutes |

## Rules on stage

- Say "testnet" (Avalanche Fuji). Never say mainnet.
- If a receipt says **Recording…**, say "it is being written to Avalanche"; it updates itself.
  Do not refresh in a loop and do not call it confirmed.
- If the RPC is down, the report still saves and waits in a queue: show that, then switch to
  `DEMO_BACKUP.md`.
- Never present the in-memory development ledger (`bona:memory`, labelled "Sample record") as a
  real transaction.
