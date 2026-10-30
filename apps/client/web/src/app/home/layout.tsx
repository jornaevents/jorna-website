// /client/home/ only redirects now (home/page.tsx); its canonical names the
// page it stands in for, the client landing page on the main site.
//
// A layout rather than metadata on the page itself: home/page.tsx is a client
// component, and those can't export metadata.

import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "https://jornaevents.com/app/for-clients/" },
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
