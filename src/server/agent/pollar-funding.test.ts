import { address, generateKeyPairSigner } from "@solana/kit";
import { beforeAll, describe, expect, it } from "vitest";
import { findAssociatedTokenAddress, findEscrowPda } from "@/solana/program";
import devnet from "../../../config/solana-devnet.json";
import {
  verifyPollarFunding,
  type FundingExpectation,
  type FundingRpc,
  type ParsedTransaction,
  type SignatureStatus,
} from "./pollar-funding";

const MINT = devnet.mint;
const OTHER_MINT = "So11111111111111111111111111111111111111112";
const AMOUNT = BigInt(645_000);
const SIG = "5".repeat(88);

let funder: string;
let funderAta: string;
let escrow: string;
let vault: string;
let stranger: string;
let strangerAta: string;

beforeAll(async () => {
  funder = (await generateKeyPairSigner()).address;
  stranger = (await generateKeyPairSigner()).address;
  escrow = await findEscrowPda(address(funder), new Uint8Array(32).fill(7));
  funderAta = await findAssociatedTokenAddress(address(funder), address(MINT));
  strangerAta = await findAssociatedTokenAddress(address(stranger), address(MINT));
  vault = await findAssociatedTokenAddress(address(escrow), address(MINT));
});

type TxOptions = {
  mint?: string;
  destination?: string;
  sourceOwner?: string;
  source?: string;
  amount?: bigint;
  authority?: string;
  err?: unknown;
};

/** A jsonParsed transfer as Solana returns it, with only the fields the check reads. */
function transferTx(o: TxOptions = {}): ParsedTransaction {
  const mint = o.mint ?? MINT;
  const destination = o.destination ?? vault;
  const source = o.source ?? funderAta;
  const amount = o.amount ?? AMOUNT;
  const sourceOwner = o.sourceOwner ?? funder;
  const keys = [funder, source, destination, "TokenkegQfeZyiNwAJbNbGqPvTnyXeoTmF5vXUq7N9qrr"];
  const bal = (index: number, owner: string, value: bigint) => ({
    accountIndex: index,
    mint,
    owner,
    uiTokenAmount: { amount: value.toString() },
  });
  return {
    slot: 123,
    meta: {
      err: o.err ?? null,
      preTokenBalances: [bal(1, sourceOwner, BigInt(1_000_000)), bal(2, escrow, BigInt(0))],
      postTokenBalances: [bal(1, sourceOwner, BigInt(1_000_000) - amount), bal(2, escrow, amount)],
      innerInstructions: [],
    },
    transaction: {
      message: {
        accountKeys: keys.map((pubkey, i) => ({ pubkey, signer: i === 0 })),
        instructions: [
          {
            program: "spl-token",
            programId: "TokenkegQfeZyiNwAJbNbGqPvTnyXeoTmF5vXUq7N9qrr",
            parsed: {
              type: "transferChecked",
              info: {
                source,
                destination,
                mint,
                authority: o.authority ?? funder,
                tokenAmount: { amount: amount.toString(), decimals: 2 },
              },
            },
          },
        ],
      },
    },
  };
}

function rpc(tx: ParsedTransaction | null, status: SignatureStatus = "confirmed"): FundingRpc {
  return { getTransaction: async () => tx, getSignatureStatus: async () => status };
}

const expect_ = (): FundingExpectation => ({
  signature: SIG,
  funderWallet: funder,
  escrow,
  mint: MINT,
  amount: AMOUNT,
});

describe("verifyPollarFunding", () => {
  it("accepts an exact, confirmed BDZAR transfer from the funder to the escrow's vault", async () => {
    const result = await verifyPollarFunding(rpc(transferTx()), expect_());
    expect(result).toEqual({ ok: true, vault, slot: 123, status: "confirmed" });
  });

  it("rejects the wrong mint", async () => {
    const result = await verifyPollarFunding(rpc(transferTx({ mint: OTHER_MINT })), expect_());
    expect(result).toMatchObject({ ok: false, reason: "wrong_mint" });
  });

  it("rejects a transfer to another account", async () => {
    const result = await verifyPollarFunding(
      rpc(transferTx({ destination: strangerAta })),
      expect_(),
    );
    expect(result).toMatchObject({ ok: false, reason: "wrong_destination" });
  });

  it("rejects a transfer for a different escrow", async () => {
    const other = await findEscrowPda(address(funder), new Uint8Array(32).fill(9));
    const result = await verifyPollarFunding(rpc(transferTx()), { ...expect_(), escrow: other });
    expect(result).toMatchObject({ ok: false, reason: "wrong_destination" });
  });

  it("rejects less or more than the escrow's amount", async () => {
    const less = await verifyPollarFunding(
      rpc(transferTx({ amount: AMOUNT - BigInt(1) })),
      expect_(),
    );
    expect(less).toMatchObject({ ok: false, reason: "wrong_amount" });
    const more = await verifyPollarFunding(
      rpc(transferTx({ amount: AMOUNT + BigInt(100) })),
      expect_(),
    );
    expect(more).toMatchObject({ ok: false, reason: "wrong_amount" });
  });

  it("rejects money from someone else's wallet", async () => {
    const result = await verifyPollarFunding(
      rpc(transferTx({ source: strangerAta, sourceOwner: stranger, authority: stranger })),
      expect_(),
    );
    expect(result).toMatchObject({ ok: false, reason: "wrong_source" });
  });

  it("rejects a transfer the funder did not sign", async () => {
    const result = await verifyPollarFunding(rpc(transferTx({ authority: stranger })), expect_());
    expect(result).toMatchObject({ ok: false, reason: "no_transfer" });
  });

  it("rejects a failed, missing or unconfirmed transaction", async () => {
    expect(
      await verifyPollarFunding(rpc(transferTx({ err: { InstructionError: [0, "x"] } })), expect_()),
    ).toMatchObject({ ok: false, reason: "failed" });
    expect(await verifyPollarFunding(rpc(null), expect_())).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    expect(await verifyPollarFunding(rpc(transferTx(), "processed"), expect_())).toMatchObject({
      ok: false,
      reason: "not_confirmed",
    });
  });

  it("says the network is down without changing anything", async () => {
    const down: FundingRpc = {
      getTransaction: async () => {
        throw new Error("ECONNRESET");
      },
      getSignatureStatus: async () => "confirmed",
    };
    expect(await verifyPollarFunding(down, expect_())).toMatchObject({ ok: false, reason: "network" });
  });
});
