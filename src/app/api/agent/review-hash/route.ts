import { ReviewRecordSchema } from "@/features/agent/contracts";
import { canonicalReview, reviewHashHex } from "@/server/agent/reviewer-copilot";
import { ok, parseJson, route } from "@/server/http";

/**
 * `POST /api/agent/review-hash` — the canonical JSON of a finished review and
 * its SHA-256, the `review_hash` the reviewer signs on-chain. Computes only.
 */
export const POST = route(async (request) => {
  const record = await parseJson(request, ReviewRecordSchema);
  return ok({ canonical: canonicalReview(record), reviewHash: await reviewHashHex(record) });
});
