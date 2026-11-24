import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { EscrowReviewScreen } from "@/features/escrow/review-screen";

export const metadata: Metadata = { title: "Verify a stage" };

export default function Page() {
  return (
    <ScreenBoundary>
      <EscrowReviewScreen />
    </ScreenBoundary>
  );
}
