/**
 * The contract ABIs, generated in `contracts/` (`pnpm --filter @bona/contracts abi`
 * and `pnpm chain:abi`). Imported here, never copied, so the app can never
 * drift from the contracts.
 */
export { bonaRegistryAbi } from "../../contracts/abi/BonaRegistry";
export { bonaChainFactoryAbi } from "../../contracts/abi/chain/factory";
export { institutionOperationsAbi } from "../../contracts/abi/chain/operations";
export { institutionFinanceAbi } from "../../contracts/abi/chain/finance";
