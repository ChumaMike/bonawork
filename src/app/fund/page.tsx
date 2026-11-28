import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { FunderBench } from "@/features/workbench/benches";

export const metadata: Metadata = { title: "Repairs to fund" };

export default function Page() {
  return (
    <ScreenBoundary>
      <FunderBench />
    </ScreenBoundary>
  );
}
