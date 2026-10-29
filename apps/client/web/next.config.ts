import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is fully client-rendered (all data fetching happens in the browser
  // against the Jorna backend), so it exports to static files. They're served
  // at jornaevents.com/client, beside the vendor app at /app: the vendor
  // app's build copies this export into its own public/client (2026-10-29,
  // see docs/DECISIONS.md). book.jornaevents.com now only redirects here.
  output: "export",
  basePath: "/client",
  images: { unoptimized: true },
  // Emit /client/plan/index.html etc. so Cloudflare serves clean URLs.
  trailingSlash: true,
};

export default nextConfig;
