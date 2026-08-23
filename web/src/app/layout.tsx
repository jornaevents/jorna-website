import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PushRuntime } from "@/components/PushRuntime";

export const metadata: Metadata = {
  title: "Jorna — Plan your celebration",
  description:
    "Plan your whole South Asian celebration in one place — a matched team of vendors, booked and paid for safely through escrow.",
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
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          {/* Foreground web-push listener; no-op unless signed in + permitted. */}
          <PushRuntime />
        </AuthProvider>
      </body>
    </html>
  );
}
