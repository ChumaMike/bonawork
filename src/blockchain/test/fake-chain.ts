import {
  custom,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Abi,
  type Hex,
  type Transport,
} from "viem";
import {
  bonaChainFactoryAbi,
  institutionFinanceAbi,
  institutionOperationsAbi,
} from "../abi";

/**
 * A stand-in for an Avalanche Fuji JSON-RPC endpoint, for unit tests of the
 * chain adapter. It answers the calls viem makes, decodes every `eth_call` and
 * every signed transaction with the real ABIs, and records them, so a test can
 * say which contract a call reached, which function it was, and which key
 * signed it. Nothing leaves the process.
 */

export const FUJI_CHAIN_ID_HEX = "0xa869";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface FakeCall {
  /** `call` is a simulation or a read; `send` is a signed transaction. */
  via: "call" | "send";
  /** Lower-case. */
  to: string;
  /** Lower-case. For a simulation: the account it was simulated for. */
  from: string | null;
  contract: "factory" | "operations" | "finance" | "unknown";
  functionName: string;
  args: readonly unknown[];
  /** Only for `send`. */
  hash?: Hex;
}

export interface FakeInstitution {
  operations: Hex;
  finance: Hex;
}

export interface FakeChain {
  transport: Transport;
  factory: Hex;
  /** Every decoded call and transaction, in order. */
  calls: FakeCall[];
  /** Every JSON-RPC method asked for, in order. */
  methods: string[];
  /** Make the factory know an institution (bytes32 id). */
  addInstitution(id: Hex, contracts: FakeInstitution): void;
  /** Set what an operations contract answers for `statusOf(reportId)`. */
  setReportStatus(operations: Hex, reportId: Hex, status: number): void;
  /**
   * Decide whether a call to an institution's contract reverts. Return a custom
   * error to revert with, or nothing to let it through. Asked for simulations.
   */
  revertWith:
    | ((call: FakeCall) => { errorName: string; args?: readonly unknown[] } | undefined)
    | null;
  /** When false, sent transactions stay unmined until `mineAll()`. */
  autoMine: boolean;
  mineAll(): void;
  /** When set, every request fails with this message (the RPC is down). */
  outage: string | null;
  sent(): FakeCall[];
  simulated(): FakeCall[];
  count(functionName: string, via?: FakeCall["via"]): number;
}

const lower = (value: string) => value.toLowerCase();

