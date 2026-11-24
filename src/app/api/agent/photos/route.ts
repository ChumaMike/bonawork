import { PhotoCheckRequestSchema } from "@/features/agent/contracts";
import { checkPhotos, defaultPhotoRegistry } from "@/server/agent/photo-checks";
import { ok, parseJson, route } from "@/server/http";

/**
 * `POST /api/agent/photos` — photo checks for the reviewer. Takes fingerprints
 * made in the browser (SHA-256, dHash, EXIF date), never the photos. Returns
 * warnings to look at; it blocks nothing.
 */
export const POST = route(async (request) => {
  const body = await parseJson(request, PhotoCheckRequestSchema);
  return ok({ warnings: await checkPhotos(defaultPhotoRegistry(), body) });
});
