// Home is reachable at /app/home/ and, since the root started serving it, at
// book.jornaevents.com as well — the same page under two addresses. This points
// the deeper one at the root so they stop competing for the same search result.
//
// A layout rather than metadata on the page itself: home/page.tsx is a client
// component, and those can't export metadata.

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://book.jornaevents.com/" },
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
