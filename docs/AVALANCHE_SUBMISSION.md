# Bona Chain: Avalanche submission

UJ BACISS 2026. One page that answers the five submission requirements, in order,
with the link or command that proves each one.

Bona Chain follows one school repair from the report to the release instruction.
Every step belongs to one role and is recorded on the Avalanche Fuji test network.

## 1. Deployed smart contract address on Avalanche Fuji, with explorer link

Chain id 43113, Avalanche Fuji C-Chain.

| Contract                                   | Address and explorer link                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `BonaChainFactory`                         | [`0x9AA7Cf8a0cd0c015F01DF8fdb400510D1407d6E3`](https://testnet.snowtrace.io/address/0x9AA7Cf8a0cd0c015F01DF8fdb400510D1407d6E3) |
| `InstitutionOperations` of the demo school | [`0xeCc11b37EDDafD99d03e7049bfa3226901dBE4Fd`](https://testnet.snowtrace.io/address/0xeCc11b37EDDafD99d03e7049bfa3226901dBE4Fd) |
| `InstitutionFinance` of the demo school    | [`0xD30762a429FB241D378B11A3f74d3c169c2437A5`](https://testnet.snowtrace.io/address/0xD30762a429FB241D378B11A3f74d3c169c2437A5) |

- Factory deploy transaction:
  [`0xd22e3924d8d7c1d8cf47d6d0bdff7c0e5cc9ec4b2aa5bdb31df0e60b847b3ded`](https://testnet.snowtrace.io/tx/0xd22e3924d8d7c1d8cf47d6d0bdff7c0e5cc9ec4b2aa5bdb31df0e60b847b3ded),
  block 61380998.
- The factory created an Operations and a Finance contract for five institutions.
  All ten addresses are in
  [`contracts/deployments/bonachain.43113.json`](../contracts/deployments/bonachain.43113.json).
- The source has not been submitted to the explorer for verification yet. It is in
  [`contracts/contracts/chain/`](../contracts/contracts/chain/).

## 2. GitHub repository with source code, README and basic tests

- Repository: https://github.com/obxalethia-star/BonaChain
- README: [`README.md`](../README.md). Contracts: [`contracts/README.md`](../contracts/README.md).
- Tests, from the repository root:

```bash
pnpm install
pnpm check                                    # 589 app tests and 184 verifier tests
pnpm --filter @bona/contracts test            # 180 contract tests, including a stress test
pnpm --filter @bona/contracts chain:dry-run   # deploy, set up and run one case locally
```

## 3. Live demonstration of at least two state-changing transactions

Live app: https://bonachain.vercel.app. Demo case: `BB-2026-000051`, "No lights in
the Grade 7 classrooms".

The workflow we demonstrate, and the six transactions it sends to Fuji:

| #   | Who                  | What happens on screen                                | Contract and function                  |
| --- | -------------------- | ----------------------------------------------------- | -------------------------------------- |
| 1   | Supplier             | Submits an invoice with a mistake                     | `InstitutionFinance.submitInvoice`     |
| 2   | Bona Chain rules     | "Invoice blocked", with the exact reasons             | `InstitutionFinance.recordMatchResult` |
| 3   | Supplier             | Submits the corrected invoice                         | `InstitutionFinance.submitInvoice`     |
| 4   | Bona Chain rules     | "Invoice matched"                                     | `InstitutionFinance.recordMatchResult` |
| 5   | Independent reviewer | Verifies the repair                                   | `InstitutionOperations.verifyRepair`   |
| 6   | Payment approver     | Authorises the release, which was locked until step 5 | `InstitutionFinance.authoriseRelease`  |

To see a transaction: open the case, choose the **Trail** tab, press **Show proof**
on a step. The panel shows the transaction hash and block, and links to the block
explorer and to Bona Chain Verify (https://bonachain-verify.vercel.app), a separate
site that reads Avalanche itself.

What the contracts refuse, which a judge can test:

| Attempt                                                  | Result                             |
| -------------------------------------------------------- | ---------------------------------- |
| A release before an independent reviewer has verified    | Reverts, `RepairNotVerified`       |
| An account acting under a second role on the same order  | Reverts, `SeparationOfDuties`      |
| A school administrator verifying the school's own repair | Reverts, `SchoolAdminCannotVerify` |

The same path, with these refusals, is scripted against Fuji in
[`scripts/chain-smoke.ts`](../scripts/chain-smoke.ts). It passed 17 of 17 checks.

A finished case, `BB-2026-000044`, already shows a blocked invoice, a matched one
and an authorised release with their proofs.

## 4. The user problem, why Avalanche adds value, and the next milestone

**The problem.** A school reports a broken facility, a contractor says it is fixed,
and an invoice is approved. The records sit in separate places, and the party that
claims the work is usually the party that records it. Nobody outside can check that
the work was ordered, delivered and independently inspected before the money
decision.

**Why Avalanche.** Several parties share one history, and the party being checked
should not control it. The rules sit in contracts anyone can read: the school cannot
verify its own repair, nobody can take two duties on one order, and a release is
refused until an independent reviewer has verified the work. Only fingerprints go on
chain. Low fees and fast finality on the C-Chain make it practical to prove every
step.

**Next milestone.** A pool of independent reviewers, with three drawn at random for
each repair and two needed to agree. Each institution holds its own keys. Contract
source verification, then an outside review before any mainnet use.

## 5. No real funds or personal customer information

- Test network only. The app refuses any chain other than Fuji.
- The keys hold test AVAX. No real funds are involved.
- The last step is a release **instruction**. No money moves, on chain or off.
- Every school, case, person, supplier, order and invoice is synthetic. Photos are
  AI-generated illustrations.
- Only fingerprints go on chain: no amounts, names or documents.
- The public pages show steps, roles and proofs. They do not show amounts, supplier
  names or people's names.

## Where a judge can see each part of the rubric

| Rubric                                           | Where to look                                                                                                                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 40% Contract functionality and deployment        | The addresses above; the six live transactions; the three refusals; `scripts/chain-smoke.ts` (17 of 17 on Fuji).                                                                                                        |
| 25% Practical usefulness and clarity of problem  | The live demo case and the README's "The problem". One repair, seven roles, each step with a proof.                                                                                                                     |
| 20% Technical quality, access controls and tests | Roles held in the factory, one role per account per institution, separation of duties per order (`contracts/contracts/chain/`). 180 contract tests, 589 app tests, 184 verifier tests. Public data redaction is tested. |
| 15% Differentiation and potential to develop     | Community reporting joined to procurement control and independent verification. One factory, a contract pair per institution, so other institutions can be added. The next milestone above.                             |
