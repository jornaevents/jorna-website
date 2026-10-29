// The landing pages' two faces (Figma "Jorna — Welcome / For clients / For
// vendors", 2026-10), self-hosted by next/font like vendorFonts.ts. Exposed as
// CSS variables that landing.css reads inside .landing only.
import { Cormorant_Garamond, Inter } from "next/font/google";

export const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
