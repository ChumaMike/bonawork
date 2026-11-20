/**
 * Private evidence storage. Files never leave the backend: the API returns
 * only digests and metadata, and `GET /api/evidence/:id/file` streams a file
 * to callers holding `evidence:read`.
 *
 * - `BLOB_READ_WRITE_TOKEN` set → Vercel Blob with `access: "private"`.
 * - otherwise → local disk under `EVIDENCE_STORAGE_DIR` (git-ignored).
 * - `createMemoryStore()` for tests.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface EvidenceStore {
  readonly kind: "disk" | "blob" | "memory";
  /** Store exact bytes; returns the opaque storage key saved with the commitment. */
  put(bytes: Uint8Array, mediaType: string): Promise<string>;
  /** The exact bytes stored under `key`, or null when missing. */
  get(key: string): Promise<Uint8Array | null>;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const keyFor = (mediaType: string) => {
  const ext = EXTENSIONS[mediaType] ?? "bin";
  const id = randomUUID();
  return `${id.slice(0, 2)}/${id}.${ext}`;
};

export function createMemoryStore(): EvidenceStore {
  const files = new Map<string, Uint8Array>();
  return {
    kind: "memory",
    async put(bytes, mediaType) {
      const key = keyFor(mediaType);
      files.set(key, new Uint8Array(bytes));
      return key;
    },
    async get(key) {
      return files.get(key) ?? null;
    },
  };
}

export function createDiskStore(directory: string): EvidenceStore {
  const root = resolve(directory);
  const safe = (key: string) => {
    const full = resolve(root, key);
    if (!full.startsWith(root)) throw new Error(`invalid storage key ${key}`);
    return full;
  };
  return {
    kind: "disk",
    async put(bytes, mediaType) {
      const key = keyFor(mediaType);
      const full = safe(key);
      await mkdir(join(full, ".."), { recursive: true });
      await writeFile(full, bytes);
      return key;
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(safe(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

export function createBlobStore(token: string): EvidenceStore {
  return {
    kind: "blob",
    async put(bytes, mediaType) {
      const { put } = await import("@vercel/blob");
      const key = `evidence/${keyFor(mediaType)}`;
      await put(key, Buffer.from(bytes), {
        access: "private",
        token,
        contentType: mediaType,
        addRandomSuffix: false,
      });
      return key;
    },
    async get(key) {
      const { get } = await import("@vercel/blob");
      const found = await get(key, { access: "private", token, useCache: false });
      if (!found?.stream) return null;
      return new Uint8Array(await new Response(found.stream).arrayBuffer());
    },
  };
}

export function createEvidenceStore(env: {
  BLOB_READ_WRITE_TOKEN?: string;
  EVIDENCE_STORAGE_DIR: string;
  NODE_ENV: string;
}): EvidenceStore {
  if (env.BLOB_READ_WRITE_TOKEN) return createBlobStore(env.BLOB_READ_WRITE_TOKEN);
  if (env.NODE_ENV === "test") return createMemoryStore();
  return createDiskStore(env.EVIDENCE_STORAGE_DIR);
}
