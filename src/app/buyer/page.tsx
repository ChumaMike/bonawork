import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { BuyerScreen } from "@/features/procurement/screens";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().nav.workspace.buyer };

export default function Page() {
  return (
    <ScreenBoundary>
      <BuyerScreen />
    </ScreenBoundary>
  );
}
