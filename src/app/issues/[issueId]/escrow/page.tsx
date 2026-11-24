import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { EscrowScreen } from "@/features/escrow/escrow-screen";

export const metadata: Metadata = { title: "Escrow" };

export default function Page() {
  return (
    <ScreenBoundary>
      <EscrowScreen />
    </ScreenBoundary>
  );
}
