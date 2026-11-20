import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { ReceivingScreen } from "@/features/procurement/screens";
import { getMessages } from "@/i18n";

export const metadata: Metadata = {
  title: getMessages().nav.workspace.receiving_officer,
};

export default function Page() {
  return (
    <ScreenBoundary>
      <ReceivingScreen />
    </ScreenBoundary>
  );
}
