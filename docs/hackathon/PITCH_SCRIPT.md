# BonaBlock — pitch script (stage copy)

The full, sourced script with slide timings lives in `docs/demo/PITCH_SCRIPT.md` (research
stream). This is the one-page version to hold in your hand. Every statistic is traceable to
`docs/research/PROBLEM_EVIDENCE.md`; do not add others.

**Tagline:** See it. Report it. Prove it.
**Principle:** A report is not protection. A repair claim is not verification.

**Chain status: NOT YET.** `BonaRegistry` is not on Avalanche Fuji. Lines marked **(chain)** have
two versions; use the first only when the screen reads "Recorded on Avalanche".

## 0:00 — The gap (30 s)

"In March this year Parliament's education committee told the department it could not accept
its school-infrastructure data as a true reflection of what members saw on site. The committee
warned that incomplete classrooms may be showing as completed in official reports. A University
of Johannesburg study of public services put it this way: not a reporting problem, a response
problem."

## 0:30 — Problem (30 s)

"School communities can report problems, but cannot independently verify the complete history
of actions and claimed resolutions. The party that claims the repair is the party that records
it, and the community has no way to check that record for itself."

## 1:00 — BonaBlock (40 s)

"BonaBlock is an AI-assisted, community-powered accountability platform, designed so that
critical evidence and decisions can be checked independently. Communities get a voice. Schools
get organised reporting. Oversight teams are meant to get evidence they can check without
trusting us.

Three design choices:

1. Every photo, repair claim and review is fingerprinted, and the fingerprint is recorded by
   the BonaRegistry contract — only the fingerprint, never the content, never a name.
2. The school administrator and the independent reviewer are different roles with different keys,
   and the smart contract itself refuses a school administrator who tries to verify their own repair.
3. The verifier is a separate application with its own connection to the chain. Anyone who
   kept the original file and its receipt can check it without us."

Say "on Avalanche's test network" in choice 1 only after the contract is deployed there.

## 1:40 — Live demo (3 min) — `docs/hackathon/DEMO_GUIDE.md`

Narration beats:

- (step 4) "Bona AI doesn't invent anything — it only knows what's recorded. It found the existing case."
- (step 7) **(chain)** "That's a real Avalanche testnet transaction. Look at the log: only hashes."
  _Or:_ "That fingerprint goes to our contract. Today this runs on a sample ledger, and the screen says so."
- (step 12) "Refused. A school cannot verify its own repair." **(chain)** "That answer came from the
  contract — `SchoolAdminCannotVerify`. The rule is in the chain, not in our database."
  _Or:_ "The same rule is in our contract, and its tests prove it."
- (step 14) "The dispute doesn't erase the claim. It sits next to it."
- (step 17) "One small edit — no matching record. If anyone alters the evidence, including us, it shows."

## 4:40 — Why Avalanche (20 s)

"Avalanche is designed for fast finality and low fees, and it runs standard Solidity contracts on
a public network anyone can read. The contract is small, role-scoped and append-only — 26 tests,
and no function can edit or delete a record."

Do not quote a confirmation time or a fee. We have sent no transaction yet; quote our own
measurements once the contract is deployed.

## 5:00 — Close (20 s)

"BonaBlock for Schools is the first application. The claim-and-verify pattern is not specific to
schools; we have not tested it elsewhere. A report is not protection. A repair claim is not
verification. Thank you."

## If asked what is real today

Say exactly what `docs/hackathon/FEATURE_MATRIX.md` and `BLOCKCHAIN_PROOF.md` say. Nothing more.
In one breath: the full journey is browser-tested on a sample ledger; the contract is written and
tested but not yet on Avalanche's test network; the school and the people are fictional.
