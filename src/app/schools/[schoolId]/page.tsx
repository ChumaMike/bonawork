import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { SchoolScreen } from "@/features/schools/school-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().nav.schools };

export default function Page() {
  return (
    <ScreenBoundary>
      <SchoolScreen />
    </ScreenBoundary>
  );
}
