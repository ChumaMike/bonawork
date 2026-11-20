"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { EvidenceList } from "@/components/evidence-list";
import { FilePicker } from "@/components/file-picker";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Container,
  LoadError,
  Loading,
  NotFound,
  Notice,
  PageHeader,
} from "@/components/ui/page";
import { getApi } from "@/data/api";
import type { EvidenceItem, EvidenceUpload } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";

export function AddEvidenceScreen() {
  const m = useMessages();
  const { issueId } = useParams<{ issueId: string }>();
  const query = useQuery(`issue:${issueId}`, () => getApi().getIssue(issueId));
  const [uploads, setUploads] = useState<EvidenceUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<EvidenceItem[] | null>(null);

  if (query.error) {
    return (
      <Container size="narrow">
        <LoadError onRetry={query.reload} />
      </Container>
    );
  }
  if (query.data === undefined) {
    return (
      <Container size="narrow">
        <Loading />
      </Container>
    );
  }
  if (query.data === null) return <NotFound />;

  const issue = query.data;
  const issueHref = `/issues/${issue.id}`;

  async function submit() {
    if (uploads.length === 0) return setError(m.addEvidence.needFile);
    setBusy(true);
    setError(null);
    try {
      setAdded(await getApi().addEvidence(issue.id, uploads, "problem"));
    } catch {
      setError(m.common.actionError);
    } finally {
      setBusy(false);
    }
  }

  if (added) {
    return (
      <Container size="narrow">
        <PageHeader title={m.addEvidence.doneTitle} intro={m.addEvidence.doneBody} />
        <EvidenceList issueId={issueId} items={added} />
        <ButtonLink href={issueHref} className="mt-6 w-full sm:w-auto">
          {m.addEvidence.backToIssue}
        </ButtonLink>
      </Container>
    );
  }

  return (
    <Container size="narrow">
      <PageHeader
        title={m.addEvidence.title}
        intro={m.addEvidence.intro(issue.title)}
        back={{ href: issueHref, label: m.common.back }}
      />
      <FilePicker value={uploads} onChange={setUploads} />
      {error ? (
        <Notice tone="danger" icon="alert" className="mt-4">
          <p role="alert">{error}</p>
        </Notice>
      ) : null}
      <Button onClick={submit} disabled={busy} className="mt-6 w-full sm:w-auto">
        {busy ? m.common.loading : m.addEvidence.submit}
      </Button>
    </Container>
  );
}
