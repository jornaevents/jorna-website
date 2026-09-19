// The route the site's root serves.
//
// It used to be a door: a shim that rendered "Taking you in…" and immediately
// replaced the URL with /app/home/. Two hops to reach the product — the static
// root redirected here, and this redirected on — and a flash of nothing in
// between.
//
// Now it renders Home itself, which is what makes book.jornaevents.com able to
// *be* Home rather than bounce to it. Cloudflare serves this route's HTML at the
// root (see public/_redirects), and the client router agrees: with basePath
// "/app", removeBasePath("/") resolves to "/" — this route — so the markup that
// arrives and the markup React renders are the same page.
//
// The app still lives under /app, so following any link from here moves to
// /app/…. The root is where you land, not a second copy of the app.
//
// A server component, unlike the client shim it replaces, because only a server
// component can carry the canonical below. HomePage is still a client component
// and is rendered as one.

import type { Metadata } from "next";
import HomePage from "./home/page";

// One page, three URLs: this file is served at "/" by the rewrite and at
// "/app/" directly, and /app/home/ renders the same thing. Left alone they
// compete with each other for the same search result. The root is the address
// worth having, so it is the one they all point at — /app/home/ says the same
// (see home/layout.tsx).
export const metadata: Metadata = {
  alternates: { canonical: "https://book.jornaevents.com/" },
};

export default HomePage;
