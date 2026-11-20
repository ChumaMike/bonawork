import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { VerifyScreen } from "@/features/verify/verify-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().verify.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <VerifyScreen />
    </ScreenBoundary>
  );
}
