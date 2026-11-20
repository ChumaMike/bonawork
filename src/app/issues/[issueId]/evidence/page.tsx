import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { CommunityOnly } from "@/features/auth/community-only";
import { AddEvidenceScreen } from "@/features/issues/add-evidence-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().addEvidence.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <CommunityOnly>
        <AddEvidenceScreen />
      </CommunityOnly>
    </ScreenBoundary>
  );
}
