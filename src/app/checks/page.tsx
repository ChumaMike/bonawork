import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { ReviewerBench } from "@/features/workbench/benches";

export const metadata: Metadata = { title: "My checks" };

export default function Page() {
  return (
    <ScreenBoundary>
      <ReviewerBench />
    </ScreenBoundary>
  );
}
