import type { Metadata } from "next";
import { ScreenBoundary } from "@/components/ui/screen-boundary";
import { ReportBench } from "@/features/workbench/report";
import { getMessages } from "@/i18n";

export const metadata: Metadata = { title: getMessages().report.title };

export default function Page() {
  return (
    <ScreenBoundary>
      <ReportBench />
    </ScreenBoundary>
  );
}
