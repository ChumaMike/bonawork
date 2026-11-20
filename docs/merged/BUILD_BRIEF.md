# Bona Chain build brief

The shared contract for everyone building the merged product. If something here is wrong or
blocks you, say so in your hand-off; do not silently diverge.

Bona Chain = the existing BonaBlock flow (report -> acknowledge -> repair claim -> independent
verify/dispute, each anchored on Avalanche Fuji) plus a procurement trail on the same case:

```
report -> work order approved (buyer) -> order acknowledged (supplier) -> invoice submitted (supplier)
       -> goods receipt recorded (receiving officer) -> three-way match (rule engine)
       -> independent verification (existing flow) -> release authorised (payment approver)
```

## Rules that always hold

- Testnet only (Fuji, chain id 43113). Never mainnet.
- No real money moves. The last step is a **release instruction**. Never write "paid".
- There is no "resolved" status. A repair is `repair_claimed` until an independent reviewer
  makes it `verified`. Finance steps never change the report status.
- A simulated (memory-ledger) result is never called an Avalanche transaction.
- AI never approves, verifies, signs or authorises. It has no tools and writes nothing.
- Never print or commit secrets. Keys live in git-ignored env files and Vercel Sensitive env.
- Public responses carry no amounts, supplier names, documents or people's names.
- Existing behaviour and tests stay green. Seed case `BB-2026-000042` is pinned by tests: do not change it.
- `contracts/contracts/BonaRegistry.sol` and its tests are not edited.
- Read `AGENTS.md`: this Next.js version differs from older ones; check `node_modules/next/dist/docs/`.
- Run `pnpm check` before every commit. Commit with
  `git -c user.name="ChumaMike" -c user.email="ChumaMike@users.noreply.github.com" commit`
  and end the message with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
  Do not push, merge or deploy; the coordinator does that.

## Roles and permissions (`src/shared/roles.ts`)

New user roles: `buyer`, `supplier`, `receiving_officer`, `payment_approver`.

| Permission                            | Held by                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `order:approve`                       | buyer                                                                                                                         |
| `order:acknowledge`, `invoice:submit` | supplier                                                                                                                      |
| `receipt:record`                      | receiving_officer                                                                                                             |
| `release:authorise`                   | payment_approver                                                                                                              |
| `procurement:read`                    | buyer, supplier (own orders only), receiving_officer, payment_approver, school_admin, district_official, independent_reviewer |

Invariants (tested): no role holds two of approve / submit / receive / authorise; the authoriser
role holds neither `repair:claim` nor `repair:verify`. Per case, the person who authorises must
differ from the approver, the invoicer, the receiver and the reviewer.

Chain role for each new user role: Buyer, Supplier, Receiver, PaymentApprover.

## Smart contracts (`contracts/contracts/chain/`, solc 0.8.28, no inline assembly, `new` not clones)

