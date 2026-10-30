// The app's own root, jornaevents.com/client/ — a redirect now (see
// home/page.tsx): signed out to For clients, signed in to the dashboard.

import type { Metadata } from "next";
import HomePage from "./home/page";

// Both client roots stand in for the client landing page on the main site.
export const metadata: Metadata = {
  alternates: { canonical: "https://jornaevents.com/app/for-clients/" },
};

export default HomePage;
