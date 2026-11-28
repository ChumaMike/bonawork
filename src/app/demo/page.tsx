import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { DemoCaseScreen } from "@/features/workbench/case-screen";

export const metadata: Metadata = { title: "Follow a real repair" };

export default function Page() {
  return (
    <ScreenBoundary>
      <DemoCaseScreen />
    </ScreenBoundary>
  );
}
