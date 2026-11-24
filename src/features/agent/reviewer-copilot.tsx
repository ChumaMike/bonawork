"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { AgentRequestError, postJson } from "./client";
import type {
  ChecklistDraft,
  ChecklistItem,
  ChecklistRequest,
  PhotoWarning,
  ReviewRecord,
  ReviewedItem,
} from "./contracts";
import { fingerprintFile } from "./fingerprint";
import { reviewHash, reviewHashHex } from "./review-hash";
import { ReadAloud } from "./voice";

type Result = "pass" | "fail" | "not_checked";
type Row = ChecklistItem & { result: Result; note: string };

const ORIGIN_LABEL: Record<ChecklistItem["origin"], string> = {
  template: "Standard check",
  price_flag: "Price check",
  ai: "Suggested by Bona AI",
  reviewer: "Added by you",
};

export interface FinishedReview {
  record: ReviewRecord;
  /** `0x` + 64 hex: what the reviewer signs as `review_hash`. */
  reviewHashHex: string;
  /** The same 32 bytes, ready for the verify instruction. */
  reviewHash: Uint8Array;
}

/**
 * Reviewer Copilot: the checklist for one payment stage. Code writes the
 * standard checks and price questions; Bona AI may suggest a few more, each
 * tied to an invoice line. The reviewer ticks, adds notes and adds checks.
 * "Finish review" gives the canonical record and its hash through `onFinish`.
 * The reviewer still signs on-chain themselves; this component signs nothing.
 */
export function ReviewerCopilot({
  caseRef,
  caseOpenedAt,
  request,
  onFinish,
}: {
  caseRef: string;
  /** ISO time the case was opened; photos taken earlier get a warning. */
  caseOpenedAt: string;
  request: ChecklistRequest;
  onFinish?: (review: FinishedReview) => void;
}) {
  const id = useId();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<ChecklistDraft["extraSource"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCheck, setNewCheck] = useState("");
  const [warnings, setWarnings] = useState<PhotoWarning[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [finished, setFinished] = useState<FinishedReview | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const draft = await postJson<ChecklistDraft>("/api/agent/checklist", request);
      setRows(draft.items.map((item) => ({ ...item, result: "not_checked", note: "" })));
      setSource(draft.extraSource);
    } catch (e) {
      setError(e instanceof AgentRequestError ? e.message : "Could not load the checklist.");
    } finally {
      setBusy(false);
    }
  }

  function update(itemId: string, patch: Partial<Row>) {
    setFinished(null);
    setRows((all) => all?.map((r) => (r.id === itemId ? { ...r, ...patch } : r)) ?? null);
  }

  function addCheck() {
    const text = newCheck.trim();
    if (text.length < 3 || !rows) return;
    const n = rows.filter((r) => r.origin === "reviewer").length + 1;
    setRows([
      ...rows,
      { id: `r-${n}`, text: text.slice(0, 240), lineId: null, origin: "reviewer", result: "not_checked", note: "" },
    ]);
    setNewCheck("");
    setFinished(null);
  }

  async function checkPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    try {
      const photos = await Promise.all([...files].slice(0, 20).map(fingerprintFile));
      const data = await postJson<{ warnings: PhotoWarning[] }>("/api/agent/photos", {
        caseRef,
        caseOpenedAt,
        photos,
      });
      setWarnings(data.warnings);
      setFinished(null);
    } catch (e) {
      setError(e instanceof AgentRequestError ? e.message : "Could not check the photos.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function finish() {
    if (!rows) return;
    const items: ReviewedItem[] = rows.map((r) => ({
      id: r.id,
      text: r.text,
      lineId: r.lineId,
      origin: r.origin,
      result: r.result,
      note: r.note,
    }));
    const record: ReviewRecord = {
      version: 1,
      caseRef,
      stage: request.stage,
      milestone: request.milestone,
      items,
      photoWarnings: warnings.map((w) => w.text),
      reviewedAt: new Date().toISOString(),
    };
    const review = {
      record,
      reviewHashHex: await reviewHashHex(record),
      reviewHash: await reviewHash(record),
    };
    setFinished(review);
    onFinish?.(review);
  }

  const open = rows?.filter((r) => r.result === "not_checked").length ?? 0;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Reviewer checklist</h2>
        <p className="text-sm text-muted">
          You decide each check. Suggestions are things to look at, not answers.
        </p>
      </div>

      {!rows ? (
        <div>
          <Button onClick={load} loading={busy}>
            Load checklist
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {rows ? (
        <>
          {source === "rules" ? (
            <Badge tone="neutral" className="self-start">
              Bona AI is not set up here. Standard checks only.
            </Badge>
          ) : null}
          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li key={row.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p>
                    <span className="text-muted">{index + 1}. </span>
                    {row.text}
                  </p>
                  <ReadAloud text={row.text} label="Hear" />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {ORIGIN_LABEL[row.origin]}
                  {row.lineId ? ` · line ${row.lineId}` : ""}
                </p>
                <fieldset className="mt-2 flex flex-wrap gap-4">
                  <legend className="sr-only">Result for check {index + 1}</legend>
                  {(["pass", "fail", "not_checked"] as const).map((value) => (
                    <label key={value} className="inline-flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        name={`${id}-${row.id}`}
                        checked={row.result === value}
                        onChange={() => update(row.id, { result: value })}
                        className="size-5"
                      />
                      {value === "pass" ? "Looks right" : value === "fail" ? "Problem" : "Not checked"}
                    </label>
                  ))}
                </fieldset>
                <label htmlFor={`${id}-${row.id}-note`} className="sr-only">
                  Note for check {index + 1}
                </label>
                <Input
                  id={`${id}-${row.id}-note`}
                  placeholder="Note (optional)"
                  maxLength={500}
                  value={row.note}
                  onChange={(e) => update(row.id, { note: e.target.value })}
                  className="mt-2"
                />
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`${id}-new`} className="sr-only">
              Add your own check
            </label>
            <Input
              id={`${id}-new`}
              placeholder="Add your own check"
              value={newCheck}
              maxLength={240}
              onChange={(e) => setNewCheck(e.target.value)}
            />
            <Button variant="secondary" onClick={addCheck} disabled={newCheck.trim().length < 3}>
              Add
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-photos`} className="font-medium">
              Check photos
            </label>
            <p className="text-sm text-muted">
              We compare the files with photos on other cases and read the date in each file. The
              photos stay on this device.
            </p>
            <input
              id={`${id}-photos`}
              type="file"
              accept="image/*"
              multiple
              disabled={photoBusy}
              onChange={(e) => void checkPhotos(e.target.files)}
              className="text-sm"
            />
            {warnings.length > 0 ? (
              <Alert tone="warning" title="Look at these photos">
                <ul className="list-disc pl-5">
                  {warnings.map((w) => (
                    <li key={`${w.photo}-${w.kind}`}>{w.text}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={finish} className="self-start">
              Finish review
            </Button>
            {open > 0 ? (
              <p className="text-sm text-muted">{open} checks are marked not checked.</p>
            ) : null}
            {finished ? (
              <div className="rounded-xl bg-sunken p-3 text-sm" role="status">
                <p>Review recorded on this page. Sign it in your wallet to put it on-chain.</p>
                <p className="mt-1 break-all font-mono text-xs">review_hash {finished.reviewHashHex}</p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