```solidity
enum Role {None,Registrar,SchoolAdmin,Reviewer,Buyer,Supplier,Receiver,PaymentApprover}
enum Kind {None,Operations,Finance}
enum OrderStatus {None,Approved,Acknowledged,ReleaseAuthorised}
// Status, EvidenceKind, ClaimOutcome: same values as BonaRegistry

// BonaChainFactory(address initialOwner): the registry. Holds every role.
owner() pendingOwner() transferOwnership(address) acceptOwnership()
createInstitution(bytes32 institutionId) returns (address operations, address finance)   // onlyOwner
grantRole(bytes32 institutionId, address account, Role role)                             // onlyOwner
revokeRole(bytes32 institutionId, address account)                                       // onlyOwner
roleOf(bytes32,address) view returns (Role)
institutionOf(bytes32) view returns (address operations, address finance)                // zeros if unknown
kindOf(address) view returns (Kind)
isGenuine(address) view returns (bool)
institutionCount() view returns (uint256)
institutionIdAt(uint256) view returns (bytes32)
event InstitutionCreated(bytes32 indexed institutionId, address indexed operations, address indexed finance)
event RoleGranted(bytes32 indexed institutionId, address indexed account, Role role)
event RoleRevoked(bytes32 indexed institutionId, address indexed account, Role role)
event OwnershipTransferStarted / OwnershipTransferred          // as BonaRegistry
error NotOwner(address) NotPendingOwner(address) ZeroAddress() ZeroValue() InvalidRole()
error InstitutionAlreadyExists(bytes32) InstitutionNotFound(bytes32)
error RoleConflict(bytes32,address,Role) RoleNotHeld(bytes32,address)

// InstitutionOperations(address factory, bytes32 institutionId): BonaRegistry behaviour for one institution.
registerReport(bytes32 reportId, bytes32 commitment)            // no schoolId argument
registerEvidence(bytes32 reportId, bytes32 digest, EvidenceKind kind)
acknowledgeReport(bytes32 reportId)
recordInterimProtection(bytes32 reportId, bytes32 commitment)
claimRepair(bytes32 reportId, bytes32 commitment)
verifyRepair(bytes32 reportId, bytes32 reviewCommitment)
disputeRepair(bytes32 reportId, bytes32 reviewCommitment)
views: factory() institutionId() statusOf(bytes32) getReport getEvidence evidenceCount
       isEvidenceRegistered getClaim claimCount getProtection protectionCount
       hasActedForSchool reportIdByCommitment
events: the seven BonaRegistry events, byte-identical (the schoolId slot carries institutionId)
errors: Unauthorized(address,Role) + BonaRegistry's (SchoolAdminCannotVerify, InvalidState,
        ReportNotFound, ReportAlreadyRegistered, DuplicateCommitment, DuplicateEvidence,
        DuplicateProtection, ZeroValue)

// InstitutionFinance(address factory, bytes32 institutionId, address operations)
approveWorkOrder(bytes32 workOrderId, bytes32 reportId, bytes32 commitment)   // Buyer; report must exist in operations
acknowledgeWorkOrder(bytes32 workOrderId)                                     // Supplier; binds order.supplier
submitInvoice(bytes32 workOrderId, bytes32 commitment)                        // the bound supplier
recordGoodsReceipt(bytes32 workOrderId, bytes32 commitment)                   // Receiver
recordMatchResult(bytes32 workOrderId, bytes32 invoiceCommitment, bool passed, bytes32 commitment) // Registrar (platform relayer)
openPaymentDispute(bytes32 workOrderId, bytes32 commitment)                   // Buyer or Receiver
closePaymentDispute(bytes32 workOrderId, bytes32 commitment)                  // the opener only
authoriseRelease(bytes32 workOrderId, bytes32 commitment)                     // PaymentApprover
views: factory() institutionId() operations() getWorkOrder(bytes32) actedAs(bytes32,address)
events, all (bytes32 indexed workOrderId, bytes32 indexed reportId, <payload>, address indexed actor, uint64 timestamp):
  WorkOrderApproved(commitment)        WorkOrderAcknowledged()
  InvoiceSubmitted(uint256 invoiceIndex, commitment)
  GoodsReceiptRecorded(uint256 receiptIndex, commitment)
  MatchRecorded(bytes32 invoiceCommitment, bool passed, commitment)
  PaymentDisputeOpened(commitment)     PaymentDisputeClosed(commitment)
  ReleaseAuthorised(commitment)
errors: Unauthorized(address,Role) SeparationOfDuties(address,bytes32) WorkOrderAlreadyExists(bytes32)
  WorkOrderNotFound(bytes32) ReportNotFound(bytes32) InvalidOrderState(bytes32,OrderStatus)
  DuplicateCommitment(bytes32) StaleInvoice(bytes32) NoInvoice(bytes32) NoGoodsReceipt(bytes32)
  MatchNotPassing(bytes32) DisputeOpen(bytes32) NoOpenDispute(bytes32)
  RepairNotVerified(bytes32,uint8) ZeroValue()
```

Rules:

- One role per institution per account (factory, `RoleConflict`).
- `actedAs[workOrderId][account]`: once an account acts on an order under one role, acting on the
  same order under a different role reverts `SeparationOfDuties`, even after a role change.
- A match is current only for the latest invoice and only while no later goods receipt exists.
- `authoriseRelease` checks in this exact order (the memory ledger mirrors it):
  WorkOrderNotFound -> SeparationOfDuties -> Unauthorized -> InvalidOrderState -> NoInvoice ->
  NoGoodsReceipt -> MatchNotPassing -> DisputeOpen -> RepairNotVerified.
- Fingerprints only on chain. No amounts, names or documents.

## Ledger port additions (`src/shared/ports.ts`)

```ts
type FinanceChainRole = "buyer" | "supplier" | "receiver" | "payment_approver";
type Ref = { institutionId: Id; workOrderId: Id };
approveWorkOrder(i: Ref & { reportId: Id; commitment: Hex32 }): Promise<BlockchainReceipt>
acknowledgeWorkOrder(i: Ref): Promise<BlockchainReceipt>
submitInvoice(i: Ref & { commitment: Hex32 }): Promise<BlockchainReceipt>
recordGoodsReceipt(i: Ref & { commitment: Hex32 }): Promise<BlockchainReceipt>
recordMatchResult(i: Ref & { invoiceCommitment: Hex32; passed: boolean; commitment: Hex32 }): Promise<BlockchainReceipt>
openPaymentDispute(i: Ref & { commitment: Hex32; as: "buyer" | "receiver" }): Promise<BlockchainReceipt>
closePaymentDispute(i: Ref & { commitment: Hex32; as: "buyer" | "receiver" }): Promise<BlockchainReceipt>
authoriseRelease(i: Ref & { commitment: Hex32 }): Promise<BlockchainReceipt>
probeRelease(i: Ref): Promise<{ allowed: boolean; revert: string | null }>
// the existing report-scoped inputs gain an optional `institutionId?: Id`
// LedgerInfo gains `finance: "live" | "simulated" | "off"`
```

