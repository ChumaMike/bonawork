/**
 * The one EXIF field the photo checks need: when the photo was taken
 * (DateTimeOriginal, else DateTime), read from a JPEG's APP1 segment. Pure and
 * small on purpose; anything it cannot read gives null. The time has no zone
 * in EXIF, so it is read as South African time (UTC+2).
 */

const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;

function ascii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length && offset + i < view.byteLength; i += 1) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/** `2026:11:20 14:05:09` to an ISO string in UTC, read as SAST. */
export function exifDateToIso(value: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const utc = Date.UTC(y, mo - 1, d, h - 2, mi, s);
  return Number.isFinite(utc) ? new Date(utc).toISOString() : null;
}

function readIfd(
  view: DataView,
  tiff: number,
  ifd: number,
  little: boolean,
): Map<number, { type: number; count: number; valueOffset: number }> {
  const tags = new Map<number, { type: number; count: number; valueOffset: number }>();
  if (ifd + 2 > view.byteLength) return tags;
  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries && i < 200; i += 1) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > view.byteLength) break;
    const tag = view.getUint16(at, little);
    const type = view.getUint16(at + 2, little);
    const count = view.getUint32(at + 4, little);
    const raw = view.getUint32(at + 8, little);
    // ASCII longer than 4 bytes lives at an offset from the TIFF header.
    const valueOffset = type === 2 && count > 4 ? tiff + raw : at + 8;
    tags.set(tag, { type, count, valueOffset: type === 4 ? raw : valueOffset });
  }
  return tags;
}

/** When the photo was taken, as ISO, or null when the file does not say. */
export function readExifTakenAt(bytes: Uint8Array): string | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00) return null;
      const size = view.getUint16(offset + 2);
      if (marker === 0xffe1 && ascii(view, offset + 4, 4) === "Exif") {
        const tiff = offset + 10;
        const little = view.getUint16(tiff) === 0x4949;
        const first = tiff + view.getUint32(tiff + 4, little);
        const ifd0 = readIfd(view, tiff, first, little);
        let found: string | null = null;
        const exifPointer = ifd0.get(TAG_EXIF_IFD);
        if (exifPointer) {
          const exif = readIfd(view, tiff, tiff + exifPointer.valueOffset, little);
          const original = exif.get(TAG_DATETIME_ORIGINAL);
          if (original) found = ascii(view, original.valueOffset, original.count);
        }
        if (!found) {
          const plain = ifd0.get(TAG_DATETIME);
          if (plain) found = ascii(view, plain.valueOffset, plain.count);
        }
        return found ? exifDateToIso(found) : null;
      }
      if (marker === 0xffda) return null; // image data starts; no EXIF before it
      offset += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}
