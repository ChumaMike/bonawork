import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { DemoScreen } from "@/features/demo/demo-screen";

export const metadata: Metadata = { title: "Try the demo" };

export default function Page() {
  return (
    <ScreenBoundary>
      <DemoScreen />
    </ScreenBoundary>
  );
}
