/**
 * The two System Program instructions the scripts need (SOL transfer and
 * account creation), built by hand so no extra package is required.
 */
import { AccountRole, type Address, type Instruction } from "@solana/kit";

import { BorshWriter, SYSTEM_PROGRAM_ADDRESS } from "@/solana";

export const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

export function getSolTransferInstruction(
  from: Address,
  to: Address,
  lamports: bigint,
): Instruction {
  return {
    programAddress: SYSTEM_PROGRAM_ADDRESS,
    accounts: [
      { address: from, role: AccountRole.WRITABLE_SIGNER },
      { address: to, role: AccountRole.WRITABLE },
    ],
    data: new BorshWriter().u32(2).u64(lamports).toBytes(),
  };
}

export function getCreateAccountInstruction(input: {
  payer: Address;
  newAccount: Address;
  lamports: bigint;
  space: number;
  owner: Address;
}): Instruction {
  return {
    programAddress: SYSTEM_PROGRAM_ADDRESS,
    accounts: [
      { address: input.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: input.newAccount, role: AccountRole.WRITABLE_SIGNER },
    ],
    data: new BorshWriter()
      .u32(0)
      .u64(input.lamports)
      .u64(BigInt(input.space))
      .address(input.owner)
      .toBytes(),
  };
}

/** 1500000000n -> "1.5 SOL". */
export function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""} SOL`;
}
