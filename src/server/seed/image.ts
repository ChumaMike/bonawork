/**
 * Synthetic evidence images for the seed: a small solid-colour PNG whose
 * colour and embedded label come from the file name, so every seeded file
 * has unique bytes and a true SHA-256 digest. No photographs, no people.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Buffer.from(type, "ascii"), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/** A 64×64 PNG, labelled with `label` in a tEXt chunk. */
export function syntheticPng(label: string, size = 64): Uint8Array<ArrayBuffer> {
  const h = hash(label);
  const [r, g, b] = [(h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff];
  const raw = new Uint8Array(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const shade = ((x + y) >> 3) % 2 === 0 ? 1 : 0.85;
      raw[row + 1 + x * 3] = r * shade;
      raw[row + 2 + x * 3] = g * shade;
      raw[row + 3 + x * 3] = b * shade;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const text = Buffer.concat([
    Buffer.from("Comment", "ascii"),
    Buffer.from([0]),
    Buffer.from(label),
  ]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", new Uint8Array(text)),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ]);
  // Copy into a plain ArrayBuffer so the result is accepted as a `File` part.
  return new Uint8Array(png).slice();
}
