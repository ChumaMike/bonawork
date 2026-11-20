import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { FeedScreen } from "@/features/issues/feed-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().feed.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <FeedScreen />
    </ScreenBoundary>
  );
}
