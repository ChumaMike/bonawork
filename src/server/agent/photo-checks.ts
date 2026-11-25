/**
 * Photo checks for the reviewer, in plain code (no AI):
 *
 * - the same file (SHA-256) was already used as evidence on another case;
 * - a very similar picture (dHash within a few bits) was used on another case;
 * - the photo's EXIF date is before the case was opened;
 * - the photo carries no date at all (a note, not an accusation).
 *
 * These are warnings for a person to look at. They block nothing. The
 * registry here is in memory per server process, which is enough for the
 * demo; the coordinator can back `PhotoRegistry` with the database.
 */
import {
  PhotoCheckRequestSchema,
  type PhotoCheckRequest,
  type PhotoWarning,
} from "@/features/agent/contracts";
import { hammingHex } from "@/features/agent/fingerprint";

/** Bits of 64 that may differ for two pictures to count as "very similar". */
export const SIMILAR_BITS = 6;

export interface PhotoSeen {
  caseRef: string;
  sha256: string;
  dhash: string | null;
}

export interface PhotoRegistry {
  all(): Promise<PhotoSeen[]>;
  add(entries: PhotoSeen[]): Promise<void>;
}

export function memoryPhotoRegistry(): PhotoRegistry {
  const seen: PhotoSeen[] = [];
  return {
    async all() {
      return [...seen];
    },
    async add(entries) {
      for (const e of entries) {
        if (!seen.some((s) => s.caseRef === e.caseRef && s.sha256 === e.sha256)) seen.push(e);
      }
    },
  };
}

let processRegistry: PhotoRegistry | null = null;
export function defaultPhotoRegistry(): PhotoRegistry {
  processRegistry ??= memoryPhotoRegistry();
  return processRegistry;
}

/** Warnings for a set of photos, then remember them under this case. */
export async function checkPhotos(
  registry: PhotoRegistry,
  input: PhotoCheckRequest,
): Promise<PhotoWarning[]> {
  const req = PhotoCheckRequestSchema.parse(input);
  const opened = Date.parse(req.caseOpenedAt);
  const earlier = (await registry.all()).filter((s) => s.caseRef !== req.caseRef);
  const warnings: PhotoWarning[] = [];

  for (const photo of req.photos) {
    const same = earlier.find((s) => s.sha256 === photo.sha256);
    if (same) {
      warnings.push({
        photo: photo.name,
        kind: "same_file_other_case",
        text: `Photo also used in case ${same.caseRef} (${photo.name}).`,
      });
    } else if (photo.dhash) {
      const similar = earlier.find(
        (s) => s.dhash !== null && hammingHex(s.dhash, photo.dhash!) <= SIMILAR_BITS,
      );
      if (similar) {
        warnings.push({
          photo: photo.name,
          kind: "similar_photo_other_case",
          text: `Photo looks like one used in case ${similar.caseRef} (${photo.name}). Compare them.`,
        });
      }
    }

    if (photo.takenAt === null) {
      warnings.push({
        photo: photo.name,
        kind: "no_date",
        text: `No date in ${photo.name}. Ask when it was taken.`,
      });
    } else if (Number.isFinite(opened) && Date.parse(photo.takenAt) < opened) {
      warnings.push({
        photo: photo.name,
        kind: "taken_before_case",
        text: `${photo.name} is dated ${photo.takenAt.slice(0, 10)}, before this case was opened. Ask about it.`,
      });
    }
  }

  await registry.add(
    req.photos.map((p) => ({ caseRef: req.caseRef, sha256: p.sha256, dhash: p.dhash })),
  );
  return warnings;
}
