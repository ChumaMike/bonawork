import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { DemoSignIn } from "@/features/workbench/sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <ScreenBoundary>
      <DemoSignIn />
    </ScreenBoundary>
  );
}
