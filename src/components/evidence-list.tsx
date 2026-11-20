"use client";

import { getApi } from "@/data/api";
import type { EvidenceItem } from "@/data/types";
import { useMessages } from "@/i18n";
import { timeAgo } from "@/lib/format";
import { LedgerChip } from "./ledger-state";
import { ProofButton } from "./proof/proof-button";
import { Icon } from "./ui/icon";

/**
 * Evidence versions for an issue. Public pages show what each item is and one
 * word about its record; the fingerprint and the ledger details open from
 * "Show proof". `showFiles` is for staff screens: the files stay private, and
 * the backend decides whether the signed-in person may open each one.
 */
export function EvidenceList({
  issueId,
  items,
  showFiles = false,
}: {
  issueId: string;
  items: EvidenceItem[];
  showFiles?: boolean;
}) {
  const m = useMessages();
  const api = getApi();
  const fileUrl = (item: EvidenceItem) =>
    showFiles ? (api.evidenceFileUrl?.(item.id) ?? null) : null;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          id={`evidence-${item.id}`}
          data-testid="evidence-item"
          className="scroll-mt-24 rounded-xl border border-line bg-surface p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name="file" className="size-5 text-muted" />
              {m.issue.evidenceVersion(item.version)}
            </p>
            <LedgerChip record={item.ledger} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {m.evidencePurpose[item.purpose]} ·{" "}
            {m.issue.addedBy(m.actor[item.addedBy], timeAgo(item.addedAt, m))}
          </p>
          <EvidenceFile
            url={fileUrl(item)}
            isImage={item.mediaType.startsWith("image/")}
            name={m.issue.evidenceVersion(item.version)}
          />
          <ProofButton
            issueId={issueId}
            recordId={item.id}
            label={m.issue.evidenceVersion(item.version)}
            ledger={item.ledger}
            digest={item.digest}
            reportId={issueId}
            className="-ml-3 mt-1"
          />
        </li>
      ))}
    </ul>
  );
}

/** A private file, fetched with the viewer's own session. Shown as a photo when it is one. */
function EvidenceFile({
  url,
  isImage,
  name,
}: {
  url: string | null;
  isImage: boolean;
  name: string;
}) {
  const m = useMessages();
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="evidence-file"
      className="mt-3 inline-flex min-h-11 flex-col items-start gap-1 font-semibold text-brand-strong"
    >
      {isImage ? (
        // The file needs the viewer's session cookie, which the image optimiser does not send.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={m.issue.fileAlt(name)}
          loading="lazy"
          className="max-h-72 w-auto max-w-full rounded-lg border border-line bg-sunken"
        />
      ) : null}
      <span className="inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4">
        <Icon name="eye" className="size-4" />
        {m.issue.openFile}
      </span>
    </a>
  );
}
