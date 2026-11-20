# contracts

On-chain code for **BonaBlock** (_See it. Report it. Prove it._): the `BonaRegistry` contract,
targeting **Avalanche Fuji (chain ID 43113)**. The first application is BonaBlock for Schools,
so the roles and identifiers below are school-scoped.

> A report is not protection. A repair claim is not verification.

Toolchain: Hardhat 3, Solidity 0.8.28, ethers v6, Mocha/Chai.

The chain stores **digests and metadata only** — never evidence, never personal data.
Integration details for the backend and verifier are in [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

The **Bona Chain suite** (one factory, plus an operations and a finance contract per
institution, with the procurement trail) is described in [its own section](#bona-chain-suite)
at the end of this file.

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

---

# Bona Chain suite

Bona Chain adds a procurement trail to the report and repair trail, and gives every
institution its own pair of contracts. `BonaRegistry` above is untouched and stays deployed.

```
report -> work order approved (buyer) -> order acknowledged (supplier) -> invoice submitted (supplier)
       -> goods receipt recorded (receiver) -> three-way match (platform)
       -> independent verification (reviewer) -> release authorised (payment approver)
```

No money moves on chain. The last step is a **release instruction**, and it is only accepted
when the order, invoice and goods receipt match, no payment dispute is open and an independent
reviewer has verified the repair. Only fingerprints go on chain: no amounts, names or documents.

## The three contracts (`contracts/chain/`)

| Contract                | One per     | What it does                                                                                         |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `BonaChainFactory`      | deployment  | The registry. Creates the two contracts of each institution and holds every role.                    |
| `InstitutionOperations` | institution | `BonaRegistry` behaviour for one institution: reports, evidence, protection, claims, reviews.        |
| `InstitutionFinance`    | institution | Work order, acknowledgement, invoices, goods receipts, match results, disputes, release instruction. |

`BonaChainTypes.sol` holds the shared enums and the two small interfaces the contracts use to
read each other. The factory deploys the institution contracts with `new`; there are no
proxies, no clones and no inline assembly.

Sizes (limit 24,576 bytes of runtime code): factory 15,946, operations 6,691, finance 6,132.
The factory carries both institution contracts and still has a third of the limit free, so no
trimming or splitting was needed. `test/chain/factory.test.ts` fails if it passes 24,000.

## Rules enforced on chain

**Roles** (`Registrar`, `SchoolAdmin`, `Reviewer`, `Buyer`, `Supplier`, `Receiver`,
`PaymentApprover`) live in the factory, per institution.

- One account holds at most one role per institution (`RoleConflict`). Changing a role means
  revoking first, on purpose. The institution contracts keep no copy: they ask the factory on
  every call, so a revoke takes effect at once.
- A role at one institution gives no authority at another.
- `isGenuine(address)` / `kindOf(address)` tell a contract the factory created from a look-alike.

**Operations** keeps every `BonaRegistry` rule, with the same seven events (same names,
arguments and topics; the `schoolId` argument carries the institution id).

- Only a `Reviewer` can verify or dispute. An account that administers the institution, or ever
  acted for it on the report, gets `SchoolAdminCannotVerify`. That check runs before the role
  check and survives role changes (`hasActedForSchool`).
- `Verified` is final. Records are only ever appended.

**Finance**

| Step                 | Function                                                                | Who                            |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------ |
| Approve work order   | `approveWorkOrder(workOrderId, reportId, commitment)`                   | Buyer (the report must exist)  |
| Acknowledge          | `acknowledgeWorkOrder(workOrderId)`                                     | Supplier (bound to the order)  |
| Submit invoice       | `submitInvoice(workOrderId, commitment)`                                | the bound Supplier only        |
| Record goods receipt | `recordGoodsReceipt(workOrderId, commitment)`                           | Receiver                       |
| Record match result  | `recordMatchResult(workOrderId, invoiceCommitment, passed, commitment)` | Registrar (platform relayer)   |
| Open / close dispute | `openPaymentDispute` / `closePaymentDispute(workOrderId, commitment)`   | Buyer or Receiver / the opener |
| Authorise release    | `authoriseRelease(workOrderId, commitment)`                             | PaymentApprover                |

- **Separation of duties per order (`actedAs`).** The contract remembers the role each account
  first acted under on an order. Acting on the same order under a different role reverts
  `SeparationOfDuties`, even after the factory role was changed. For the release this also
  looks at the report: an account that acted for the institution on the report, or reviewed
  its repair, can never authorise.
- **A match is only current for the latest invoice and receipt.** A new invoice or a later
  goods receipt voids the match; the platform must record a fresh one. A match that names
  anything but the latest invoice reverts `StaleInvoice`.
- **A fingerprint is recorded once** per finance contract (`DuplicateCommitment`).
- **One release.** After `ReleaseAuthorised` the order accepts nothing more.
- **Finance never changes the status of a report.** It only reads `operations.statusOf(reportId)`.

`authoriseRelease` checks in this exact order and reports the first failure:

```
WorkOrderNotFound -> SeparationOfDuties -> Unauthorized -> InvalidOrderState -> NoInvoice
-> NoGoodsReceipt -> MatchNotPassing -> DisputeOpen -> RepairNotVerified
```

(A zero commitment is refused before all of them, a reused one after all of them.) To ask
"would a release go through, and if not, why?" without sending anything, make a read-only
call of `authoriseRelease` from the address of the payment approver.

## Tests

```bash
pnpm test          # everything: BonaRegistry suites + the Bona Chain suites
pnpm test:chain    # the Bona Chain suites only
pnpm chain:gas     # the stress test alone; rewrites exports/chain-gas-report.md
pnpm chain:dry-run # rehearses deploy -> setup -> fund -> export -> one full case, locally
```

| File                             | Covers                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/chain/factory.test.ts`     | two-step ownership, duplicate institutions, `kindOf` / `isGenuine`, role conflict across all seven roles, revoke, size budget                 |
| `test/chain/operations.test.ts`  | the `BonaRegistry` suite in the per-institution shape, plus isolation between institutions                                                    |
| `test/chain/finance.test.ts`     | happy path, one test per `authoriseRelease` refusal in order, stale match, all 20 `actedAs` pairings, supplier binding, disputes, one release |
| `test/chain/stress.test.ts`      | 25 institutions x 8 cases, 4,200 seeded steps checked against a reference model, then an audit from events alone                              |
| `test/chain/scripts.test.ts`     | the code the Fuji scripts run: keys, deploy preflight, idempotent setup, funding, export                                                      |
| `test/chain/abi-exports.test.ts` | the committed ABI files match the compiled contracts; the seven report events match `BonaRegistry`                                            |

Gas figures are in [`exports/chain-gas-report.md`](exports/chain-gas-report.md):
`createInstitution` about 2.78M gas, one full case (13 transactions) about 1.47M gas.

## Files other packages read

| File                                        | Contents                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `abi/chain/{factory,operations,finance}.ts` | Typed ABIs (`as const`): `bonaChainFactoryAbi`, `institutionOperationsAbi`, `institutionFinanceAbi`. A `.json` copy sits next to each. Regenerate with `pnpm chain:abi`. |
| `deployments/bonachain.43113.json`          | Written by `chain:deploy`, completed by `chain:export`: factory address, deploy block, and the operations and finance address of every institution.                      |
| `exports/CHAIN_ABI_READY.md`                | Notes for anyone coding against the ABIs.                                                                                                                                |

## Fuji steps, in order

Testnet only: every script refuses any chain other than Fuji (43113) and the local test chain.
Run from `contracts/`. Nothing here prints a private key.

`contracts/.env` must hold `FUJI_DEPLOYER_PRIVATE_KEY` (a funded Fuji wallet; it becomes the
factory owner) and the three existing role addresses `BONA_REGISTRAR_ADDRESS`,
`BONA_SCHOOL_ADMIN_ADDRESS`, `BONA_REVIEWER_ADDRESS`. Everything else has a default; see
`.env.example`.

```bash
pnpm chain:dry-run   # 0. rehearse the whole run locally; ends with "DRY RUN OK"
pnpm chain:keys      # 1. four new testnet keys -> .env.finance.local; prints the 4 addresses
pnpm chain:deploy    # 2. deploy the factory; prints LEDGER_FACTORY_ADDRESS=0x...
pnpm chain:setup     # 3. create the institutions, grant the seven roles each
pnpm chain:fund      # 4. top the four finance addresses up to 0.02 AVAX each
pnpm chain:export    # 5. write the addresses of every institution to deployments/bonachain.43113.json
```

| Step           | What it does                                                                                                                                                                                                                                                       | Safe to re-run                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `chain:keys`   | Creates the buyer, supplier, receiver and payment-approver keys in the git-ignored `.env.finance.local` as `BONA_*_PRIVATE_KEY`, with matching `BONA_*_ADDRESS` lines. Prints addresses only.                                                                      | Refuses to overwrite the file.                              |
| `chain:deploy` | Preflight first: reads the gas price and the balance, prints the estimate, and aborts before sending if it is over **0.2 AVAX** or over the balance. Then deploys and writes `deployments/bonachain.43113.json`.                                                   | Refuses a second Fuji deployment unless `BONA_REDEPLOY=1`.  |
| `chain:setup`  | For each id in `BONA_INSTITUTION_IDS` (default: the five seed institutions, converted to `bytes32` exactly like school ids): `createInstitution`, then seven `grantRole`. Plans first, prints the estimated cost, aborts over `BONA_SETUP_MAX_AVAX` (default 0.5). | Yes. Ends with `N transaction(s) sent, M already in place`. |
| `chain:fund`   | Sends each finance address the shortfall to `BONA_FINANCE_TARGET_AVAX` (default 0.02) from the deployer. Checks the deployer can cover all four before sending any.                                                                                                | Yes. Funded addresses are skipped.                          |
| `chain:export` | Read-only. Lists every institution from the factory, checks each address with `isGenuine`, rewrites the deployment file.                                                                                                                                           | Yes.                                                        |

**Budget.** The run needs about 19.4M gas (deploy 3.5M, five institutions 13.9M, 35 grants 1.8M)
plus 0.08 AVAX of top-ups. That is about 0.02 AVAX of gas at 1 gwei and 0.06 at 3 gwei; the
preflights print the real figure before anything is sent. To spend less, set
`BONA_INSTITUTION_IDS` to the demo institution only (about 3.1M gas for setup) and add the
others later: setup only sends what is missing.

**After the run**, the app and the verifier need:

- `LEDGER_FACTORY_ADDRESS` and `VERIFY_FACTORY_ADDRESS` = the `factory` in
  `deployments/bonachain.43113.json` (also printed by `chain:deploy`).
- `LEDGER_{BUYER,SUPPLIER,RECEIVER,PAYMENT_APPROVER}_PRIVATE_KEY` = the matching
  `BONA_*_PRIVATE_KEY` lines of `contracts/.env.finance.local`. Copy them straight into the
  secret store; do not paste them anywhere else.
- Commit `deployments/bonachain.43113.json`. Never commit `.env.finance.local`.

**Check it worked**

- `pnpm chain:setup` again reports `0 transaction(s) sent`.
- `pnpm chain:fund` again reports `0 top-up(s) sent`.
- `deployments/bonachain.43113.json` lists one `operations` and one `finance` address per
  institution, and `https://testnet.snowtrace.io/address/<factory>` shows the factory.

## Known limits

- The factory owner is a single key that creates institutions and assigns roles. Use a multisig
  before anything beyond a demo.
- A work order id is approved once. A changed order needs a new work order id on chain.
- The supplier bound to an order cannot be replaced. If that key is lost, approve a new order.
- A payment dispute can only be closed by the account that opened it, while it still holds the
  role it opened it under. If that role was revoked, the owner must grant it back first.
- The contracts trust the platform relayer (`Registrar`) to record the match result the rule
  engine produced. They enforce who may record it, for which invoice, and that it is current;
  they cannot recompute it, because amounts never go on chain.
