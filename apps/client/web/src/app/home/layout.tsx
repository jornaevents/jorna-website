// Home is reachable at /client/home/ and at /client/ — the same page under two
// addresses. This points the deeper one at the app's root so they stop
// competing for the same search result.
//
// A layout rather than metadata on the page itself: home/page.tsx is a client
// component, and those can't export metadata.

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://jornaevents.com/client/" },
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
