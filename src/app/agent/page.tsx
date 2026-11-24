import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { AgentDemo } from "@/features/agent/agent-demo";

export const metadata: Metadata = { title: "Bona Agent demo" };

export default function Page() {
  return (
    <ScreenBoundary>
      <AgentDemo />
    </ScreenBoundary>
  );
}
