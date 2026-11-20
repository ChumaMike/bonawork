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
