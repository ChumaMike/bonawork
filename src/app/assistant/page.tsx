import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { AssistantScreen } from "@/features/assistant/assistant-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().assistant.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <AssistantScreen />
    </ScreenBoundary>
  );
}
