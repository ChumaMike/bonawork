import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Geist_Mono,
  Hanken_Grotesk,
  Inter_Tight,
} from "next/font/google";
import { Suspense } from "react";
import { BonaBuddy } from "@/components/buddy/bona-buddy";
import { BottomNav, PreviewBanner, SiteFooter, SiteHeader } from "@/components/chrome";
import { ToastRegion } from "@/components/ui/toast";
import { DEFAULT_LOCALE, getMessages } from "@/i18n";
import "./globals.css";

/*
 * Body: Hanken Grotesk — plain, round and open, with the latin-ext range for
 * isiZulu, Sesotho and Afrikaans, and easy to read at 16–17 px in sunlight.
 * Display: Bricolage Grotesque — a grotesque with some character and an
 * optical-size axis, so headings feel made by hand rather than generated.
 * Both swap in after the system face, so text is never invisible on slow data.
 */
const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  axes: ["opsz"],
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

/*
 * The landing page's grotesk. Only `/` uses it (see vellure.css), so it is not
 * preloaded: other pages never download it.
 */
const landing = Inter_Tight({
  variable: "--font-landing",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
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
    { media: "(prefers-color-scheme: light)", color: "#2f231a" },
    { media: "(prefers-color-scheme: dark)", color: "#17120e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${body.variable} ${display.variable} ${mono.variable} ${landing.variable} h-full antialiased`}
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
        <Suspense fallback={<div className="h-16 border-b border-line bg-surface" />}>
          <SiteHeader />
        </Suspense>
        <main id="main" className="flex-1">
          {children}
        </main>
        {/* The footer reads the current path too (the landing page has its own). */}
        <Suspense fallback={null}>
          <SiteFooter />
        </Suspense>
        <Suspense fallback={null}>
          <BottomNav />
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
