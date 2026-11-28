import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { SchoolBench } from "@/features/workbench/benches";

export const metadata: Metadata = { title: "Our school" };

export default function Page() {
  return (
    <ScreenBoundary>
      <SchoolBench />
    </ScreenBoundary>
  );
}
