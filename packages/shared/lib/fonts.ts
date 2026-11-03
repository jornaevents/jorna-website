// The entry pages' and vendor dashboard's two faces, from font files
// committed in packages/shared/fonts (latin subset, variable weight,
// downloaded once from Google Fonts — SIL Open Font License). Exposed as CSS
// variables that entry.css and vendor-shell.css read. The landing pages' faces
// are lib/landingFonts — a separate module because every face a module
// declares is preloaded on every page that imports it.
//
// Not next/font/google: that downloads the fonts during every build and dev
// server start, and when Google is slow the build fails outright ("Can't
// resolve '@vercel/turbopack-next/internal/font/google/font'"). It took down
// the vendor E2E run on #237 and the staging deploy on #234 (2026-10-31).
// Local files make the build need nothing from the network.
import localFont from "next/font/local";

export const dmSans = localFont({
  src: "../fonts/DMSans-latin.woff2",
  weight: "100 1000",
  style: "normal",
  variable: "--font-dm-sans",
  display: "swap",
});

export const manrope = localFont({
  src: "../fonts/Manrope-latin.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-manrope",
  display: "swap",
});
