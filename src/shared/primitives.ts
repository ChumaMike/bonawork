import { z } from "zod";

/** Opaque entity identifier (UUID). */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** UTC timestamp, ISO-8601, e.g. `2026-11-16T09:30:00.000Z`. */
export const IsoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/**
 * 32-byte value as `0x` + 64 lower-case hex characters.
 * This is the single wire format for every digest in the system and maps
 * directly to a `bytes32` on EVM chains.
 */
export const Hex32Schema = z
  .string()
  .regex(/^0x[0-9a-f]{64}$/, "expected 0x + 64 lower-case hex");
export type Hex32 = z.infer<typeof Hex32Schema>;

/** Base58 (Bitcoin alphabet), as Solana writes signatures and addresses. */
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";

/** A Solana transaction signature: 64 bytes in base58 (usually 87 or 88 characters). */
export const SolanaSignatureSchema = z
  .string()
  .regex(new RegExp(`^${BASE58}{64,88}$`), "expected a base58 Solana signature");
export type SolanaSignature = z.infer<typeof SolanaSignatureSchema>;

/** A Solana account or program address: 32 bytes in base58 (32 to 44 characters). */
export const SolanaAddressSchema = z
  .string()
  .regex(new RegExp(`^${BASE58}{32,44}$`), "expected a base58 Solana address");
export type SolanaAddress = z.infer<typeof SolanaAddressSchema>;

/** An EVM address: `0x` + 40 hex characters, any case. */
export const EvmAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x address");

/**
 * The id of one ledger transaction: a Solana signature, or a `0x` 32-byte
 * hash from the earlier EVM ledger. Content fingerprints stay `Hex32`.
 */
export const ChainTxIdSchema = z.union([Hex32Schema, SolanaSignatureSchema]);
export type ChainTxId = z.infer<typeof ChainTxIdSchema>;

/** The address of a ledger program or contract: Solana base58, or an EVM `0x` address. */
export const ChainAddressSchema = z.union([EvmAddressSchema, SolanaAddressSchema]);
export type ChainAddress = z.infer<typeof ChainAddressSchema>;
