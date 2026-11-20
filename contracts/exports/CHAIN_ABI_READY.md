# Bona Chain ABIs are ready

Commit `7bf1423` on branch `chain/contracts` holds the three contracts with their final
external signatures and the typed ABIs. Bodies are complete; tests and scripts follow in later
commits on the same branch. `contracts/test/chain/abi-exports.test.ts` fails if a later contract
change is not re-exported, so these files always match the compiled contracts.

| Contract                | Typed ABI                           | Export name                |
| ----------------------- | ----------------------------------- | -------------------------- |
| `BonaChainFactory`      | `contracts/abi/chain/factory.ts`    | `bonaChainFactoryAbi`      |
| `InstitutionOperations` | `contracts/abi/chain/operations.ts` | `institutionOperationsAbi` |
| `InstitutionFinance`    | `contracts/abi/chain/finance.ts`    | `institutionFinanceAbi`    |

A plain `.json` copy sits next to each `.ts` file. Regenerate with `pnpm chain:abi` in `contracts/`.

## What to know when coding against them

Everything in `docs/merged/BUILD_BRIEF.md` is implemented as written. The points below are the
places where the brief left a choice open.

- **Enums are numbers on the wire** (`uint8`), in the order given in the brief.
- **`Unauthorized(address account, Role required)`** has two arguments in the institution
  contracts (BonaRegistry had three).
- **Operations `getReport`** returns the same struct shape as BonaRegistry. Its `schoolId` field
  carries the institution id. The seven events keep the BonaRegistry names, argument names and
  topics; the `schoolId` argument carries the institution id.
- **Operations has no `getAll*` views** (they are not in the brief). Use the counts and the
  per-index getters, or the events.
- **Operations adds one view, `hasReviewed(bytes32 reportId, address account)`**: true once the
  account verified or disputed a claim on that report. Finance reads it.
- **Finance `getWorkOrder(bytes32)`** returns one struct:
  `reportId, commitment, status, disputeOpen, matchPassed, buyer, approvedAt, supplier,
acknowledgedAt, invoiceCount, disputeOpener, receiptCount, releasedBy, releasedAt,
latestInvoice, latestReceipt, currentMatch, releaseCommitment`.
  `currentMatch` is zero and `matchPassed` is false when there is no current match (none yet, or
  voided by a newer invoice or goods receipt). An unknown order returns all zeros
  (`status == 0`).
- **`DuplicateCommitment(bytes32)` in finance is contract-wide**: any fingerprint (order,
  invoice, receipt, match, dispute, release) can be recorded once per finance contract.
- **Check order.** Every finance write checks: zero input (`ZeroValue`) -> `WorkOrderNotFound`
  -> `SeparationOfDuties` -> `Unauthorized` -> state -> step-specific errors ->
  `DuplicateCommitment`. For `authoriseRelease` the middle part is exactly the brief's order.
  `approveWorkOrder` checks `ZeroValue` -> `Unauthorized` -> `WorkOrderAlreadyExists` ->
  `ReportNotFound` -> `DuplicateCommitment`.
- **`probeRelease`** can be an `eth_call` of `authoriseRelease(workOrderId, <any unused non-zero
bytes32>)` with `from` set to the payment approver address: it reverts with the first blocker
  or succeeds.
- **`submitInvoice` by a supplier other than the bound one** reverts
  `Unauthorized(account, Supplier)`.
- **`recordGoodsReceipt`** is accepted while the order is `Approved` or `Acknowledged`.
  `submitInvoice` and `recordMatchResult` need `Acknowledged`. Nothing is accepted after
  `ReleaseAuthorised` (`InvalidOrderState`).
- **`openPaymentDispute`** by an account that is neither buyer nor receiver reverts
  `Unauthorized(account, Buyer)`. A second open while one is open reverts `DisputeOpen`.
  `closePaymentDispute` by anyone but the opener reverts `Unauthorized(account, <opener's role>)`.
- **`authoriseRelease` `SeparationOfDuties` also looks at the report**: an account that acted for
  the institution on the report (`hasActedForSchool`) or reviewed it (`hasReviewed`) is refused,
  even after a role change. With seven different keys this never fires in the app.
- **`RepairNotVerified(bytes32 reportId, uint8 status)`** carries the report id (not the work
  order id) and the report status as a number.
- **Institution ids** are converted exactly like school ids were: the UUID's 16 bytes
  left-padded with zeros to 32 bytes (`idToBytes32`).
