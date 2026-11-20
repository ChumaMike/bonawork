import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { SchoolsScreen } from "@/features/schools/schools-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().schools.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <SchoolsScreen />
    </ScreenBoundary>
  );
}
