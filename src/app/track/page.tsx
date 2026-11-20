import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { CommunityOnly } from "@/features/auth/community-only";
import { TrackScreen } from "@/features/track/track-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().track.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <CommunityOnly>
        <TrackScreen />
      </CommunityOnly>
    </ScreenBoundary>
  );
}
