import { loadVerifierConfig } from "../../../lib/config";
import { parseJsonText, verifyWithConfig } from "../../../lib/service";
import type { Source } from "../../../lib/verify";

/**
 * POST /api/verify
 *
 * multipart/form-data: `receipt` (JSON text) + one of `file` (evidence bytes),
 *   `document` (commitment-document JSON text, salt included) or `digest`
 *   (0x-hex computed elsewhere); optional `reportId` (UUID). For a
 *   ReportAcknowledged receipt send only `receipt` and `reportId`.
 * application/json: `{ receipt, document?, digest?, reportId? }` where
 *   `receipt` / `document` may be objects or JSON strings. With a `digest`
 *   for a finance receipt, `workOrderId` (UUID) and, for MatchRecorded,
 *   `matchPassed` (boolean: the document's outcome is "pass") may be sent so
 *   the ledger's own values are compared with them.
 *
 * With a receipt and nothing else, the record's presence is checked: the
 * result is RECORDED and carries the fingerprint the ledger holds, which was
 * not compared with anything.
 *
 * Files and documents are hashed in memory and discarded; nothing is stored or
 * logged. The response contains only fingerprints, the tx hash, block,
 * timestamp and the verification steps — never the content.
 */
export async function POST(request: Request): Promise<Response> {
  let config;
  try {
    config = loadVerifierConfig();
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Verifier misconfigured" },
      { status: 500 },
    );
  }

  const parsed = await readRequest(request);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const result = await verifyWithConfig(parsed.input, config);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

/** GET /api/verify describes the configuration, so callers can see what is trusted. */
export async function GET(): Promise<Response> {
  try {
    const config = loadVerifierConfig();
    return Response.json(
      {
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
        expectedContractAddress: config.expectedContractAddress ?? null,
        expectedFactoryAddress: config.expectedFactoryAddress ?? null,
        note: "This tool talks only to the Avalanche network. Bona Chain's servers are not involved.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Verifier misconfigured" },
      { status: 500 },
    );
  }
}

type Parsed =
  | {
      ok: true;
      input: {
        receipt: unknown;
        source: Source;
        reportId?: string;
        workOrderId?: string;
        matchPassed?: boolean;
      };
    }
  | { ok: false; error: string };

async function readRequest(request: Request): Promise<Parsed> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, error: "Malformed multipart body." };
    }
    const receiptText = form.get("receipt");
    if (typeof receiptText !== "string") {
      return { ok: false, error: "`receipt` (JSON text) is required." };
    }
    const receipt = parseJsonText(receiptText);
    if (!receipt.ok) return { ok: false, error: `receipt is not JSON: ${receipt.error}` };

    const reportId = optionalString(form.get("reportId"));
    const file = form.get("file");
    const documentText = form.get("document");
    const digest = form.get("digest");

    let source: Source = { kind: "none" };
    if (file instanceof File) {
      source = { kind: "bytes", bytes: new Uint8Array(await file.arrayBuffer()) };
    } else if (typeof documentText === "string" && documentText.trim()) {
      const document = parseJsonText(documentText);
      if (!document.ok)
        return { ok: false, error: `document is not JSON: ${document.error}` };
      source = { kind: "document", document: document.value };
    } else if (typeof digest === "string" && digest.trim()) {
      source = { kind: "digest", digest };
    }
    return { ok: true, input: { receipt: receipt.value, source, reportId } };
  }

  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { ok: false, error: "Body is not valid JSON." };
    }
    if (typeof body !== "object" || body === null) {
      return { ok: false, error: "Body must be a JSON object." };
    }
    const b = body as Record<string, unknown>;
    const receipt = coerceJson(b.receipt);
    if (!receipt.ok) return { ok: false, error: `receipt: ${receipt.error}` };
    const reportId = optionalString(b.reportId);

    let source: Source = { kind: "none" };
    if (b.document !== undefined && b.document !== null && b.document !== "") {
      const document = coerceJson(b.document);
      if (!document.ok) return { ok: false, error: `document: ${document.error}` };
      source = { kind: "document", document: document.value };
    } else if (typeof b.digest === "string" && b.digest.trim()) {
      source = { kind: "digest", digest: b.digest };
    }
    return {
      ok: true,
      input: {
        receipt: receipt.value,
        source,
        reportId,
        workOrderId: optionalString(b.workOrderId),
        matchPassed: typeof b.matchPassed === "boolean" ? b.matchPassed : undefined,
      },
    };
  }

  return { ok: false, error: "Send multipart/form-data or application/json." };
}

function coerceJson(
  value: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: false, error: "missing" };
  if (typeof value === "string") return parseJsonText(value);
  return { ok: true, value };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
