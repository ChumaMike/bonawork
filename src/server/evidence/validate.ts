import { sha256Hex, type Hex32 } from "@/shared";
import { HttpError } from "../http";

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export interface CheckedUpload {
  bytes: Uint8Array;
  mediaType: AllowedMediaType;
  sizeBytes: number;
  digest: Hex32;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * The media type the bytes actually are, from their magic numbers. The
 * client-supplied type is never trusted: a renamed file is rejected here.
 */
export function sniffMediaType(bytes: Uint8Array): AllowedMediaType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 4) === "%PDF") return "application/pdf";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand))
      return "image/heic";
  }
  return null;
}

/** Size and type checks plus the SHA-256 digest of the exact bytes. */
export async function checkUpload(file: File): Promise<CheckedUpload> {
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new HttpError(
      "invalid_input",
      `${file.name || "A file"} is larger than 10 MB.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) {
    throw new HttpError("invalid_input", `${file.name || "A file"} is empty.`);
  }
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) {
    throw new HttpError(
      "invalid_input",
      `${file.name || "A file"} is not a JPEG, PNG, WebP, HEIC image or a PDF.`,
    );
  }
  return { bytes, mediaType, sizeBytes: bytes.length, digest: await sha256Hex(bytes) };
}

export async function checkUploads(
  files: File[],
  min = 0,
  max = 10,
): Promise<CheckedUpload[]> {
  if (files.length < min) {
    throw new HttpError("invalid_input", `At least ${min} evidence file is required.`);
  }
  if (files.length > max) {
    throw new HttpError("invalid_input", `At most ${max} files can be attached at once.`);
  }
  const checked: CheckedUpload[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const upload = await checkUpload(file);
    if (seen.has(upload.digest)) {
      throw new HttpError("conflict", "The same file was attached twice.");
    }
    seen.add(upload.digest);
    checked.push(upload);
  }
  return checked;
}
