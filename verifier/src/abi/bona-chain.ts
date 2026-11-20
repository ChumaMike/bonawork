// COPY of parts of contracts/abi/chain/finance.json and factory.json (Bona Chain, Avalanche Fuji).
// The verifier deliberately does not import from the contracts or app packages:
// it must not share code with the system it checks. Re-copy these entries
// whenever the contract ABIs change; `bona-chain.test.ts` fails when they drift.
//
// The events of InstitutionOperations are not repeated here: they are the seven
// BonaRegistry events, byte for byte, and are decoded with `bona-registry.ts`.

/** The eight events of InstitutionFinance: the procurement trail. */
export const institutionFinanceEventsAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "workOrderId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "reportId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "receiptIndex",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "commitment",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "actor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "timestamp",
        type: "uint64",
      },
    ],
    name: "GoodsReceiptRecorded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "workOrderId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "reportId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "invoiceIndex",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "commitment",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "actor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "timestamp",
        type: "uint64",
      },
    ],
    name: "InvoiceSubmitted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "workOrderId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "reportId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "invoiceCommitment",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "passed",
        type: "bool",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "commitment",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "actor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "timestamp",
        type: "uint64",
      },
    ],
    name: "MatchRecorded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "workOrderId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "reportId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "commitment",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "actor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "timestamp",
        type: "uint64",
      },
    ],
    name: "PaymentDisputeClosed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "workOrderId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "reportId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "commitment",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "actor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "timestamp",
        type: "uint64",
      },
    ],
    name: "PaymentDisputeOpened",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "workOrderId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "reportId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "commitment",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "actor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "timestamp",
        type: "uint64",
      },
    ],
    name: "ReleaseAuthorised",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "workOrderId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "reportId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "actor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "timestamp",
        type: "uint64",
      },
    ],
    name: "WorkOrderAcknowledged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "workOrderId",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "bytes32",
        name: "reportId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "commitment",
        type: "bytes32",
      },
      {
        indexed: true,
        internalType: "address",
        name: "actor",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "timestamp",
        type: "uint64",
      },
    ],
    name: "WorkOrderApproved",
    type: "event",
  },
] as const;

/**
 * The two views of BonaChainFactory the verifier asks: which kind of contract
 * an address is (0 = not created by this factory, 1 = operations, 2 = finance).
 */
export const bonaChainFactoryViewsAbi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address",
      },
    ],
    name: "isGenuine",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address",
      },
    ],
    name: "kindOf",
    outputs: [
      {
        internalType: "enum Kind",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