- Events: keep `REGISTRY_EVENTS`; add `FINANCE_EVENTS` (the eight above) and `LEDGER_EVENTS`
  (the union). The receipt schema accepts `LEDGER_EVENTS`.
- Ledger error codes to add: `separation_of_duties` (403) and `release_blocked` (409).
- `LedgerOperation` (database/schema.ts) gains one value per new write.
- Finance steps are case events (`ledger_jobs.event_id` is NOT NULL); the receipt sits on the
  case event (`targetKind: "event"`). New case-event types map to `null` in
  `CASE_EVENT_RESULTING_STATUS`.
- Env: `LEDGER_FACTORY_ADDRESS`, `LEDGER_{BUYER,SUPPLIER,RECEIVER,PAYMENT_APPROVER}_PRIVATE_KEY`,
  `LEDGER_FINANCE_MODE=auto|off`. All seven keys must differ. The Bona Chain adapter ignores and
  must refuse to write to the old `LEDGER_CONTRACT_ADDRESS`. Verifier: `VERIFY_FACTORY_ADDRESS`.

## Commitment documents (`src/shared/domain.ts`)

Each is salted and carries `type`, its own id, `workOrderId`, `reportId`, `createdAt`, `salt`.

| type               | extra fields                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `work_order`       | `institutionId`, `version`, `description`, `lines`, `totalCents`, `currency`                                              |
| `supplier_invoice` | `invoiceNumber`, `orderVersion`, `lines`, `totalCents`, `currency`                                                        |
| `goods_receipt`    | `orderVersion`, `lines`, `evidenceDigests`                                                                                |
| `match_result`     | `workOrderCommitment`, `invoiceCommitment`, `receiptCommitments`, `outcome` ("pass" / "fail"), `reasons`, `engineVersion` |
| `release_decision` | `matchCommitment`, `reviewCommitment`, `decision: "authorised"`                                                           |

A line is `{ sku: string; description: string; quantity: integer; unitPriceCents: integer }`
(a receipt line has no price). Money is integer cents; currency is `"ZAR"`.

Verify-link codes for the new events, in the event order above: W, K, I, G, M, O, L, Z.

## Procurement domain (`src/shared/procurement/`)

- `types.ts`: `WorkOrder`, `OrderLine`, `Invoice`, `GoodsReceipt`, `MatchResult`, `MatchReason`,
  `ReleaseGate`, `ProcurementStage`, the staff `MoneyTrail` and the public `PublicTrailStep`.
- `match.ts`: `matchThreeWay(input): { outcome: "matched" | "blocked"; reasons: MatchReason[] }`,
  pure and deterministic, reasons in stable order. Reason codes:
  `order_version_changed`, `order_not_acknowledged`, `wrong_supplier`, `duplicate_invoice`,
  `missing_receipt`, `unknown_line`, `missing_line`, `excess_quantity`, `quantity_mismatch`,
  `unit_price_mismatch`, `total_mismatch`. Exact match only; no tolerances.
- `gate.ts`: `releaseGate(input): { open: boolean; blockers: ReleaseBlocker[] }`. Open only when
  the report is `verified`, the latest match is `matched` on the current order version, the order
  is acknowledged, there is no earlier release, and the per-case separation check passes.
  Blocker codes: `repair_not_verified`, `no_matching_invoice`, `order_not_acknowledged`,
  `already_released`, `same_person`.
- `explain.ts`: `ruleExplanation(reasons)`: the code-written plain-language explanation.
- `visibility.ts`: the field matrix below.

Derived stage for display: `order_approved`, `order_acknowledged`, `invoice_blocked`,
`invoice_matched`, `awaiting_verification`, `ready_for_release`, `release_authorised`.

## Tables (`database/schema.ts`, one migration via `pnpm db:generate`)

`work_orders` (report unique for now, buyer, supplier user, supplierName, supplierRef,
currentVersion, acknowledgedVersion/By/At), `work_order_versions` (unique orderId+version, scope,
lines jsonb, totalCents, approvedBy, commitment), `invoices` (orderVersion, invoiceNumber,
supplierRef, lines, statedTotalCents, submittedBy, aiDrafted, sourceTextDigest, commitment),
`goods_receipts` (orderVersion, lines, receivedBy, commitment), `match_results` (invoiceId,
receiptId nullable, outcome, reasons jsonb, inputsDigest, commitment), `release_instructions`
(unique orderId, matchId, reviewId, authorisedBy, commitment). ISO text timestamps like the rest.
Add every new table to the TRUNCATE list in `src/server/seed/index.ts`.

