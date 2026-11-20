# BonaBlock — judges' Q&A (technical supplement)

Product and policy questions are answered in `docs/demo/JUDGES_QA.md` (research stream). This
file adds the engineering answers. Keep answers to two sentences on stage.

## Blockchain

**Why a blockchain at all? A database with audit logs would do.**
The party that controls the database is the party whose claims we need to check. An append-only
public record that a separate reviewer and a separate verifier can read removes us — and the
school — from the trust chain.

**What exactly goes on-chain?**
`bytes32` values only: a report id, a school id, SHA-256 digests of evidence files, SHA-256
commitments of salted decision documents, the role that acted, and the block timestamp. No text,
no names, no file. See `docs/hackathon/ARCHITECTURE.md` "Data boundaries".

**Why salted commitments and not plain hashes for documents?**
A short document ("repair complete, 2 toilets") could be brute-forced from its hash. The salt is
stored off-chain with the document and must be presented to the verifier, so the public hash reveals
nothing but still binds the content.

**Why Avalanche Fuji and not mainnet?**
This is a demonstration with fictional schools; mainnet would cost real money for fake data and
the app refuses any chain id other than 43113 by construction. The contract is chain-agnostic.
It is not deployed on Fuji yet — see `BLOCKCHAIN_PROOF.md`.

**Who holds the keys?**
The server holds three keys — registrar, school admin, reviewer — chosen by the _operation_,
never by the request. The contract additionally refuses `verifyRepair`/`disputeRepair` from any
school admin of that school or anyone who acted for the school on that report (`SchoolAdminCannotVerify`).
In production each school and each reviewer would hold their own key; the role model already supports it.

**How do you stop the registrar from being the weak point?**
The registrar can only register reports and evidence. It cannot acknowledge, claim, verify or dispute.
Every evidence record and claim is permanent; there is no delete or edit function in the contract (tested).

**What happens if the RPC is down when a parent reports?**
The report is saved and visible immediately; anchoring goes into a retry queue (`ledger_jobs`,
Vercel cron). The UI says "anchoring pending" and never shows "Recorded on Avalanche" until a
confirmed receipt exists.

**Can I verify without trusting your verifier?**
Yes: the receipt gives the transaction hash; Snowtrace shows the `EvidenceRegistered` log; hash the
file yourself with `sha256sum`. The verifier just automates that; its source is available to
judges on request (the repository is private). This needs a real transaction, which we do not have yet.

## AI

**What does Bona AI actually do?**
Guided reporting and discovery: it finds existing cases for a described problem (so people endorse
instead of duplicating) and explains statuses. It is grounded only on database records passed into
the prompt and is told not to invent statuses or names.

**What if the model is wrong or unavailable?**
Advisory only — it never changes a status. Without a key or on timeout it degrades to the same
keyword search with an "assistant unavailable" notice; the demo works either way.

**Which model and where?**
`anthropic/claude-haiku-5-5` via Vercel AI Gateway (one key). Model is an env var. On the current
preview the assistant runs in its keyword fallback.

## Cloud and security

**Where is the data?** Postgres (Neon via Vercel Marketplace) for records, private Vercel Blob for
evidence files (never public URLs), Avalanche for fingerprints. Locally the same code runs on PGlite
and a folder. Today's preview uses Blob for evidence but in-memory PGlite, because Postgres is not
attached yet.

**Authentication?** Signed HttpOnly cookie sessions for synthetic demo accounts; roles are server-side;
there is no client-side role switch. A real deployment needs a proper identity step; we have not chosen one.

**Privacy of reporters?** Public pages show a pseudonym (`Reporter R-7F3A`). Real names are stored
off-chain and shown only to the school administrator and reviewer. Anonymous reporting is supported.

**What is not done?** See the "Known gaps" list in `docs/hackathon/FEATURE_MATRIX.md`. We do not
claim anything that table does not show as verified.
