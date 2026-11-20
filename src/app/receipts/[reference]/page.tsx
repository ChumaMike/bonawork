import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { ReceiptScreen } from "@/features/report/receipt-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().receipt.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <ReceiptScreen />
    </ScreenBoundary>
  );
}
