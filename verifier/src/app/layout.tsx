import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";

/* The same face as the BonaWork app, so the verifier reads as one product. */
const body = Inter_Tight({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
const display = Inter_Tight({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BonaWork Verify",
  description:
    "Independently check that a BonaWork receipt matches the evidence you hold, by reading the Avalanche network directly.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
