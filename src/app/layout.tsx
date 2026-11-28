import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Inter_Tight } from "next/font/google";
import { Suspense } from "react";
import { BonaBuddy } from "@/components/buddy/bona-buddy";
import { PreviewBanner, SiteFooter, SiteHeader } from "@/components/chrome";
import { ToastRegion } from "@/components/ui/toast";
import { GuideStrip } from "@/features/demo/guide-strip";
import { DEFAULT_LOCALE, getMessages } from "@/i18n";
import "./globals.css";

/*
 * Reading and headings: Inter Tight, the landing page's grotesk, with the
 * latin-ext range for isiZulu, Sesotho and Afrikaans. It swaps in after the
 * system face, so text is never invisible on slow data.
 * Wordmark: Bricolage Grotesque, for the logo only (`font-brand`).
 */
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

const wordmark = Bricolage_Grotesque({
  variable: "--font-wordmark",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
  preload: false,
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

/* The landing page names the same face through its own variable (vellure.css). */
const landing = Inter_Tight({
  variable: "--font-landing",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const m = getMessages();

export const metadata: Metadata = {
  title: {
    default: `${m.brand.name} — ${m.brand.tagline}`,
    template: `%s · ${m.brand.name}`,
  },
  description: m.brand.description,
  applicationName: m.brand.name,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${body.variable} ${display.variable} ${wordmark.variable} ${mono.variable} ${landing.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:text-ink focus:shadow-raised"
        >
          {m.nav.skipToContent}
        </a>
        <PreviewBanner />
        {/* The navigation reads the current path, so it streams in its own boundary. */}
        <Suspense fallback={<div className="min-h-[60px] bg-ink" />}>
          <SiteHeader />
        </Suspense>
        {/* The guided demo's strip, only while this browser runs the demo. */}
        <Suspense fallback={null}>
          <GuideStrip />
        </Suspense>
        <main id="main" className="flex-1">
          {children}
        </main>
        {/* The footer reads who is signed in, so it streams in its own boundary too. */}
        <Suspense fallback={null}>
          <SiteFooter />
        </Suspense>
        {/* Bona buddy: floating help on every page. It reads the path, so it has its own boundary. */}
        <Suspense fallback={null}>
          <BonaBuddy />
        </Suspense>
        <ToastRegion />
      </body>
    </html>
  );
}
