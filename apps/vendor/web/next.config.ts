import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is fully client-rendered (all data fetching happens in the browser
  // against the Jorna backend), so it exports to static files that the same
  // Cloudflare Worker serving the marketing page hosts under /app.
  output: "export",
  basePath: "/app",
  images: { unoptimized: true },
  // Emit /app/plan/index.html etc. so Cloudflare serves clean URLs.
  trailingSlash: true,
  // The e2e suite runs a second dev server with escrow off (production's
  // setting) next to the escrow-on one; each needs its own build folder.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
