import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { PaymentsScreen } from "@/features/procurement/screens";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().nav.workspace.payment_approver };

export default function Page() {
  return (
    <ScreenBoundary>
      <PaymentsScreen />
    </ScreenBoundary>
  );
}
