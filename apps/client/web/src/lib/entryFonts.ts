// The entry design's faces (as the vendor app's lib/vendorFonts.ts),
// self-hosted by next/font at build time, exposed as the CSS variables
// app/entry.css reads.
import { DM_Sans, Manrope } from "next/font/google";

export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
