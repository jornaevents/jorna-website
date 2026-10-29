// The app's own root, jornaevents.com/client/. It renders Home itself rather
// than bouncing to /client/home/.
//
// This used to be book.jornaevents.com's root too, served by a rewrite. Since
// the app moved beside the vendor app (2026-10-29), the site root is the
// Welcome screen there, and book.jornaevents.com only redirects here.
//
// A server component, unlike the client shim it replaces, because only a server
// component can carry the canonical below. HomePage is still a client component
// and is rendered as one.

import type { Metadata } from "next";
import HomePage from "./home/page";

// One page, two URLs: /client/ and /client/home/. The app's root is the
// address worth having, so both point at it (see home/layout.tsx).
export const metadata: Metadata = {
  alternates: { canonical: "https://jornaevents.com/client/" },
};

export default HomePage;
