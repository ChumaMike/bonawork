/**
 * Photo fingerprints, made in the browser so the photo itself need not be
 * sent for the checks: SHA-256 of the bytes (the same file), a 64-bit
 * difference hash (a resized or re-saved copy of the same picture) and the
 * EXIF date. The pure parts are tested; `fingerprintFile` needs a browser.
 */
import type { PhotoFingerprint } from "./contracts";
import { readExifTakenAt } from "./exif";

/** dHash of a 9x8 grey thumbnail (72 values, row by row): 64 bits as 16 hex digits. */
export function dhashFromGrey(grey: ArrayLike<number>): string {
  if (grey.length !== 72) throw new RangeError("dhash needs 9x8 grey values");
  let hex = "";
  for (let row = 0; row < 8; row += 1) {
    let byte = 0;
    for (let col = 0; col < 8; col += 1) {
      const left = grey[row * 9 + col];
      const right = grey[row * 9 + col + 1];
      byte = (byte << 1) | (left > right ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** How many of the 64 bits differ between two dHashes. */
export function hammingHex(a: string, b: string): number {
  let distance = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = Number.parseInt(a.slice(i, i + 2), 16) ^ Number.parseInt(b.slice(i, i + 2), 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function dhashOfFile(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, 9, 8);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, 9, 8);
    const grey: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      grey.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    return dhashFromGrey(grey);
  } catch {
    return null;
  }
}

/** A photo's fingerprint. Browser only. */
export async function fingerprintFile(file: File): Promise<PhotoFingerprint> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    name: file.name.slice(0, 200),
    sha256: await sha256(bytes),
    dhash: await dhashOfFile(file),
    takenAt: readExifTakenAt(bytes),
  };
}
