import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { SupplierScreen } from "@/features/procurement/screens";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().nav.workspace.supplier };

export default function Page() {
  return (
    <ScreenBoundary>
      <SupplierScreen />
    </ScreenBoundary>
  );
}