export function createFakeChain(factory: Hex): FakeChain {
  const institutions = new Map<string, FakeInstitution>();
  const institutionIds: Hex[] = [];
  const statuses = new Map<string, number>();
  const transactions = new Map<string, { to: string; from: string; mined: boolean }>();
  const blockNumber = 100;
  const blockTimestamp = Math.floor(Date.parse("2026-11-20T10:00:00.000Z") / 1000);

  const kindOf = (address: string): FakeCall["contract"] => {
    if (lower(address) === lower(factory)) return "factory";
    for (const institution of institutions.values()) {
      if (lower(institution.operations) === lower(address)) return "operations";
      if (lower(institution.finance) === lower(address)) return "finance";
    }
    return "unknown";
  };
  const abiOf = (contract: FakeCall["contract"]): Abi | null =>
    contract === "factory"
      ? (bonaChainFactoryAbi as Abi)
      : contract === "operations"
        ? (institutionOperationsAbi as Abi)
        : contract === "finance"
          ? (institutionFinanceAbi as Abi)
          : null;

  function decode(
    via: FakeCall["via"],
    to: string,
    from: string | null,
    data: Hex,
  ): FakeCall {
    const contract = kindOf(to);
    const abi = abiOf(contract);
    if (!abi) {
      return {
        via,
        to: lower(to),
        from: from ? lower(from) : null,
        contract,
        functionName: "?",
        args: [],
      };
    }
    const { functionName, args } = decodeFunctionData({ abi, data });
    return {
      via,
      to: lower(to),
      from: from ? lower(from) : null,
      contract,
      functionName,
      args: args ?? [],
    };
  }

  function revert(call: FakeCall): never | void {
    // Only an institution's contracts are asked: the factory's reads always answer.
    if (call.contract === "factory") return;
    const wanted = chain.revertWith?.(call);
    if (!wanted) return;
    const abi = abiOf(call.contract)!;
    const data = encodeErrorResult({
      abi,
      errorName: wanted.errorName,
      args: wanted.args as never,
    });
    throw Object.assign(new Error("execution reverted"), { code: 3, data });
  }

  /** The return data of a read. A write returns nothing. */
  function answer(call: FakeCall): Hex {
    const abi = abiOf(call.contract);
    if (!abi) return "0x";
    const result = (value: unknown) =>
      encodeFunctionResult({
        abi,
        functionName: call.functionName,
        result: value as never,
      });
    if (call.contract === "factory") {
      switch (call.functionName) {
        case "institutionOf": {
          const found = institutions.get(lower(call.args[0] as string));
          return result(
            found ? [found.operations, found.finance] : [ZERO_ADDRESS, ZERO_ADDRESS],
          );
        }
        case "institutionCount":
          return result(BigInt(institutionIds.length));
        case "institutionIdAt":
          return result(institutionIds[Number(call.args[0] as bigint)]);
        case "kindOf": {
          const kind = kindOf(call.args[0] as string);
          return result(kind === "operations" ? 1 : kind === "finance" ? 2 : 0);
        }
      }
    }
    if (call.contract === "operations" && call.functionName === "statusOf") {
      return result(statuses.get(`${call.to}:${lower(call.args[0] as string)}`) ?? 0);
    }
    return "0x";
  }

  const receiptOf = (hash: string) => {
    const tx = transactions.get(lower(hash));
    if (!tx || !tx.mined) return null;
    return {
      transactionHash: hash,
      transactionIndex: "0x0",
      blockHash: `0x${"b1".repeat(32)}`,
      blockNumber: `0x${blockNumber.toString(16)}`,
      from: tx.from,
      to: tx.to,
      contractAddress: null,
      cumulativeGasUsed: "0x5208",
      gasUsed: "0x5208",
      effectiveGasPrice: "0x5d21dba00",
      logs: [],
      logsBloom: `0x${"0".repeat(512)}`,
      status: "0x1",
      type: "0x2",
    };
  };

  const block = () => ({
    number: `0x${blockNumber.toString(16)}`,
    hash: `0x${"b1".repeat(32)}`,
    parentHash: `0x${"b0".repeat(32)}`,
    timestamp: `0x${blockTimestamp.toString(16)}`,
    baseFeePerGas: "0x5d21dba00",
    gasLimit: "0x7a1200",
    gasUsed: "0x0",
    transactions: [],
    uncles: [],
  });

  async function request({
    method,
    params,
  }: {
    method: string;
    params?: unknown;
  }): Promise<unknown> {
    chain.methods.push(method);
    if (chain.outage) throw new Error(chain.outage);
    const args = (params ?? []) as unknown[];
    switch (method) {
      case "eth_chainId":
        return FUJI_CHAIN_ID_HEX;
      case "eth_blockNumber":
        return `0x${blockNumber.toString(16)}`;
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
        return block();
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_estimateGas":
        return "0x30d40";
      case "eth_gasPrice":
        return "0x5d21dba00";
      case "eth_maxPriorityFeePerGas":
        return "0x3b9aca00";
      case "eth_call": {
        const tx = args[0] as { to: string; from?: string; data: Hex };
        const call = decode("call", tx.to, tx.from ?? null, tx.data);
        chain.calls.push(call);
        revert(call);
        return answer(call);
      }
      case "eth_sendRawTransaction": {
        const raw = args[0] as Hex;
        const parsed = parseTransaction(raw);
        const from = await recoverTransactionAddress({
          serializedTransaction: raw as never,
        });
        const hash = keccak256(raw);
        const call = { ...decode("send", parsed.to!, from, parsed.data!), hash };
        chain.calls.push(call);
        transactions.set(lower(hash), {
          to: parsed.to!,
          from,
          mined: chain.autoMine,
        });
        return hash;
      }
      case "eth_getTransactionReceipt":
        return receiptOf(args[0] as string);
      case "eth_getTransactionByHash": {
        const tx = transactions.get(lower(args[0] as string));
        if (!tx) return null;
        return {
          hash: args[0],
          from: tx.from,
          to: tx.to,
          input: "0x",
          nonce: "0x0",
          value: "0x0",
          gas: "0x30d40",
          type: "0x2",
          maxFeePerGas: "0x5d21dba00",
          maxPriorityFeePerGas: "0x3b9aca00",
          chainId: FUJI_CHAIN_ID_HEX,
          blockHash: tx.mined ? `0x${"b1".repeat(32)}` : null,
          blockNumber: tx.mined ? `0x${blockNumber.toString(16)}` : null,
          transactionIndex: tx.mined ? "0x0" : null,
        };
      }
      default:
        throw Object.assign(new Error(`the method ${method} does not exist`), {
          code: -32601,
        });
    }
  }

  const chain: FakeChain = {
    transport: custom({ request }, { retryCount: 0 }),
    factory,
    calls: [],
    methods: [],
    addInstitution(id, contracts) {
      if (!institutions.has(lower(id))) institutionIds.push(id);
      institutions.set(lower(id), contracts);
    },
    setReportStatus(operations, reportId, status) {
      statuses.set(`${lower(operations)}:${lower(reportId)}`, status);
    },
    revertWith: null,
    autoMine: true,
    mineAll() {
      for (const tx of transactions.values()) tx.mined = true;
    },
    outage: null,
    sent: () => chain.calls.filter((call) => call.via === "send"),
    simulated: () =>
      chain.calls.filter((call) => call.via === "call" && call.contract !== "factory"),
    count: (functionName, via) =>
      chain.calls.filter(
        (call) => call.functionName === functionName && (!via || call.via === via),
      ).length,
  };
  return chain;
}
