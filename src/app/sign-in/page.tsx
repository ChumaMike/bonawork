import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { SignInScreen } from "@/features/auth/sign-in-screen";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().auth.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <SignInScreen />
    </ScreenBoundary>
  );
}
