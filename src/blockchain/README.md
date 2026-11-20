# src/blockchain

Owner: **Blockchain team**.

The only place in the app that imports a chain library. It exports
implementations of `LedgerPort` (from `@/shared`) for Avalanche Fuji and picks
one from the environment (`createLedger` in `index.ts`).

| File              | What it is                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chain-ledger.ts` | The Bona Chain adapter: `BonaChainFactory` plus the `InstitutionOperations` and `InstitutionFinance` contracts it created for each institution. Used when `LEDGER_FACTORY_ADDRESS` is set. |
| `viem-ledger.ts`  | The earlier single `BonaRegistry`. Used when only `LEDGER_CONTRACT_ADDRESS` is set. It has no finance functions.                                                                           |
| `chain-common.ts` | What the two share: Fuji only, revert names, receipts that are never confirmed without a mined transaction.                                                                                |
| `abi.ts`          | Re-exports the ABIs generated in `contracts/abi/`. Imported, never copied.                                                                                                                 |
| `test/`           | A stand-in JSON-RPC endpoint for unit tests. It decodes each call and each signed transaction with the real ABIs.                                                                          |

Rules the adapters keep:

- Fuji (`eip155:43113`) only. Any other chain id is refused before a client is built.
- One key per on-chain role, all different. The role that signs is fixed by the
  operation; nothing in a request can choose it.
- Every write is simulated first, so a refusal arrives as the contract's own
  error name (`LedgerError.contractError`) and costs no gas.
- The Bona Chain adapter asks the factory for an institution's two contracts
  once (`institutionOf`) and remembers the answer. An institution the factory
  does not know gets no write. Nothing is ever sent to `LEDGER_CONTRACT_ADDRESS`.
- `LEDGER_FINANCE_MODE=off`, or a missing finance key, makes every finance call
  answer `not_configured` and `info().finance` say `off`.
