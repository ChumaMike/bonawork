import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { CommunityOnly } from "@/features/auth/community-only";
import { ReportScreen } from "@/features/report/report-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().report.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <CommunityOnly>
        <ReportScreen />
      </CommunityOnly>
    </ScreenBoundary>
  );
}