## Routes and client API

| Route                                               | Who                                                       |
| --------------------------------------------------- | --------------------------------------------------------- |
| `GET /api/work/queue`                               | any procurement role: the items that need this person     |
| `GET /api/issues/[id]/procurement`                  | `procurement:read`, filtered by the visibility matrix     |
| `POST /api/issues/[id]/work-order`                  | buyer                                                     |
| `POST /api/issues/[id]/work-order/acknowledgement`  | supplier                                                  |
| `POST /api/issues/[id]/invoices`                    | supplier                                                  |
| `POST /api/issues/[id]/invoices/draft`              | supplier (AI draft; writes nothing)                       |
| `POST /api/issues/[id]/goods-receipt`               | receiving officer                                         |
| `POST /api/issues/[id]/match/[matchId]/explanation` | `procurement:read` (AI explanation)                       |
| `POST /api/issues/[id]/release`                     | payment approver; 409 with blockers when the gate is shut |

`BonaApi` methods (`src/data/api.ts`, implemented in `http-api.ts` and `fixtures/fixture-api.ts`):
`listWorkQueue`, `getMoneyTrail`, `approveWorkOrder`, `acknowledgeOrder`, `draftInvoice`,
`submitInvoice`, `recordGoodsReceipt`, `explainMismatch`, `authoriseRelease`.

## Who sees what

- **Public** (signed out, reporters): the trail of steps with role label, time and proof, built
  from case events only. The public code path reads no finance table. Finance case-event notes
  are code-written constants.
- **Signed in**, from `/procurement` only:

| Role                                                  | Sees                                       |
| ----------------------------------------------------- | ------------------------------------------ |
| buyer, payment_approver, district_official            | everything, with the named person per step |
| supplier                                              | its own orders only, with its own prices   |
| receiving_officer, school_admin, independent_reviewer | names, scope and quantities; no prices     |

- `GET /api/issues/[id]/documents/[recordId]`: finance document types need `procurement:read`;
  otherwise the response carries the receipt and commitment only, no document body.
- Leak test: seed canary amounts and names; signed-out and reporter responses from the issue,
  issue list, school, documents and assistant routes contain none of them.

## Demo data

Two new seeded cases at Thandolwethu Primary (do not touch `BB-2026-000042`):

- **Case A**, `repair_claimed`: order v1 approved, acknowledged, goods received. Ready for the
  live clicks (wrong invoice blocked, right invoice matched, release locked, reviewer verifies,
  approver authorises).
- **Case B**: fully authorised, with a blocked first invoice in its history. Feeds the landing page.

New demo accounts, one per new role, each a named synthetic person, added to `DEMO_ACCOUNTS`,
`DEMO_LOGINS` and the fixture `SAMPLE_ACCOUNTS`.

## File ownership

| Agent                           | Owns                                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation (step 0, runs first) | the shared types and stubs everyone codes against                                                                                                                                                                                                              |
| A backend                       | `database/**`, `src/server/procurement/**`, `src/server/{view,seed,reports}/**` (except `anchor.ts`), `src/app/api/**` except C's routes, `src/shared/procurement/**`                                                                                          |
| B frontend                      | `src/features/procurement/**`, new pages under `src/app/` (not api), `src/components/**`, `src/features/{auth,issues,staff}/**`, `src/data/{http-api,audience}.ts`, `src/data/fixtures/**` except C's, `src/i18n/en-procurement.ts`, `e2e/procurement.spec.ts` |
| C AI, rename, landing           | `src/server/ai/**`, routes `assistant`, `invoices/draft`, `match/[matchId]/explanation`, `src/data/fixtures/{assistant,procurement-ai}.ts`, `src/i18n/en.ts`, `src/features/{assistant,home}/**`, the landing page, root docs, string edits in existing e2e    |
| D contracts                     | `contracts/**`                                                                                                                                                                                                                                                 |
| E ledger and verifier           | `src/shared/ports.ts`, `src/blockchain/**`, `src/server/ledger/**`, `src/server/reports/anchor.ts`, `src/server/env.ts`, `src/server/test/harness.ts`, `src/lib/verify-link.ts`, `verifier/**`                                                                 |

After step 0, changes to `src/shared/{roles,domain}.ts`, `src/data/{types,api}.ts` go through the
coordinator: describe the change in your hand-off instead of editing.
