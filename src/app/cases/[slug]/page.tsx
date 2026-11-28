import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { ExampleCaseScreen } from "@/features/workbench/case-screen";

export const metadata: Metadata = { title: "Example repair" };

export default function Page() {
  return (
    <ScreenBoundary>
      <ExampleCaseScreen />
    </ScreenBoundary>
  );
}
