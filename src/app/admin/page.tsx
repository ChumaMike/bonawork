import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { AdminScreen } from "@/features/staff/admin-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().admin.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <AdminScreen />
    </ScreenBoundary>
  );
}
