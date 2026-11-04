// The landing pages' two faces (Figma "Jorna — Welcome / For clients / For
// vendors", 2026-10), from committed font files like lib/fonts — see there
// for why they're local. Exposed as CSS variables that landing.css reads
// inside .landing only.
import localFont from "next/font/local";

export const cormorant = localFont({
  src: [
    { path: "../fonts/CormorantGaramond-latin.woff2", weight: "400 600", style: "normal" },
    { path: "../fonts/CormorantGaramond-italic-latin.woff2", weight: "400 600", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

export const inter = localFont({
  src: "../fonts/Inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});
