# BonaBlock — blockchain proof

This file lists only what has actually happened on-chain. Every hash below is a real
Avalanche Fuji transaction that anyone can open on the explorer. Nothing here is simulated.
Where something has not happened yet, it says **NOT YET**.

## Network

| Item             | Value                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Chain            | Avalanche Fuji C-Chain (testnet)                                                                                                |
| Chain id         | 43113 (`eip155:43113`)                                                                                                          |
| Explorer         | https://testnet.snowtrace.io                                                                                                    |
| Contract         | `BonaRegistry` — `contracts/contracts/BonaRegistry.sol`                                                                         |
| Contract address | [`0xa8BB5Dc1c031d850AB32768Ed020e9aA604e1aae`](https://testnet.snowtrace.io/address/0xa8BB5Dc1c031d850AB32768Ed020e9aA604e1aae) |
| Deploy tx        | `0x46ecd569383b4607f21e28543522a57a88f7f5c31d9cd58ef9f5881ec84d9ee6` — block 61275772, 2026-11-18                               |
| Owner (deployer) | `0x7EF27429B03C264296eb96be49F0f7315587483F`                                                                                    |
| Deployment file  | `contracts/deployments/43113.json`; ABI with address in `contracts/exports/BonaRegistry.43113.json`                             |
| Mainnet          | Never. The app refuses any chain id other than Fuji (`src/blockchain/viem-ledger.ts`).                                          |

## Roles on the demo school

Demo school: Thandolwethu Primary School, id `00000000-0000-4000-8000-010000000001`
(registered in tx `0xb4a1b1f1f69233f65fb9bd1f9668613d59babfe9de606149e8a9199c8c9f0146`).

| Role        | Address                                      | Granted in tx                                                        |
| ----------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Registrar   | `0xD0E466eF85a98f8490aaC9287CC24574cF76986b` | `0x1ce3ca82818839c708fb3458aec05e71a4b336dfa28439b9d0a725dc14595aa1` |
| SchoolAdmin | `0x77b587d31ae65F1e25cdec8ff10062ABdEd371F1` | `0xc6d1cbd42c2c628904e539e737e7676f400c641753c320f681e1bd703462f0ce` |
| Reviewer    | `0x17C5969cB7B867F735Bc75abADCcCdEBe014FA97` | `0x53e96bca7c69e22747ba49bb5e065afe6087698e10848c74147dfb29de3dff47` |

The three are different keys (`contracts/scripts/setup-fuji.ts` refuses otherwise). The same
three roles were granted on the four other seed schools: 20 setup transactions in total, and a
second `pnpm setup:fuji` run reported "0 transaction(s) sent, 20 step(s) already in place".
Each role address holds 0.05 test AVAX for gas.

## Transactions from the demo case `BB-2026-000042`

**Where these came from:** the hosted site https://bonablock.vercel.app, which has used this
contract since 2026-11-18 (`/api/health` reports `ledger: "avalanche"`, `/api/ledger` reports
`live: true`). These are the case's records as the site shows them now; every timeline entry
links to its transaction on Snowtrace and reads "Recorded on Avalanche".

| Step                                   | Function            | Signer      | Tx hash                                                              | Block    | Result                                  |
| -------------------------------------- | ------------------- | ----------- | -------------------------------------------------------------------- | -------- | --------------------------------------- |
| Report registered                      | `registerReport`    | Registrar   | `0xed8ac146da8ffd7fdd65a3b7a33a30299b18c86211800bd50f7926fb86b2888d` | 61277936 | `ReportRegistered`                      |
| Evidence E1 registered                 | `registerEvidence`  | Registrar   | `0xce88a2d3698021a9a3385cdef7af3ad0aafee9d09f17a908948b60d3f4c3d81b` | 61277937 | `EvidenceRegistered`                    |
| Evidence E2 registered                 | `registerEvidence`  | Registrar   | `0x079a7881e24c4be1f0101952a6172ddd974027eb78c2d6c6a806ea212f7ee64d` | 61277940 | `EvidenceRegistered`                    |
| Acknowledged                           | `acknowledgeReport` | SchoolAdmin | `0xe871053cba8d7ab4a1d79d0df314c218d1b278a35a9833ad3912e1f90edd773c` | 61277943 | `ReportAcknowledged`                    |
| Evidence E3 registered                 | `registerEvidence`  | Registrar   | `0xd9bd203b97239a2a535b181827dbb83bf8cb475af7eb639e1232f5b16ba478b9` | 61277944 | `EvidenceRegistered`                    |
| Evidence E4 registered                 | `registerEvidence`  | Registrar   | `0x722e66578472adaca571ac991bf475d7a75c1cda18dcc714670f2e672f5ae4f5` | 61277953 | `EvidenceRegistered`                    |
| Evidence E5 registered                 | `registerEvidence`  | Registrar   | `0x7dc4094a3d296435a54c523c67eacf077e0fa1a8d20c0cc8ca7ebe0de6701237` | 61277957 | `EvidenceRegistered`                    |
| Repair claimed                         | `claimRepair`       | SchoolAdmin | `0xc400119d937b62117ec070f1a955727dfa334e68e338c32a950bdeae498f9439` | 61277962 | `RepairClaimed`                         |
| **School admin attempts verifyRepair** | `verifyRepair`      | SchoolAdmin | n/a (`eth_call`, no transaction, no gas)                             | —        | reverted with `SchoolAdminCannotVerify` |

The refusal row is the answer the deployed contract gave to the school administrator's key on
the hosted site: `{ allowed: false, revert: "SchoolAdminCannotVerify", chainRole: "school_admin" }`.

The case is left at "repair claimed" so the demo can show the independent review live. A
dispute by the reviewer key on an earlier copy of this case is transaction
`0x0df699b3d1f2d6335fe65d46d319693d8b9cb11a39f279aeef25f4ee2fb7d05c` (block 61276685,
`RepairDisputed`), made from the app running on the coordinator's machine against the same
contract.

A demo reset re-seeds the cases with new ids and anchors them again, so after a reset the site
shows newer hashes than this table. The ones here stay on the chain for good.

Open any hash at `https://testnet.snowtrace.io/tx/<hash>`. The event logs hold only `bytes32`
values — no text, no names, no photos.

## End-to-end runs against this contract

| Run                                                                                       | Result                                                |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Seed of 11 cases on the hosted site (`POST /api/demo/reset` + `/api/ledger/retry`)        | 48 of 48 writes anchored, 0 rejected                  |
| 17-step demo (`pnpm e2e:live`) on https://bonablock.vercel.app with the Fuji ledger       | 5/5 passing (2.5 min), every write a real transaction |
| Same suite on the local app with the Fuji ledger                                          | 5/5 passing                                           |
| BonaBlock Verify (CLI, own RPC) on the `ReportRegistered` receipt above with its document | **VERIFIED**                                          |
| Same receipt with one field of the document changed                                       | **MISMATCH**                                          |

## What the contract tests prove (Hardhat in-process network)

`pnpm --filter @bona/contracts test` — 42 passing, including:

- rejects a school administrator verifying their own repair
- rejects a school administrator disputing (i.e. reviewing) their own repair
- rejects closure by outsiders, the registrar and the contract owner
- still rejects a former administrator who is re-granted the reviewer role
- keeps every evidence record, claim and event through dispute, re-claim and verification
- exposes no function that edits or deletes a report, evidence record or claim
- keeps schools isolated: a role on one school gives nothing on another

## How a judge can verify independently

1. Take a receipt from any timeline entry (tx hash + event) and the original evidence file.
2. Open BonaBlock Verify (https://bona-verify.vercel.app — separate deployment, no dependency
   on the BonaBlock API, accepts only receipts from the contract above) or run
   `pnpm --filter bona-verify verify -- --receipt receipt.json --file photo.jpg`.
3. The verifier recomputes SHA-256, fetches the transaction from its own Fuji RPC, decodes the
   `EvidenceRegistered` event and compares. Change one byte of the file and it reports MISMATCH.
4. Cross-check on Snowtrace: the event log shows only `bytes32` values — no text, no names.
5. `BONA_TX_HASH=0x… pnpm --filter @bona/contracts anchor-check:fuji` decodes any hash above.
