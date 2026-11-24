/**
 * A tiny Borsh writer and reader for the fixed-size types the BonaWork program uses.
 * Integers are little-endian. A bool is one byte. Fixed arrays have no length prefix.
 * A fieldless enum is a one-byte tag.
 */
import { getAddressDecoder, getAddressEncoder, type Address } from "@solana/kit";

export type Bytes32 = Uint8Array;

// BigInt() rather than literals: the project targets ES2017.
const U64_MAX = BigInt("0xffffffffffffffff");
const I64_MIN = -BigInt("0x8000000000000000");
const I64_MAX = BigInt("0x7fffffffffffffff");

export class BorshWriter {
  private chunks: Uint8Array[] = [];

  u8(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xff)
      throw new RangeError(`u8 out of range: ${value}`);
    this.chunks.push(Uint8Array.of(value));
    return this;
  }

  u32(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
      throw new RangeError(`u32 out of range: ${value}`);
    }
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value, true);
    this.chunks.push(out);
    return this;
  }

  u64(value: bigint): this {
    if (value < BigInt(0) || value > U64_MAX)
      throw new RangeError(`u64 out of range: ${value}`);
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, value, true);
    this.chunks.push(out);
    return this;
  }

  i64(value: bigint): this {
    if (value < I64_MIN || value > I64_MAX)
      throw new RangeError(`i64 out of range: ${value}`);
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigInt64(0, value, true);
    this.chunks.push(out);
    return this;
  }

  bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  bytes32(value: Uint8Array): this {
    if (value.length !== 32)
      throw new RangeError(`expected 32 bytes, got ${value.length}`);
    this.chunks.push(Uint8Array.from(value));
    return this;
  }

  address(value: Address): this {
    return this.bytes32(Uint8Array.from(getAddressEncoder().encode(value)));
  }

  raw(bytes: Uint8Array): this {
    this.chunks.push(Uint8Array.from(bytes));
    return this;
  }

  toBytes(): Uint8Array {
    const length = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

export class BorshReader {
  private offset = 0;
  private view: DataView;

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private take(n: number): number {
    if (this.offset + n > this.bytes.length) {
      throw new RangeError(`not enough data: need ${n} bytes at offset ${this.offset}`);
    }
    const at = this.offset;
    this.offset += n;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.take(1));
  }

  u32(): number {
    return this.view.getUint32(this.take(4), true);
  }

  u64(): bigint {
    return this.view.getBigUint64(this.take(8), true);
  }

  i64(): bigint {
    return this.view.getBigInt64(this.take(8), true);
  }

  bool(): boolean {
    const b = this.u8();
    if (b > 1) throw new RangeError(`invalid bool byte ${b}`);
    return b === 1;
  }

  bytes32(): Bytes32 {
    const at = this.take(32);
    return this.bytes.slice(at, at + 32);
  }

  address(): Address {
    return getAddressDecoder().decode(this.bytes32());
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  /** Throws when bytes are left over, so a layout mismatch never passes silently. */
  end(): void {
    if (this.remaining !== 0)
      throw new RangeError(`${this.remaining} unexpected trailing bytes`);
  }
}

export function bytesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
