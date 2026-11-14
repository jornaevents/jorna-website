import type { Metadata, Viewport } from "next";
import "@jorna/shared/styles/globals.css";
import { AuthProvider } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { ChromeGate } from "@/components/ChromeGate";
import { SiteFooter } from "@jorna/shared/components/SiteFooter";
import { PushRuntime } from "@/components/PushRuntime";
import { SentryRuntime } from "@jorna/shared/components/SentryRuntime";
import { VendorAccountGate } from "@/components/VendorAccountGate";
import { DARK_MODE_ENABLED } from "@jorna/shared/lib/flags";

export const metadata: Metadata = {
  title: "Jorna — Plan your celebration",
  description:
    "Plan your whole South Asian celebration in one place — a matched team of vendors, booked on a signed contract and paid directly.",
};

// viewportFit: "cover" is required for env(safe-area-inset-*) to resolve to
// anything but 0 on iOS — MobileNavMenu.tsx's bottom safe-area padding is a
// no-op without this.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-dark-mode: dark mode is behind a build flag (lib/flags.ts); without
    // the mark, globals.css stays light whatever the device's setting.
    <html lang="en" className="h-full antialiased" data-dark-mode={DARK_MODE_ENABLED ? "" : undefined}>
      <body className="flex min-h-full flex-col">
        <SentryRuntime />
        <AuthProvider>
          <ChromeGate>
            <SiteHeader />
          </ChromeGate>
          <main className="flex-1">
            <VendorAccountGate>{children}</VendorAccountGate>
          </main>
          <ChromeGate>
            <SiteFooter />
          </ChromeGate>
          {/* Foreground web-push listener; no-op unless signed in + permitted. */}
          <PushRuntime />
        </AuthProvider>
      </body>
    </html>
  );
}
