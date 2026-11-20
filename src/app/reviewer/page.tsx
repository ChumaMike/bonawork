import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { ReviewerScreen } from "@/features/staff/reviewer-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().reviewer.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <ReviewerScreen />
    </ScreenBoundary>
  );
}
