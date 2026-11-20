import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { IssueScreen } from "@/features/issues/issue-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().nav.issues };

export default function Page() {
  return (
    <ScreenBoundary>
      <IssueScreen />
    </ScreenBoundary>
  );
}
