import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { ContractorBench } from "@/features/workbench/benches";

export const metadata: Metadata = { title: "My jobs" };

export default function Page() {
  return (
    <ScreenBoundary>
      <ContractorBench />
    </ScreenBoundary>
  );
}
