# contracts

On-chain code for **BonaBlock** (_See it. Report it. Prove it._): the `BonaRegistry` contract,
targeting **Avalanche Fuji (chain ID 43113)**. The first application is BonaBlock for Schools,
so the roles and identifiers below are school-scoped.

> A report is not protection. A repair claim is not verification.

Toolchain: Hardhat 3, Solidity 0.8.28, ethers v6, Mocha/Chai.

The chain stores **digests and metadata only** — never evidence, never personal data.
Integration details for the backend and verifier are in [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

## What the contract does

A "case" in the product is a **report** in the contract (`reportId`, `registerReport`).

| Step                      | Function                                         | Who (role, per school) | Status after              |
| ------------------------- | ------------------------------------------------ | ---------------------- | ------------------------- |
| Register report           | `registerReport(reportId, schoolId, commitment)` | Registrar              | `Reported`                |
| Register evidence         | `registerEvidence(reportId, digest, kind)`       | depends on `kind`      | unchanged                 |
| Acknowledge               | `acknowledgeReport(reportId)`                    | SchoolAdmin            | `Acknowledged`            |
| Record interim protection | `recordInterimProtection(reportId, commitment)`  | SchoolAdmin            | unchanged                 |
| Claim repair complete     | `claimRepair(reportId, commitment)`              | SchoolAdmin            | `RepairClaimed`           |
| Verify (closes report)    | `verifyRepair(reportId, reviewCommitment)`       | Reviewer               | `Verified` (terminal)     |
| Dispute                   | `disputeRepair(reportId, reviewCommitment)`      | Reviewer               | `Disputed` → may re-claim |

Rules enforced on-chain:

- **Roles are scoped to a school.** A role granted for school A gives no authority over school B.
- **One role per account per school.** An account cannot be both SchoolAdmin and Reviewer.
- **A school cannot close its own repair.** `verifyRepair`/`disputeRepair` revert with
  `SchoolAdminCannotVerify` for any SchoolAdmin of that school, and for any account that ever
  acted for the school on that report — acknowledged it, recorded protection or claimed a
  repair — even if its role was later changed.
- **Protection is not a repair.** Interim protection records never change the status.
- **Append-only.** No function edits or deletes a report, evidence record or claim. A disputed
  claim stays on record beside the claim that replaces it.
- **Duplicates and out-of-order calls revert**: duplicate report id, duplicate report
  commitment, duplicate evidence digest on a report, second claim while one is pending,
  second review of a claim, anything after `Verified`.

## Commands

Run from `contracts/` (inside the pnpm workspace):

```sh
pnpm test                        # 42 tests: contract, setup scripts, committed ABI files
pnpm typecheck
pnpm abi                         # regenerate abi/ and exports/ after a contract change
pnpm demo:unauthorised-closure   # shows a school admin being rejected
pnpm deploy:local                # smoke-test deployment on a throwaway network
pnpm gas:report                  # measure gas units, write exports/gas-report.md
```

## Files other packages read

| File                              | Contents                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| `exports/BonaRegistry.43113.json` | ABI **and** the Fuji address in one file — read this one    |
| `abi/BonaRegistry.json`           | Plain ABI array                                             |
| `abi/BonaRegistry.ts`             | Same ABI as `export const bonaRegistryAbi = [...] as const` |
| `deployments/43113.json`          | Deployment record (exists only once deployed)               |

All are generated and committed. A test fails if `abi/` or `exports/` no longer match the
compiled contract, or if the exported address differs from the deployment record.

Until the contract is deployed, `exports/BonaRegistry.43113.json` has `"deployed": false` and
`"address": null`. Consumers must treat that as "no ledger yet", not as an address.

## Fuji runbook

**Status: deployed on 2026-11-18** at `0xa8BB5Dc1c031d850AB32768Ed020e9aA604e1aae` (`deployments/43113.json`, `docs/hackathon/BLOCKCHAIN_PROOF.md`). Do not run `deploy:fuji` again; steps 2–4 are safe to repeat.

### 1. Environment

`cp .env.example .env` in `contracts/` (git-ignored) and set:

| Variable                    | Needed by           | Value                                                                   |
| --------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `FUJI_DEPLOYER_PRIVATE_KEY` | deploy, setup, fund | A **development** key holding test AVAX. Becomes the registry owner.    |
| `FUJI_RPC_URL`              | all (optional)      | Defaults to `https://api.avax-test.network/ext/bc/C/rpc`                |
| `BONA_REGISTRAR_ADDRESS`    | setup, fund         | Address of the backend key that anchors reports                         |
| `BONA_SCHOOL_ADMIN_ADDRESS` | setup, fund         | Address of the school administration key                                |
| `BONA_REVIEWER_ADDRESS`     | setup, fund         | Address of the independent reviewer key                                 |
| `BONA_SCHOOL_IDS`           | setup               | Comma-separated institution UUIDs (the five seed schools are prefilled) |
| `BONA_ROLE_TARGET_AVAX`     | fund (optional)     | Gas top-up per role address. Default `0.05`, maximum `1`                |
| `BONA_TX_HASH`              | anchor-check        | Transaction to decode; usually passed inline                            |

The three role variables are **addresses**, never keys, and must be three different
addresses. Their private keys stay with the backend.

### 2. Budget

Measured gas units are in [`exports/gas-report.md`](exports/gas-report.md) (`pnpm gas:report`).
For the deployer, the whole run is 24 transactions and about **3.05 million gas units**:
the deployment (1.98M), 20 setup transactions for five schools (1.00M) and three top-up
transfers (0.06M).

Gas units carry over from the local network; the AVAX price per unit does not. On
2026-11-17 the public Fuji RPC reported 160 wei per gas unit, which makes the gas bill a
fraction of a millionth of an AVAX. What the deployer actually needs is the value it gives
away: 3 × 0.05 AVAX of top-ups, plus the 0.01 AVAX margin `fund:fuji` insists on —
**0.16 AVAX**. One 0.5 AVAX faucet drip covers it, and would still cover it at 50 nAVAX
per gas unit (0.30 AVAX in total).

A complete case (register, evidence, acknowledge, protection, claim, verify) costs about
0.64M gas units spread across the three role keys, so 0.05 AVAX per role address lasts a
very long time at current prices.

### 3. Run order

```sh
pnpm deploy:fuji     # 1. deploy the contract
pnpm setup:fuji      # 2. register schools, grant roles
pnpm fund:fuji       # 3. give the three role addresses gas money
pnpm export:abi      # 4. refresh exports/BonaRegistry.43113.json with the address
```

Then commit `deployments/43113.json` and `exports/BonaRegistry.43113.json`.

Steps 2–4 are idempotent: a re-run sends only what is still missing, so they are safe to
repeat after a failure or after adding a school to `BONA_SCHOOL_IDS`. Step 1 is **not**:
running it again deploys a second, empty registry and overwrites the deployment record.

**Windows / standalone install.** If `pnpm <script>` stops with
`ERR_PNPM_IGNORED_BUILDS … esbuild`, pnpm is refusing an unapproved build script. The root
workspace already approves it; outside the workspace, call Hardhat directly:

```sh
npx hardhat run scripts/deploy.ts      --network fuji
npx hardhat run scripts/setup-fuji.ts  --network fuji
npx hardhat run scripts/fund-roles.ts  --network fuji
npx hardhat run scripts/export-abi.ts
```

### 4. What each script prints

**`deploy:fuji`** — the chain, deployer address and balance, then the deployment record.
Stops before sending anything if there is no key or the balance is zero.

```
Chain 43113 | deployer 0x… | 0.5 AVAX
{ contract: 'BonaRegistry', chainId: 43113, address: '0x…', owner: '0x…',
  deployTxHash: '0x…', deployBlock: 1234567 }
```

**`setup:fuji`** — one table row per step, with `result` either `sent` (and a transaction
hash) or `skipped` (already in place), then a count. Stops if the signer is not the registry
owner, or if an address already holds a _different_ role for a school — it never revokes.

```
school                                  action             account  result   tx
00000000-0000-4000-8000-010000000001    registerSchool     -        sent     0x…
00000000-0000-4000-8000-010000000001    grant Registrar    0x…      sent     0x…
…
20 transaction(s) sent, 0 step(s) already in place.
```

**`fund:fuji`** — each role address with its balance before, the amount sent and the balance
after, then the deployer's remaining balance. Sends nothing at all unless the deployer can
cover every top-up plus a 0.01 AVAX gas margin.

```
role         account  before  sent   after  tx
registrar    0x…      0.0     0.05   0.05   0x…
```

**`export:abi`** — the file written, the number of ABI entries, and the address (or a note
that the contract is not deployed yet).

**`anchor-check:fuji`** — read-only, needs no key. Decodes the BonaRegistry events in one
transaction. The hash comes from the environment, not a command-line argument:

```sh
BONA_TX_HASH=0x… pnpm anchor-check:fuji
```

```
Transaction 0x…
  chain     43113
  status    success
  block     1234570
  explorer  https://testnet.snowtrace.io/tx/0x…

Log #0: RoleGranted
  schoolId   0x0000…010000000001
  account    0x…
  role       1 (Registrar)
```

It exits with an error if the transaction is missing or contains no BonaRegistry event, and
skips logs emitted by any contract other than the recorded registry.

Every script refuses a chain other than Fuji (43113) or the local test chain (31337), and
none prints a private key.

### 5. Reading `deployments/43113.json`

| Field          | Meaning                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `contract`     | Always `BonaRegistry`                                                     |
| `chainId`      | `43113`                                                                   |
| `address`      | The contract address — what the app and verifier call                     |
| `owner`        | The deployer; the only account that can register schools and grant roles  |
| `deployTxHash` | Deployment transaction: `https://testnet.snowtrace.io/tx/<hash>`          |
| `deployBlock`  | Block of deployment — start event scans (`getLogs`) from here, not from 0 |

### 6. Check it worked

- `pnpm setup:fuji` again reports `0 transaction(s) sent`.
- `BONA_TX_HASH=<any grant tx> pnpm anchor-check:fuji` prints a `RoleGranted` event.
- `https://testnet.snowtrace.io/address/<address>` shows the contract and its transactions.

`pnpm roles:fuji` is the older single-school version of `setup:fuji` (`BONA_SCHOOL_ID` or
`BONA_SCHOOL_LABEL`); prefer `setup:fuji`.

## Known limits (Phase 1)

- The owner is a single key that registers schools and assigns roles. Use a multisig before
  anything beyond a demo.
- The contract trusts the Registrar to anchor honest report commitments; it cannot check what a
  digest is a digest _of_. That is the verifier's job.
- The contract source is not verified on Snowtrace; there is no script for that yet.
